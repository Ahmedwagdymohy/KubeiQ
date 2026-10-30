package main

// The reverse proxy every tunnel stream is served by. It forwards to the in-cluster API server
// with the agent's own ServiceAccount token, so KubeiQ can never do more than the agent's role
// allows, and it never forwards credentials or impersonation headers that came from KubeiQ.

import (
	"crypto/tls"
	"crypto/x509"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"path"
	"strings"
	"sync"
	"time"
)

const (
	saDir          = "/var/run/secrets/kubernetes.io/serviceaccount"
	tokenRefresh   = time.Minute
	maxIdlePerHost = 32
)

// cluster is the in-cluster API server and the agent's credentials for it.
type cluster struct {
	server    *url.URL
	transport *http.Transport
	tokenFile string

	mu        sync.Mutex
	token     string
	tokenRead time.Time
}

func inCluster() (*cluster, error) {
	host, port := os.Getenv("KUBERNETES_SERVICE_HOST"), os.Getenv("KUBERNETES_SERVICE_PORT")
	if host == "" || port == "" {
		return nil, fmt.Errorf("not running in a cluster (KUBERNETES_SERVICE_HOST is not set)")
	}
	ca, err := os.ReadFile(path.Join(saDir, "ca.crt"))
	if err != nil {
		return nil, fmt.Errorf("reading the cluster CA: %w", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(ca) {
		return nil, fmt.Errorf("the cluster CA has no certificates")
	}
	server := &url.URL{Scheme: "https", Host: joinHostPort(host, port)}
	return newCluster(server, apiTransport(pool), path.Join(saDir, "token")), nil
}

func joinHostPort(host, port string) string {
	if strings.Contains(host, ":") {
		return "[" + host + "]:" + port
	}
	return host + ":" + port
}

func apiTransport(pool *x509.CertPool) *http.Transport {
	return &http.Transport{
		TLSClientConfig:     &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12},
		Proxy:               nil, // the API server is in this cluster: never through a proxy
		ForceAttemptHTTP2:   false,
		TLSNextProto:        map[string]func(string, *tls.Conn) http.RoundTripper{}, // HTTP/1.1: upgrades (exec) need it
		MaxIdleConnsPerHost: maxIdlePerHost,
		IdleConnTimeout:     90 * time.Second,
		TLSHandshakeTimeout: 10 * time.Second,
	}
}

func newCluster(server *url.URL, transport *http.Transport, tokenFile string) *cluster {
	return &cluster{server: server, transport: transport, tokenFile: tokenFile}
}

// bearer is the ServiceAccount token, re-read as the kubelet rotates it.
func (c *cluster) bearer() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token == "" || time.Since(c.tokenRead) > tokenRefresh {
		if data, err := os.ReadFile(c.tokenFile); err == nil {
			c.token = strings.TrimSpace(string(data))
			c.tokenRead = time.Now()
		} else {
			slog.Warn("cannot read the service account token", "error", err)
		}
	}
	return c.token
}

// do sends one request of the agent's own (version, saving its token).
func (c *cluster) do(req *http.Request) (*http.Response, error) {
	req.URL.Scheme, req.URL.Host = c.server.Scheme, c.server.Host
	req.Header.Set("Authorization", "Bearer "+c.bearer())
	return (&http.Client{Transport: c.transport, Timeout: 15 * time.Second}).Do(req)
}

// proxy serves KubeiQ's requests. denied paths are refused before reaching the API server.
func (c *cluster) proxy(denied []string) http.Handler {
	rp := &httputil.ReverseProxy{
		Rewrite: func(r *httputil.ProxyRequest) {
			r.SetURL(c.server)
			for key := range r.Out.Header {
				lower := strings.ToLower(key)
				if lower == "authorization" || strings.HasPrefix(lower, "impersonate-") {
					r.Out.Header.Del(key)
				}
			}
			r.Out.Header.Set("Authorization", "Bearer "+c.bearer())
		},
		Transport:     c.transport,
		FlushInterval: -1, // watches and log follows stream every chunk
		ErrorHandler: func(w http.ResponseWriter, _ *http.Request, err error) {
			slog.Warn("API server request failed", "error", err)
			writeStatus(w, http.StatusBadGateway, "The KubeiQ agent cannot reach this cluster's API server")
		},
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// r.URL.Path is decoded, as the API server reads it, so %2F tricks are caught too.
		if isDenied(path.Clean("/"+r.URL.Path), denied) {
			writeStatus(w, http.StatusForbidden, "The KubeiQ agent does not forward this request")
			return
		}
		rp.ServeHTTP(w, r)
	})
}

func isDenied(clean string, denied []string) bool {
	for _, d := range denied {
		if clean == d || strings.HasPrefix(clean, d+"/") {
			return true
		}
	}
	return false
}

// deniedPaths are the agent's own credentials: its Secret and tokens for its ServiceAccount.
func deniedPaths(namespace, secret, serviceAccount string) []string {
	ns := "/api/v1/namespaces/" + namespace
	return []string{ns + "/secrets/" + secret, ns + "/serviceaccounts/" + serviceAccount + "/token"}
}

// writeStatus answers like the API server does, so KubeiQ's client shows the message.
func writeStatus(w http.ResponseWriter, code int, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(code)
	_ = json.NewEncoder(w).Encode(map[string]any{
		"kind": "Status", "apiVersion": "v1", "status": "Failure",
		"message": message, "reason": strings.ReplaceAll(http.StatusText(code), " ", ""), "code": code,
	})
}
