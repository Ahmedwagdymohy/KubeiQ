package main

import (
	"bufio"
	"context"
	"encoding/binary"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
	"time"
)

// serverFrame writes an unmasked frame, as a server does.
func serverFrame(w io.Writer, opcode byte, payload []byte) {
	_, _ = w.Write([]byte{0x80 | opcode, byte(len(payload))})
	_, _ = w.Write(payload)
}

// clientFrame reads one masked frame from the client.
func clientFrame(t *testing.T, r *bufio.Reader) (byte, []byte) {
	t.Helper()
	head := make([]byte, 2)
	if _, err := io.ReadFull(r, head); err != nil {
		t.Fatal(err)
	}
	if head[1]&0x80 == 0 {
		t.Fatal("client frame not masked")
	}
	length := int(head[1] & 0x7f)
	if length == 126 {
		ext := make([]byte, 2)
		_, _ = io.ReadFull(r, ext)
		length = int(binary.BigEndian.Uint16(ext))
	}
	mask := make([]byte, 4)
	_, _ = io.ReadFull(r, mask)
	payload := make([]byte, length)
	_, _ = io.ReadFull(r, payload)
	for i := range payload {
		payload[i] ^= mask[i%4]
	}
	return head[0] & 0x0f, payload
}

func TestWebSocketClient(t *testing.T) {
	got := make(chan string, 4)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer kqa_test" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		conn, rw, err := w.(http.Hijacker).Hijack()
		if err != nil {
			t.Error(err)
			return
		}
		defer conn.Close()
		key := r.Header.Get("Sec-WebSocket-Key")
		_, _ = rw.WriteString("HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n" +
			"Connection: Upgrade\r\nSec-WebSocket-Accept: " + acceptKey(key) + "\r\n\r\n")
		serverFrame(rw, opPing, []byte("p"))
		serverFrame(rw, binaryMessage, []byte("frame"))
		_ = rw.Flush()
		op, payload := clientFrame(t, rw.Reader)
		got <- string(rune('0'+op)) + string(payload) // the pong
		op, payload = clientFrame(t, rw.Reader)
		got <- string(rune('0'+op)) + string(payload) // the client's message
		serverFrame(rw, opClose, []byte{0x11, 0x31}) // 4401
		_ = rw.Flush()
		time.Sleep(50 * time.Millisecond)
	}))
	defer srv.Close()
	addr := "ws" + strings.TrimPrefix(srv.URL, "http") + "/api/v1/agent/connect"

	header := http.Header{}
	header.Set("Authorization", "Bearer wrong")
	_, err := dialWebSocket(context.Background(), addr, dialOptions{header: header, timeout: 5 * time.Second})
	if !isUnauthorized(err) {
		t.Fatalf("a refused handshake: %v", err)
	}

	header.Set("Authorization", "Bearer kqa_test")
	c, err := dialWebSocket(context.Background(), addr, dialOptions{header: header, timeout: 5 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	kind, data, err := c.ReadMessage()
	if err != nil || kind != binaryMessage || string(data) != "frame" {
		t.Fatalf("read: %d %q %v", kind, data, err)
	}
	if err := c.WriteMessage(textMessage, []byte("hello")); err != nil {
		t.Fatal(err)
	}
	if pong := <-got; pong != ":p" { // opcode 10 is ':' after '0'+10
		t.Fatalf("pong: %q", pong)
	}
	if msg := <-got; msg != "1hello" {
		t.Fatalf("message: %q", msg)
	}
	_, _, err = c.ReadMessage()
	if !isUnauthorized(err) {
		t.Fatalf("close 4401 should read as unauthorized: %v", err)
	}
	_ = c.Close()
}

func TestProxyTunnel(t *testing.T) {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	defer ln.Close()
	go func() { // a proxy that only accepts CONNECT
		conn, err := ln.Accept()
		if err != nil {
			return
		}
		defer conn.Close()
		req, err := http.ReadRequest(bufio.NewReader(conn))
		if err != nil || req.Method != http.MethodConnect || req.Host != "kubeiq.example.com:443" {
			_, _ = conn.Write([]byte("HTTP/1.1 400 Bad Request\r\n\r\n"))
			return
		}
		_, _ = conn.Write([]byte("HTTP/1.1 200 OK\r\n\r\n"))
	}()
	proxyURL := mustURL(t, "http://"+ln.Addr().String())
	u := mustURL(t, "wss://kubeiq.example.com/api/v1/agent/connect")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	conn, err := dialThroughProxy(ctx, u, "kubeiq.example.com:443", http.ProxyURL(proxyURL))
	if err != nil {
		t.Fatalf("CONNECT through the proxy: %v", err)
	}
	conn.Close()
}

func mustURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatal(err)
	}
	return u
}
