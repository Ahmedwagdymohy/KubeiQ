"""A local, read-only window onto one cluster for the security scanners (ADR 0016).

Scanners are separate programs that need a kubeconfig. Instead of writing the cluster's
credentials to disk, KubeiQ starts this proxy on 127.0.0.1 with a one-time token and hands the
scanner a kubeconfig that points at it. It serves TLS with a certificate made for this one scan
(Go clients send tokens only over TLS); the kubeconfig trusts exactly that certificate. The proxy
adds the real credentials (through the
cluster's own ``ApiClient``, so every connection method works) and refuses:

- every write (only GET and HEAD pass, plus the self-access reviews scanners use to learn
  what they may read);
- Secret objects, so no scanner ever sees a Secret value, whatever the credentials allow;
- exec, attach, port-forward and the API server's proxy, which could reach into workloads.
"""

import base64
import ipaddress
import json
import re
import secrets
import ssl
import tempfile
import threading
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any

import urllib3
from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.x509.oid import NameOID
from kubernetes.client import ApiClient
from loguru import logger

_SECRETS = re.compile(r"^/api/v1/(watch/)?(namespaces/[^/]+/)?secrets(/|$)")
_REACH_IN = re.compile(r"/(exec|attach|portforward|proxy)(/|$)")
_SELF_REVIEWS = re.compile(r"^/apis/authorization\.k8s\.io/v1/selfsubject(access|rules)reviews/?$")
_FORWARD_HEADERS = ("accept", "content-type", "user-agent")
_CHUNK = 64 * 1024


def self_signed() -> tuple[bytes, bytes]:
    """(certificate PEM, private key PEM) for 127.0.0.1, valid for a day."""
    key = ec.generate_private_key(ec.SECP256R1())
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "kubeiq-scan-proxy")])
    now = datetime.now(UTC)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now - timedelta(minutes=5))
        .not_valid_after(now + timedelta(days=1))
        .add_extension(
            x509.SubjectAlternativeName([x509.IPAddress(ipaddress.ip_address("127.0.0.1"))]),
            critical=False,
        )
        .add_extension(x509.BasicConstraints(ca=True, path_length=None), critical=True)
        .sign(key, hashes.SHA256())
    )
    key_pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return cert.public_bytes(serialization.Encoding.PEM), key_pem


def refusal(method: str, path: str) -> str | None:
    """Why the proxy refuses this request, or None when it may pass."""
    path = path.split("?", 1)[0]
    if _SECRETS.match(path):
        return "Secrets are not available to scanners"
    if _REACH_IN.search(path):
        return "Scanners may not reach into workloads"
    if method in ("GET", "HEAD"):
        return None
    if method == "POST" and _SELF_REVIEWS.match(path):
        return None
    return "Scanners are read-only"


class ScanProxy:
    """Use as a context manager; ``kubeconfig()`` is what the scanner gets."""

    def __init__(self, api: ApiClient, name: str = "cluster") -> None:
        self._api = api
        self.name = name
        self.token = secrets.token_urlsafe(32)
        self.refused: dict[str, int] = {}
        self._lock = threading.Lock()
        self._server: ThreadingHTTPServer | None = None
        self._cert = b""

    @property
    def url(self) -> str:
        if self._server is None:
            raise RuntimeError("The scan proxy is not running")
        host, port = self._server.server_address[:2]
        return f"https://{host!s}:{port}"

    def kubeconfig(self) -> dict[str, Any]:
        return {
            "apiVersion": "v1",
            "kind": "Config",
            "clusters": [
                {
                    "name": self.name,
                    "cluster": {
                        "server": self.url,
                        "certificate-authority-data": base64.b64encode(self._cert).decode(),
                    },
                }
            ],
            "users": [{"name": "kubeiq-scanner", "user": {"token": self.token}}],
            "contexts": [
                {"name": self.name, "context": {"cluster": self.name, "user": "kubeiq-scanner"}}
            ],
            "current-context": self.name,
        }

    def __enter__(self) -> "ScanProxy":
        server = ThreadingHTTPServer(("127.0.0.1", 0), _Handler)
        self._cert, key = self_signed()
        context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        context.minimum_version = ssl.TLSVersion.TLSv1_2
        # load_cert_chain reads files only; they live for the moment it takes to load them.
        with tempfile.TemporaryDirectory() as folder:
            cert_path, key_path = f"{folder}/cert.pem", f"{folder}/key.pem"
            with open(cert_path, "wb") as f:
                f.write(self._cert)
            with open(key_path, "wb") as f:
                f.write(key)
            context.load_cert_chain(cert_path, key_path)
        server.socket = context.wrap_socket(server.socket, server_side=True)
        server.daemon_threads = True
        server.proxy = self  # type: ignore[attr-defined]
        self._server = server
        threading.Thread(target=server.serve_forever, name="scan-proxy", daemon=True).start()
        return self

    def __exit__(self, *_: object) -> None:
        if self._server is not None:
            self._server.shutdown()
            self._server.server_close()

    def note_refused(self, reason: str) -> None:
        with self._lock:
            self.refused[reason] = self.refused.get(reason, 0) + 1

    def upstream(self, method: str, path: str, headers: dict[str, str], body: bytes | None) -> Any:
        configuration = self._api.configuration
        for auth in configuration.auth_settings().values():
            headers[auth["key"]] = auth["value"]
        return self._api.rest_client.pool_manager.request(
            method,
            configuration.host.rstrip("/") + path,
            headers=headers,
            body=body,
            preload_content=False,
            redirect=False,
            timeout=urllib3.Timeout(connect=10, read=300),
        )


class _Handler(BaseHTTPRequestHandler):
    server_version = "kubeiq-scan-proxy"
    error_content_type = "application/json"

    def do_GET(self) -> None:
        self._serve()

    def do_HEAD(self) -> None:
        self._serve()

    def do_POST(self) -> None:
        self._serve()

    def do_PUT(self) -> None:
        self._serve()

    def do_PATCH(self) -> None:
        self._serve()

    def do_DELETE(self) -> None:
        self._serve()

    def log_message(self, format: str, *args: Any) -> None:
        logger.debug("scan proxy: {}", format % args)

    def _serve(self) -> None:
        proxy: ScanProxy = self.server.proxy  # type: ignore[attr-defined]
        self.close_connection = True
        sent = self.headers.get("authorization", "")
        if not secrets.compare_digest(sent.encode(), f"Bearer {proxy.token}".encode()):
            logger.debug("scan proxy: refused credentials for {}", self.path)
            self._status(401, "Unauthorized", "Unknown scanner token")
            return
        reason = refusal(self.command, self.path)
        if reason:
            proxy.note_refused(reason)
            self._status(403, "Forbidden", reason)
            return
        length = int(self.headers.get("content-length") or 0)
        body = self.rfile.read(length) if length else None
        headers = {k: v for k in _FORWARD_HEADERS if (v := self.headers.get(k))}
        try:
            response = proxy.upstream(self.command, self.path, headers, body)
        except Exception as exc:
            logger.debug("scan proxy upstream failed: {}", exc)
            self._status(502, "ServiceUnavailable", "The cluster could not be reached")
            return
        try:
            self.send_response(response.status)
            if content_type := response.headers.get("content-type"):
                self.send_header("Content-Type", content_type)
            self.send_header("Connection", "close")
            self.end_headers()
            if self.command != "HEAD":
                for chunk in response.stream(_CHUNK, decode_content=True):
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError):
            pass  # the scanner stopped reading (a watch it closed)
        finally:
            response.release_conn()

    def _status(self, code: int, reason: str, message: str) -> None:
        body = json.dumps(
            {
                "kind": "Status",
                "apiVersion": "v1",
                "metadata": {},
                "status": "Failure",
                "message": message,
                "reason": reason,
                "code": code,
            }
        ).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Connection", "close")
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)
