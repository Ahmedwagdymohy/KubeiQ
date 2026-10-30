package main

// A small WebSocket client (RFC 6455), enough for the tunnel: binary and text messages, ping
// and pong, close codes. The standard library has no WebSocket client, and keeping the agent
// free of dependencies keeps it small and easy to audit.

import (
	"bufio"
	"context"
	"crypto/rand"
	"crypto/sha1" //nolint:gosec // required by the WebSocket handshake, not used for security
	"crypto/tls"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
)

const (
	textMessage   = 1
	binaryMessage = 2
	opContinue    = 0
	opClose       = 8
	opPing        = 9
	opPong        = 10

	wsGUID         = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	maxMessageSize = 1 << 20
	idleTimeout    = 90 * time.Second // KubeiQ's server pings every 20 seconds
)

// handshakeError is a failed upgrade: KubeiQ answered with an HTTP status instead.
type handshakeError struct{ status int }

func (e handshakeError) Error() string { return fmt.Sprintf("KubeiQ answered HTTP %d", e.status) }

// closeError is a close frame from KubeiQ, with its code (4401: the token was revoked).
type closeError struct {
	code   int
	reason string
}

func (e closeError) Error() string { return fmt.Sprintf("closed by KubeiQ (%d %s)", e.code, e.reason) }

type wsClient struct {
	conn    net.Conn
	reader  *bufio.Reader
	writeMu sync.Mutex
}

type dialOptions struct {
	header    http.Header
	tlsConfig *tls.Config
	proxy     func(*http.Request) (*url.URL, error)
	timeout   time.Duration
}

// dialWebSocket connects to a ws:// or wss:// URL, through an HTTP proxy when one is set.
func dialWebSocket(ctx context.Context, rawURL string, opts dialOptions) (*wsClient, error) {
	u, err := url.Parse(rawURL)
	if err != nil {
		return nil, err
	}
	secure := u.Scheme == "wss"
	if !secure && u.Scheme != "ws" {
		return nil, fmt.Errorf("unsupported scheme %q", u.Scheme)
	}
	host := u.Host
	if u.Port() == "" {
		host = net.JoinHostPort(u.Hostname(), map[bool]string{true: "443", false: "80"}[secure])
	}
	ctx, cancel := context.WithTimeout(ctx, opts.timeout)
	defer cancel()

	conn, err := dialThroughProxy(ctx, u, host, opts.proxy)
	if err != nil {
		return nil, err
	}
	if secure {
		cfg := &tls.Config{MinVersion: tls.VersionTLS12}
		if opts.tlsConfig != nil {
			cfg = opts.tlsConfig.Clone()
		}
		cfg.ServerName = u.Hostname()
		tlsConn := tls.Client(conn, cfg)
		if err := tlsConn.HandshakeContext(ctx); err != nil {
			conn.Close()
			return nil, err
		}
		conn = tlsConn
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	client, err := handshake(conn, u, opts.header)
	if err != nil {
		conn.Close()
		return nil, err
	}
	_ = conn.SetDeadline(time.Time{})
	return client, nil
}

func dialThroughProxy(
	ctx context.Context, u *url.URL, host string, proxy func(*http.Request) (*url.URL, error),
) (net.Conn, error) {
	var dialer net.Dialer
	var proxyURL *url.URL
	if proxy != nil {
		// The proxy settings are chosen by the http(s) form of the address.
		probe := &url.URL{Scheme: strings.Replace(u.Scheme, "ws", "http", 1), Host: u.Host}
		p, err := proxy(&http.Request{URL: probe})
		if err != nil {
			return nil, err
		}
		proxyURL = p
	}
	if proxyURL == nil {
		return dialer.DialContext(ctx, "tcp", host)
	}
	proxyHost := proxyURL.Host
	if proxyURL.Port() == "" {
		proxyHost = net.JoinHostPort(proxyURL.Hostname(), "80")
	}
	conn, err := dialer.DialContext(ctx, "tcp", proxyHost)
	if err != nil {
		return nil, err
	}
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	connect := &http.Request{
		Method: http.MethodConnect,
		URL:    &url.URL{Opaque: host},
		Host:   host,
		Header: http.Header{},
	}
	if user := proxyURL.User; user != nil {
		password, _ := user.Password()
		auth := base64.StdEncoding.EncodeToString([]byte(user.Username() + ":" + password))
		connect.Header.Set("Proxy-Authorization", "Basic "+auth)
	}
	if err := connect.Write(conn); err != nil {
		conn.Close()
		return nil, err
	}
	reader := bufio.NewReader(conn)
	resp, err := http.ReadResponse(reader, connect)
	if err != nil {
		conn.Close()
		return nil, err
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		conn.Close()
		return nil, fmt.Errorf("the proxy refused the connection: %s", resp.Status)
	}
	if reader.Buffered() > 0 {
		conn.Close()
		return nil, errors.New("the proxy sent data before the tunnel was ready")
	}
	_ = conn.SetDeadline(time.Time{})
	return conn, nil
}

func handshake(conn net.Conn, u *url.URL, header http.Header) (*wsClient, error) {
	nonce := make([]byte, 16)
	if _, err := rand.Read(nonce); err != nil {
		return nil, err
	}
	key := base64.StdEncoding.EncodeToString(nonce)
	path := u.RequestURI()
	req := &http.Request{
		Method:     http.MethodGet,
		URL:        &url.URL{Opaque: path},
		Host:       u.Host,
		Header:     header.Clone(),
		Proto:      "HTTP/1.1",
		ProtoMajor: 1,
		ProtoMinor: 1,
	}
	if req.Header == nil {
		req.Header = http.Header{}
	}
	req.Header.Set("Upgrade", "websocket")
	req.Header.Set("Connection", "Upgrade")
	req.Header.Set("Sec-WebSocket-Key", key)
	req.Header.Set("Sec-WebSocket-Version", "13")
	if err := req.Write(conn); err != nil {
		return nil, err
	}
	reader := bufio.NewReader(conn)
	resp, err := http.ReadResponse(reader, req)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode != http.StatusSwitchingProtocols {
		resp.Body.Close()
		return nil, handshakeError{status: resp.StatusCode}
	}
	if resp.Header.Get("Sec-WebSocket-Accept") != acceptKey(key) {
		return nil, errors.New("bad WebSocket handshake from KubeiQ")
	}
	return &wsClient{conn: conn, reader: reader}, nil
}

func acceptKey(key string) string {
	sum := sha1.Sum([]byte(key + wsGUID)) //nolint:gosec // fixed by RFC 6455
	return base64.StdEncoding.EncodeToString(sum[:])
}

// ReadMessage returns the next text or binary message. It answers pings itself.
func (c *wsClient) ReadMessage() (int, []byte, error) {
	var message []byte
	messageType := 0
	for {
		_ = c.conn.SetReadDeadline(time.Now().Add(idleTimeout))
		fin, opcode, payload, err := c.readFrame()
		if err != nil {
			return 0, nil, err
		}
		switch opcode {
		case opPing:
			if err := c.writeFrame(opPong, payload); err != nil {
				return 0, nil, err
			}
			continue
		case opPong:
			continue
		case opClose:
			code, reason := 1005, ""
			if len(payload) >= 2 {
				code = int(binary.BigEndian.Uint16(payload))
				reason = string(payload[2:])
			}
			_ = c.writeFrame(opClose, payload[:min(len(payload), 2)])
			return 0, nil, closeError{code: code, reason: reason}
		case textMessage, binaryMessage:
			if messageType != 0 {
				return 0, nil, errors.New("new message inside a fragmented one")
			}
			messageType = opcode
			message = payload
		case opContinue:
			if messageType == 0 {
				return 0, nil, errors.New("continuation without a message")
			}
			message = append(message, payload...)
		default:
			return 0, nil, fmt.Errorf("unknown WebSocket opcode %d", opcode)
		}
		if len(message) > maxMessageSize {
			return 0, nil, errors.New("message too large")
		}
		if fin {
			return messageType, message, nil
		}
	}
}

func (c *wsClient) readFrame() (bool, int, []byte, error) {
	var head [2]byte
	if _, err := io.ReadFull(c.reader, head[:]); err != nil {
		return false, 0, nil, err
	}
	fin := head[0]&0x80 != 0
	if head[0]&0x70 != 0 {
		return false, 0, nil, errors.New("unexpected WebSocket extension bits")
	}
	opcode := int(head[0] & 0x0f)
	if head[1]&0x80 != 0 {
		return false, 0, nil, errors.New("masked frame from the server")
	}
	length := uint64(head[1] & 0x7f)
	switch length {
	case 126:
		var ext [2]byte
		if _, err := io.ReadFull(c.reader, ext[:]); err != nil {
			return false, 0, nil, err
		}
		length = uint64(binary.BigEndian.Uint16(ext[:]))
	case 127:
		var ext [8]byte
		if _, err := io.ReadFull(c.reader, ext[:]); err != nil {
			return false, 0, nil, err
		}
		length = binary.BigEndian.Uint64(ext[:])
	}
	if opcode >= opClose && (length > 125 || !fin) {
		return false, 0, nil, errors.New("bad control frame")
	}
	if length > maxMessageSize {
		return false, 0, nil, errors.New("frame too large")
	}
	payload := make([]byte, length)
	if _, err := io.ReadFull(c.reader, payload); err != nil {
		return false, 0, nil, err
	}
	return fin, opcode, payload, nil
}

// WriteMessage sends one unfragmented message. Safe to call from several goroutines.
func (c *wsClient) WriteMessage(messageType int, data []byte) error {
	return c.writeFrame(messageType, data)
}

func (c *wsClient) writeFrame(opcode int, payload []byte) error {
	header := make([]byte, 0, 14)
	header = append(header, 0x80|byte(opcode))
	switch n := len(payload); {
	case n <= 125:
		header = append(header, 0x80|byte(n))
	case n <= 0xffff:
		header = append(header, 0x80|126)
		header = binary.BigEndian.AppendUint16(header, uint16(n))
	default:
		header = append(header, 0x80|127)
		header = binary.BigEndian.AppendUint64(header, uint64(n))
	}
	var mask [4]byte
	if _, err := rand.Read(mask[:]); err != nil {
		return err
	}
	header = append(header, mask[:]...)
	masked := make([]byte, len(payload))
	for i, b := range payload {
		masked[i] = b ^ mask[i%4]
	}
	c.writeMu.Lock()
	defer c.writeMu.Unlock()
	_ = c.conn.SetWriteDeadline(time.Now().Add(30 * time.Second))
	if _, err := c.conn.Write(append(header, masked...)); err != nil {
		return err
	}
	return nil
}

func (c *wsClient) Close() error {
	_ = c.writeFrame(opClose, []byte{0x03, 0xe8}) // 1000: normal closure
	return c.conn.Close()
}
