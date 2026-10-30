package main

import (
	"bytes"
	"encoding/binary"
	"io"
	"net/http"
	"strings"
	"sync"
	"testing"
	"time"
)

type message struct {
	kind int
	data []byte
}

// memConn is one end of an in-memory message connection.
type memConn struct {
	in     chan message
	out    chan message
	closed chan struct{}
	once   *sync.Once
}

func memPair() (*memConn, *memConn) {
	a, b := make(chan message, 1024), make(chan message, 1024)
	closed, once := make(chan struct{}), &sync.Once{}
	return &memConn{in: a, out: b, closed: closed, once: once},
		&memConn{in: b, out: a, closed: closed, once: once}
}

func (c *memConn) ReadMessage() (int, []byte, error) {
	select {
	case m := <-c.in:
		return m.kind, m.data, nil
	case <-c.closed:
		return 0, nil, io.EOF
	}
}

func (c *memConn) WriteMessage(kind int, data []byte) error {
	select {
	case <-c.closed:
		return io.ErrClosedPipe
	default:
	}
	c.out <- message{kind, append([]byte(nil), data...)}
	return nil
}

func (c *memConn) Close() error {
	c.once.Do(func() { close(c.closed) })
	return nil
}

// opener plays KubeiQ's side of the protocol.
type opener struct {
	t *testing.T
	c *memConn
}

func (o opener) send(kind byte, id uint32, payload []byte) {
	o.t.Helper()
	if err := o.c.WriteMessage(binaryMessage, encodeFrame(frame{kind, id, payload})); err != nil {
		o.t.Fatal(err)
	}
}

func (o opener) next() frame {
	o.t.Helper()
	for {
		kind, data, err := o.c.ReadMessage()
		if err != nil {
			o.t.Fatal(err)
		}
		if kind != binaryMessage {
			continue
		}
		f, err := decodeFrame(data)
		if err != nil {
			o.t.Fatal(err)
		}
		return f
	}
}

// response collects one stream's data until the agent closes it, ignoring other frames.
func (o opener) response(id uint32) string {
	o.t.Helper()
	var out bytes.Buffer
	deadline := time.After(5 * time.Second)
	for {
		select {
		case <-deadline:
			o.t.Fatalf("no close on stream %d; got %q", id, out.String())
		default:
		}
		f := o.next()
		if f.stream != id {
			continue
		}
		switch f.kind {
		case kindData:
			out.Write(f.payload)
		case kindClose, kindReset:
			return out.String()
		}
	}
}

func credit(n uint32) []byte {
	b := make([]byte, 4)
	binary.BigEndian.PutUint32(b, n)
	return b
}

func serve(t *testing.T, handler http.Handler) (opener, *Mux) {
	t.Helper()
	ours, theirs := memPair()
	m := newMux(theirs)
	go func() { _ = m.Run() }()
	server := &http.Server{Handler: handler, ReadHeaderTimeout: 5 * time.Second}
	go func() { _ = server.Serve(muxListener{m}) }()
	t.Cleanup(func() { _ = server.Close(); m.Close() })
	return opener{t, ours}, m
}

func TestFrameRoundTrip(t *testing.T) {
	f := frame{kind: kindData, stream: 7, payload: []byte("hi")}
	got, err := decodeFrame(encodeFrame(f))
	if err != nil || got.kind != f.kind || got.stream != 7 || string(got.payload) != "hi" {
		t.Fatalf("round trip: %+v %v", got, err)
	}
	tooLarge := append([]byte{kindData, 0, 0, 0, 1}, make([]byte, maxData+1)...)
	shortWindow := []byte{kindWindow, 0, 0, 0, 1, 1}
	for _, bad := range [][]byte{{1, 0, 0}, {9, 0, 0, 0, 1}, shortWindow, tooLarge} {
		if _, err := decodeFrame(bad); err == nil {
			t.Errorf("decoded a bad frame %v", bad[:min(len(bad), 6)])
		}
	}
}

func TestStreamServesHTTP(t *testing.T) {
	o, _ := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = io.WriteString(w, "hello "+r.URL.Path)
	}))
	o.send(kindOpen, 1, nil)
	o.send(kindData, 1, []byte("GET /pods HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"))
	got := o.response(1)
	if !strings.Contains(got, "200 OK") || !strings.Contains(got, "hello /pods") {
		t.Fatalf("response: %q", got)
	}
}

func TestStreamsAreConcurrent(t *testing.T) {
	release := make(chan struct{})
	o, _ := serve(t, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/slow" {
			<-release // answers only after /fast was served on another stream
		} else {
			close(release)
		}
		_, _ = io.WriteString(w, r.URL.Path)
	}))
	o.send(kindOpen, 1, nil)
	o.send(kindData, 1, []byte("GET /slow HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"))
	o.send(kindOpen, 2, nil)
	o.send(kindData, 2, []byte("GET /fast HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n"))
	bodies := map[uint32]*bytes.Buffer{1: {}, 2: {}}
	closed := 0
	for closed < 2 {
		f := o.next()
		switch f.kind {
		case kindData:
			bodies[f.stream].Write(f.payload)
		case kindClose:
			closed++
		}
	}
	if !strings.HasSuffix(bodies[1].String(), "/slow") || !strings.HasSuffix(bodies[2].String(), "/fast") {
		t.Fatalf("bodies: %q %q", bodies[1], bodies[2])
	}
}

func TestWriteWaitsForCredit(t *testing.T) {
	ours, theirs := memPair()
	m := newMux(theirs)
	go func() { _ = m.Run() }()
	defer m.Close()
	o := opener{t, ours}
	o.send(kindOpen, 1, nil)
	s, err := m.Accept()
	if err != nil {
		t.Fatal(err)
	}
	go func() { _, _ = s.Write(make([]byte, initialWindow+10)) }()
	received := 0
	for received < initialWindow {
		f := o.next()
		received += len(f.payload)
	}
	select {
	case msg := <-ours.in:
		t.Fatalf("sent past the window: %d bytes", len(msg.data))
	case <-time.After(100 * time.Millisecond):
	}
	o.send(kindWindow, 1, credit(10))
	if f := o.next(); f.kind != kindData || len(f.payload) != 10 {
		t.Fatalf("after credit: %+v", f)
	}
}

func TestPeerOverflowResetsTheStream(t *testing.T) {
	ours, theirs := memPair()
	m := newMux(theirs)
	go func() { _ = m.Run() }()
	defer m.Close()
	o := opener{t, ours}
	o.send(kindOpen, 1, nil)
	if _, err := m.Accept(); err != nil {
		t.Fatal(err)
	}
	chunk := make([]byte, maxData)
	for i := 0; i <= initialWindow/maxData; i++ {
		o.send(kindData, 1, chunk)
	}
	if f := o.next(); f.kind != kindReset || f.stream != 1 {
		t.Fatalf("want a reset, got %+v", f)
	}
}

func TestTunnelCloseResetsStreams(t *testing.T) {
	ours, theirs := memPair()
	m := newMux(theirs)
	done := make(chan struct{})
	go func() { _ = m.Run(); close(done) }()
	o := opener{t, ours}
	o.send(kindOpen, 1, nil)
	s, err := m.Accept()
	if err != nil {
		t.Fatal(err)
	}
	_ = ours.Close()
	<-done
	if _, err := s.Read(make([]byte, 10)); err != errStreamReset {
		t.Fatalf("read after close: %v", err)
	}
	if _, err := m.Accept(); err != errTunnelClosed {
		t.Fatalf("accept after close: %v", err)
	}
}
