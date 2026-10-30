package main

// Tunnel framing and multiplexing, the accepting side (ADR 0017). KubeiQ implements the same
// format in backend/src/kubeiq/tunnel/protocol.py and opens the streams.
//
// Every binary WebSocket message is one frame: a 1-byte type, a 4-byte big-endian stream id,
// then the payload. A sender may have at most initialWindow unacknowledged bytes in flight per
// stream; the receiver returns credit with WINDOW frames as it hands data on.

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"net"
	"sync"
	"time"
)

const (
	kindOpen   = 1
	kindData   = 2
	kindClose  = 3
	kindReset  = 4
	kindWindow = 5

	headerSize    = 5
	maxData       = 32 * 1024
	initialWindow = 256 * 1024
	maxStreams    = 1024
)

var (
	errTunnelClosed = errors.New("tunnel closed")
	errStreamReset  = errors.New("stream reset")
)

// wsConn is a message connection: the WebSocket client in ws.go (an in-memory pair in tests).
type wsConn interface {
	ReadMessage() (int, []byte, error)
	WriteMessage(messageType int, data []byte) error
	Close() error
}

type frame struct {
	kind    byte
	stream  uint32
	payload []byte
}

func encodeFrame(f frame) []byte {
	out := make([]byte, headerSize+len(f.payload))
	out[0] = f.kind
	binary.BigEndian.PutUint32(out[1:5], f.stream)
	copy(out[headerSize:], f.payload)
	return out
}

func decodeFrame(data []byte) (frame, error) {
	if len(data) < headerSize {
		return frame{}, errors.New("frame too short")
	}
	f := frame{kind: data[0], stream: binary.BigEndian.Uint32(data[1:5]), payload: data[headerSize:]}
	switch f.kind {
	case kindOpen, kindClose, kindReset:
	case kindData:
		if len(f.payload) > maxData {
			return frame{}, errors.New("data frame too large")
		}
	case kindWindow:
		if len(f.payload) != 4 {
			return frame{}, errors.New("bad window frame")
		}
	default:
		return frame{}, errors.New("unknown frame type")
	}
	return f, nil
}

// Mux carries many streams over one WebSocket.
type Mux struct {
	conn    wsConn
	writeMu sync.Mutex

	mu      sync.Mutex
	streams map[uint32]*Stream
	accept  chan *Stream
	closed  chan struct{}
	once    sync.Once
}

func newMux(conn wsConn) *Mux {
	return &Mux{
		conn:    conn,
		streams: map[uint32]*Stream{},
		accept:  make(chan *Stream, 64),
		closed:  make(chan struct{}),
	}
}

func (m *Mux) send(f frame) error {
	select {
	case <-m.closed:
		return errTunnelClosed
	default:
	}
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	if err := m.conn.WriteMessage(binaryMessage, encodeFrame(f)); err != nil {
		m.shutdown()
		return errTunnelClosed
	}
	return nil
}

func (m *Mux) sendText(text string) error {
	m.writeMu.Lock()
	defer m.writeMu.Unlock()
	return m.conn.WriteMessage(textMessage, []byte(text))
}

// Run reads frames until the connection fails or closes. Then every stream is reset.
func (m *Mux) Run() error {
	defer m.shutdown()
	for {
		kind, data, err := m.conn.ReadMessage()
		if err != nil {
			return err
		}
		if kind != binaryMessage {
			continue
		}
		f, err := decodeFrame(data)
		if err != nil {
			return err
		}
		if err := m.dispatch(f); err != nil {
			return err
		}
	}
}

func (m *Mux) dispatch(f frame) error {
	if f.kind == kindOpen {
		m.mu.Lock()
		_, exists := m.streams[f.stream]
		full := len(m.streams) >= maxStreams
		var s *Stream
		if !exists && !full {
			s = newStream(m, f.stream)
			m.streams[f.stream] = s
		}
		m.mu.Unlock()
		if exists {
			return errors.New("stream opened twice")
		}
		if full {
			return m.send(frame{kind: kindReset, stream: f.stream, payload: []byte("too many streams")})
		}
		select {
		case m.accept <- s:
		case <-m.closed:
		}
		return nil
	}
	m.mu.Lock()
	s := m.streams[f.stream]
	m.mu.Unlock()
	if s == nil {
		return nil // a late frame for a stream that already ended
	}
	switch f.kind {
	case kindData:
		s.onData(f.payload)
	case kindClose:
		s.onClose()
	case kindWindow:
		s.onWindow(int(binary.BigEndian.Uint32(f.payload)))
	case kindReset:
		s.onReset()
	}
	return nil
}

// Accept waits for the next stream KubeiQ opens.
func (m *Mux) Accept() (*Stream, error) {
	select {
	case s := <-m.accept:
		return s, nil
	case <-m.closed:
		return nil, errTunnelClosed
	}
}

func (m *Mux) Close() {
	m.shutdown()
	_ = m.conn.Close()
}

func (m *Mux) forget(id uint32) {
	m.mu.Lock()
	delete(m.streams, id)
	m.mu.Unlock()
}

func (m *Mux) shutdown() {
	m.once.Do(func() {
		close(m.closed)
		m.mu.Lock()
		streams := make([]*Stream, 0, len(m.streams))
		for _, s := range m.streams {
			streams = append(streams, s)
		}
		m.mu.Unlock()
		for _, s := range streams {
			s.onReset()
		}
	})
}

// Stream is one byte stream of the tunnel (one HTTP connection of KubeiQ's client).
type Stream struct {
	id uint32
	m  *Mux

	mu         sync.Mutex
	cond       *sync.Cond
	inbox      bytes.Buffer
	eof        bool
	reset      bool
	sentClose  bool
	sendWindow int
	recvWindow int
}

func newStream(m *Mux, id uint32) *Stream {
	s := &Stream{id: id, m: m, sendWindow: initialWindow, recvWindow: initialWindow}
	s.cond = sync.NewCond(&s.mu)
	return s
}

func (s *Stream) Read(p []byte) (int, error) {
	s.mu.Lock()
	for s.inbox.Len() == 0 && !s.eof && !s.reset {
		s.cond.Wait()
	}
	if s.reset {
		s.mu.Unlock()
		return 0, errStreamReset
	}
	if s.inbox.Len() == 0 {
		s.mu.Unlock()
		return 0, io.EOF
	}
	n, _ := s.inbox.Read(p)
	s.recvWindow += n
	s.mu.Unlock()
	credit := make([]byte, 4)
	binary.BigEndian.PutUint32(credit, uint32(n))
	_ = s.m.send(frame{kind: kindWindow, stream: s.id, payload: credit})
	return n, nil
}

func (s *Stream) Write(p []byte) (int, error) {
	written := 0
	for len(p) > 0 {
		s.mu.Lock()
		for s.sendWindow <= 0 && !s.reset {
			s.cond.Wait()
		}
		if s.reset || s.sentClose {
			s.mu.Unlock()
			return written, errStreamReset
		}
		n := min(len(p), maxData, s.sendWindow)
		s.sendWindow -= n
		s.mu.Unlock()
		if err := s.m.send(frame{kind: kindData, stream: s.id, payload: p[:n]}); err != nil {
			return written, err
		}
		written += n
		p = p[n:]
	}
	return written, nil
}

// CloseWrite tells KubeiQ no more data comes from this side.
func (s *Stream) CloseWrite() {
	s.mu.Lock()
	if s.sentClose || s.reset {
		s.mu.Unlock()
		return
	}
	s.sentClose = true
	done := s.eof
	s.mu.Unlock()
	_ = s.m.send(frame{kind: kindClose, stream: s.id})
	if done {
		s.m.forget(s.id)
	}
}

// Abort resets the stream in both directions.
func (s *Stream) Abort() {
	s.mu.Lock()
	was := s.reset
	s.reset = true
	s.cond.Broadcast()
	s.mu.Unlock()
	s.m.forget(s.id)
	if !was {
		_ = s.m.send(frame{kind: kindReset, stream: s.id})
	}
}

func (s *Stream) onData(p []byte) {
	s.mu.Lock()
	if len(p) > s.recvWindow || s.eof {
		s.mu.Unlock()
		s.Abort() // the peer ignored flow control
		return
	}
	s.recvWindow -= len(p)
	s.inbox.Write(p)
	s.cond.Broadcast()
	s.mu.Unlock()
}

func (s *Stream) onClose() {
	s.mu.Lock()
	s.eof = true
	done := s.sentClose
	s.cond.Broadcast()
	s.mu.Unlock()
	if done {
		s.m.forget(s.id)
	}
}

func (s *Stream) onWindow(credit int) {
	s.mu.Lock()
	s.sendWindow += credit
	s.cond.Broadcast()
	s.mu.Unlock()
}

func (s *Stream) onReset() {
	s.mu.Lock()
	s.reset = true
	s.cond.Broadcast()
	s.mu.Unlock()
	s.m.forget(s.id)
}

// muxListener hands each stream to an http.Server as a net.Conn. A net.Pipe sits in between,
// so the server gets real deadlines, and copying the pipe gives backpressure for free.
type muxListener struct {
	m *Mux
}

func (l muxListener) Accept() (net.Conn, error) {
	s, err := l.m.Accept()
	if err != nil {
		return nil, err
	}
	server, ours := net.Pipe()
	go func() { // KubeiQ -> the HTTP server
		_, _ = io.Copy(ours, s)
		_ = ours.Close()
	}()
	go func() { // the HTTP server -> KubeiQ
		_, err := io.Copy(s, ours)
		if err != nil && !errors.Is(err, io.ErrClosedPipe) {
			s.Abort()
			return
		}
		s.CloseWrite()
		// The server is done with this connection; wait briefly for KubeiQ's close, then drop.
		time.AfterFunc(30*time.Second, s.Abort)
	}()
	return pipeConn{server}, nil
}

func (l muxListener) Close() error   { l.m.Close(); return nil }
func (l muxListener) Addr() net.Addr { return tunnelAddr{} }

type tunnelAddr struct{}

func (tunnelAddr) Network() string { return "tunnel" }
func (tunnelAddr) String() string  { return "kubeiq-tunnel" }

// pipeConn reports tunnel addresses (net.Pipe returns "pipe" for both).
type pipeConn struct{ net.Conn }

func (pipeConn) RemoteAddr() net.Addr { return tunnelAddr{} }
