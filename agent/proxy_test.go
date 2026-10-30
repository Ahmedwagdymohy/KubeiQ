package main

import (
	"crypto/x509"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func testCluster(t *testing.T, handler http.HandlerFunc) *cluster {
	t.Helper()
	api := httptest.NewTLSServer(handler)
	t.Cleanup(api.Close)
	pool := x509.NewCertPool()
	pool.AddCert(api.Certificate())
	tokenFile := filepath.Join(t.TempDir(), "token")
	if err := os.WriteFile(tokenFile, []byte("sa-token\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	server, _ := url.Parse(api.URL)
	return newCluster(server, apiTransport(pool), tokenFile)
}

func TestProxySendsOnlyTheAgentsToken(t *testing.T) {
	var seen http.Header
	c := testCluster(t, func(w http.ResponseWriter, r *http.Request) {
		seen = r.Header.Clone()
		_, _ = w.Write([]byte(`{"kind":"PodList"}`))
	})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/pods", nil)
	req.Header.Set("Authorization", "Bearer gateway-secret")
	req.Header.Set("Impersonate-User", "system:admin")
	req.Header.Set("Impersonate-Group", "system:masters")
	rec := httptest.NewRecorder()
	c.proxy(deniedPaths("kubeiq-agent", "kubeiq-agent", "kubeiq-agent")).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
	if got := seen.Get("Authorization"); got != "Bearer sa-token" {
		t.Fatalf("authorization sent: %q", got)
	}
	for key := range seen {
		if strings.HasPrefix(strings.ToLower(key), "impersonate-") {
			t.Fatalf("forwarded %s", key)
		}
	}
}

func TestProxyRefusesTheAgentsOwnCredentials(t *testing.T) {
	called := false
	c := testCluster(t, func(w http.ResponseWriter, r *http.Request) { called = true })
	h := c.proxy(deniedPaths("kubeiq-agent", "kubeiq-agent", "kubeiq-agent"))
	for _, target := range []string{
		"/api/v1/namespaces/kubeiq-agent/secrets/kubeiq-agent",
		"/api/v1/namespaces/kubeiq-agent/secrets%2Fkubeiq-agent",
		"/api/v1/namespaces/kubeiq-agent/secrets/x/../kubeiq-agent",
		"/api/v1/namespaces/kubeiq-agent/serviceaccounts/kubeiq-agent/token",
	} {
		rec := httptest.NewRecorder()
		h.ServeHTTP(rec, httptest.NewRequest(http.MethodPatch, target, nil))
		if rec.Code != http.StatusForbidden {
			t.Errorf("%s: status %d", target, rec.Code)
		}
	}
	if called {
		t.Fatal("a refused request reached the API server")
	}
}

func TestProxyNamesAnUnreachableAPIServer(t *testing.T) {
	c := testCluster(t, func(http.ResponseWriter, *http.Request) {})
	c.server, _ = url.Parse("https://127.0.0.1:1")
	rec := httptest.NewRecorder()
	c.proxy(nil).ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/version", nil))
	if rec.Code != http.StatusBadGateway || !strings.Contains(rec.Body.String(), "API server") {
		t.Fatalf("status %d: %s", rec.Code, rec.Body)
	}
}

func TestUnauthorizedErrors(t *testing.T) {
	check := func(err error, want bool) {
		t.Helper()
		if got := isUnauthorized(err); got != want {
			t.Errorf("%v: got %v", err, got)
		}
	}
	check(statusError{401}, true)
	check(statusError{502}, false)
	check(handshakeError{403}, true)
	check(handshakeError{502}, false)
	check(closeError{code: 4401}, true)
	check(closeError{code: 1000}, false)
	check(errors.New("connection reset"), false)
}

func TestTunnelURL(t *testing.T) {
	check := func(raw, want string) {
		t.Helper()
		u, _ := url.Parse(strings.TrimRight(raw, "/"))
		a := &agent{cfg: config{url: u}}
		if got := a.tunnelURL(); got != want {
			t.Errorf("%s: %s", raw, got)
		}
	}
	check("https://kubeiq.example.com", "wss://kubeiq.example.com/api/v1/agent/connect")
	check("http://10.0.0.5:3000", "ws://10.0.0.5:3000/api/v1/agent/connect")
	check("https://example.com/kubeiq/", "wss://example.com/kubeiq/api/v1/agent/connect")
}

func TestBackoffGrowsAndCaps(t *testing.T) {
	b := backoff{min: time.Second, max: 8 * time.Second}
	var last time.Duration
	for i := 0; i < 10; i++ {
		last = b.next()
	}
	if last < 6*time.Second || last > 10*time.Second {
		t.Fatalf("capped backoff out of range: %v", last)
	}
	b.reset()
	if first := b.next(); first > 2*time.Second {
		t.Fatalf("after reset: %v", first)
	}
}
