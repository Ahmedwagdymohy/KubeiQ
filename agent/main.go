// Command kubeiq-agent connects a Kubernetes cluster to KubeiQ from the inside (ADR 0017).
//
// It dials KubeiQ over one WebSocket (outbound HTTPS only, no inbound port), and serves the
// Kubernetes API requests KubeiQ sends through it with its own read-only ServiceAccount.
package main

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"log/slog"
	"math/rand/v2"
	"net/http"
	"net/url"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

// version is set at build time: -ldflags "-X main.version=1.2.3".
var version = "dev"

const (
	protocolVersion    = 1
	defaultCredentials = "/etc/kubeiq-agent"
	retryRejected      = 5 * time.Minute
	stableSession      = time.Minute
)

type config struct {
	url            *url.URL // where KubeiQ is, e.g. https://kubeiq.example.com
	credentials    string   // directory with the Secret's files: code, token
	namespace      string
	secret         string
	serviceAccount string
	caBundle       string // extra CAs for KubeiQ's certificate (a private CA)
}

func loadConfig() (config, error) {
	raw := strings.TrimRight(os.Getenv("KUBEIQ_URL"), "/")
	u, err := url.Parse(raw)
	if raw == "" || err != nil || u.Host == "" || (u.Scheme != "https" && u.Scheme != "http") {
		return config{}, fmt.Errorf("KUBEIQ_URL must be KubeiQ's address, such as https://kubeiq.example.com")
	}
	return config{
		url:            u,
		credentials:    envOr("KUBEIQ_AGENT_CREDENTIALS", defaultCredentials),
		namespace:      envOr("KUBEIQ_AGENT_NAMESPACE", "kubeiq-agent"),
		secret:         envOr("KUBEIQ_AGENT_SECRET", "kubeiq-agent"),
		serviceAccount: envOr("KUBEIQ_AGENT_SERVICE_ACCOUNT", "kubeiq-agent"),
		caBundle:       os.Getenv("KUBEIQ_CA_BUNDLE"),
	}, nil
}

func envOr(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
}

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, nil)))
	if len(os.Args) > 1 && os.Args[1] == "version" {
		fmt.Println(version)
		return
	}
	cfg, err := loadConfig()
	if err != nil {
		slog.Error(err.Error())
		os.Exit(2)
	}
	k8s, err := inCluster()
	if err != nil {
		slog.Error("cannot use the in-cluster API server", "error", err)
		os.Exit(2)
	}
	tlsConfig, err := kubeiqTLS(cfg.caBundle)
	if err != nil {
		slog.Error("cannot load the CA bundle", "error", err)
		os.Exit(2)
	}
	if cfg.url.Scheme == "http" {
		slog.Warn("KubeiQ's address is plain HTTP: use https:// for anything but a local test")
	}
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGTERM, os.Interrupt)
	defer stop()
	a := &agent{cfg: cfg, k8s: k8s, tls: tlsConfig}
	slog.Info("KubeiQ agent starting", "version", version, "kubeiq", cfg.url.String())
	a.run(ctx)
}

// kubeiqTLS trusts the system CAs plus an optional bundle. There is no way to skip verification.
func kubeiqTLS(bundle string) (*tls.Config, error) {
	pool, err := x509.SystemCertPool()
	if err != nil || pool == nil {
		pool = x509.NewCertPool()
	}
	if bundle != "" {
		pem, err := os.ReadFile(bundle)
		if err != nil {
			return nil, err
		}
		if !pool.AppendCertsFromPEM(pem) {
			return nil, errors.New("the CA bundle has no certificates")
		}
	}
	return &tls.Config{RootCAs: pool, MinVersion: tls.VersionTLS12}, nil
}

type agent struct {
	cfg   config
	k8s   *cluster
	tls   *tls.Config
	token string
}

type credentials struct{ code, token string }

// readCredentials reads the mounted Secret on every attempt, so applying a new install command
// takes effect without restarting the pod.
func (a *agent) readCredentials() credentials {
	read := func(name, env string) string {
		if data, err := os.ReadFile(filepath.Join(a.cfg.credentials, name)); err == nil {
			if value := strings.TrimSpace(string(data)); value != "" {
				return value
			}
		}
		return strings.TrimSpace(os.Getenv(env))
	}
	return credentials{code: read("code", "KUBEIQ_AGENT_CODE"), token: read("token", "KUBEIQ_AGENT_TOKEN")}
}

func (a *agent) run(ctx context.Context) {
	wait := backoff{min: time.Second, max: time.Minute}
	usedCodes := map[string]bool{} // codes KubeiQ refused: used already or expired
	rejected := ""                 // the token KubeiQ refused last (revoked)
	for ctx.Err() == nil {
		creds := a.readCredentials()
		if a.token == "" || a.token == rejected {
			switch {
			case creds.token != "" && creds.token != rejected:
				a.token = creds.token
			case creds.code != "" && !usedCodes[creds.code]:
				token, err := a.register(ctx, creds.code)
				if err != nil {
					if isUnauthorized(err) {
						usedCodes[creds.code] = true
						slog.Error("KubeiQ refused the install code: it was used or expired. Copy a new install command from KubeiQ")
					} else {
						slog.Warn("cannot register with KubeiQ", "error", err)
					}
					sleep(ctx, wait.next())
					continue
				}
				a.token = token
				rejected = ""
				if err := a.saveToken(ctx, token); err != nil {
					slog.Warn("could not save the agent token in its Secret: after a restart the agent needs a new install code", "error", err)
				}
				slog.Info("registered with KubeiQ")
			case a.token != "":
				// Revoked, and no new code: try again now and then, in case it comes back.
				slog.Error("KubeiQ refused the agent token (revoked?). Apply a new install command from KubeiQ", "retry_in", retryRejected)
				sleep(ctx, retryRejected)
				rejected = ""
				continue
			default:
				slog.Error("no install code or token: apply the install command from KubeiQ (Settings, Clusters, Agent)")
				sleep(ctx, 30*time.Second)
				continue
			}
		}
		started := time.Now()
		err := a.session(ctx)
		if ctx.Err() != nil {
			return
		}
		if isUnauthorized(err) {
			rejected = a.token
			sleep(ctx, 2*time.Second)
			continue
		}
		if time.Since(started) > stableSession {
			wait.reset()
		}
		next := wait.next()
		slog.Warn("disconnected from KubeiQ, reconnecting", "error", err, "in", next.Round(time.Millisecond))
		sleep(ctx, next)
	}
}

func (a *agent) endpoint(path string) string {
	return strings.TrimRight(a.cfg.url.String(), "/") + path
}

func (a *agent) httpClient() *http.Client {
	return &http.Client{
		Transport: &http.Transport{Proxy: http.ProxyFromEnvironment, TLSClientConfig: a.tls},
		Timeout:   20 * time.Second,
	}
}

type statusError struct{ status int }

func (e statusError) Error() string { return fmt.Sprintf("KubeiQ answered HTTP %d", e.status) }

func isUnauthorized(err error) bool {
	var status statusError
	var handshake handshakeError
	var closed closeError
	switch {
	case errors.As(err, &status):
		return status.status == http.StatusUnauthorized
	case errors.As(err, &handshake):
		return handshake.status == http.StatusUnauthorized || handshake.status == http.StatusForbidden
	case errors.As(err, &closed):
		return closed.code == 4401
	}
	return false
}

// register trades the one-time install code for the agent token.
func (a *agent) register(ctx context.Context, code string) (string, error) {
	body := strings.NewReader(fmt.Sprintf(`{"version":%q}`, version))
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, a.endpoint("/api/v1/agent/register"), body)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+code)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "kubeiq-agent/"+version)
	resp, err := a.httpClient().Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", statusError{status: resp.StatusCode}
	}
	var out struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&out); err != nil {
		return "", err
	}
	if !strings.HasPrefix(out.Token, "kqa_") {
		return "", errors.New("KubeiQ sent no agent token")
	}
	return out.Token, nil
}

// saveToken keeps the token in the agent's Secret and drops the used install code.
func (a *agent) saveToken(ctx context.Context, token string) error {
	patch, _ := json.Marshal(map[string]any{
		"data": map[string]any{"token": base64.StdEncoding.EncodeToString([]byte(token)), "code": nil},
	})
	path := fmt.Sprintf("/api/v1/namespaces/%s/secrets/%s", a.cfg.namespace, a.cfg.secret)
	req, err := http.NewRequestWithContext(ctx, http.MethodPatch, "https://kubernetes"+path, strings.NewReader(string(patch)))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/merge-patch+json")
	resp, err := a.k8s.do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("the API server answered %s", resp.Status)
	}
	return nil
}

func (a *agent) kubernetesVersion(ctx context.Context) string {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://kubernetes/version", nil)
	if err != nil {
		return ""
	}
	resp, err := a.k8s.do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var out struct {
		GitVersion string `json:"gitVersion"`
	}
	_ = json.NewDecoder(io.LimitReader(resp.Body, 64<<10)).Decode(&out)
	return out.GitVersion
}

func (a *agent) tunnelURL() string {
	u := *a.cfg.url
	u.Scheme = map[string]string{"https": "wss", "http": "ws"}[u.Scheme]
	u.Path = strings.TrimRight(u.Path, "/") + "/api/v1/agent/connect"
	return u.String()
}

// session keeps one tunnel open until it fails, KubeiQ closes it, or the agent stops.
func (a *agent) session(ctx context.Context) error {
	header := http.Header{}
	header.Set("Authorization", "Bearer "+a.token)
	header.Set("User-Agent", "kubeiq-agent/"+version)
	ws, err := dialWebSocket(ctx, a.tunnelURL(), dialOptions{
		header:    header,
		tlsConfig: a.tls,
		proxy:     http.ProxyFromEnvironment,
		timeout:   20 * time.Second,
	})
	if err != nil {
		return err
	}
	m := newMux(ws)
	stop := context.AfterFunc(ctx, m.Close)
	defer stop()

	hello, _ := json.Marshal(map[string]any{
		"type": "hello", "protocol": protocolVersion, "version": version,
		"kubernetes": a.kubernetesVersion(ctx),
	})
	if err := m.sendText(string(hello)); err != nil {
		m.Close()
		return err
	}
	slog.Info("connected to KubeiQ")
	server := &http.Server{
		Handler:           a.k8s.proxy(deniedPaths(a.cfg.namespace, a.cfg.secret, a.cfg.serviceAccount)),
		ReadHeaderTimeout: 30 * time.Second,
		ErrorLog:          log.New(io.Discard, "", 0),
	}
	go func() { _ = server.Serve(muxListener{m}) }()
	err = m.Run()
	m.Close()
	_ = server.Close()
	return err
}

type backoff struct {
	min, max, current time.Duration
}

func (b *backoff) next() time.Duration {
	if b.current == 0 {
		b.current = b.min
	} else {
		b.current = min(b.current*2, b.max)
	}
	jitter := 0.8 + rand.Float64()*0.4 //nolint:gosec // jitter, not security
	return time.Duration(float64(b.current) * jitter)
}

func (b *backoff) reset() { b.current = 0 }

func sleep(ctx context.Context, d time.Duration) {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
	case <-t.C:
	}
}
