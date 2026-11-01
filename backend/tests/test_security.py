"""Cluster Security: the read-only scanner proxy, scanner installs, parsing Trivy and Kubescape,
merging their findings, the API's access rules and the AI fix."""

import asyncio
import base64
import hashlib
import io
import json
import ssl
import tarfile
import threading
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any, ClassVar

import pytest
from fastapi.testclient import TestClient
from kubernetes.client import ApiClient, Configuration

from kubeiq.agent.llm import LLMReply
from kubeiq.products.security import ai, kubescape, merge, runner, service, tools, trivy
from kubeiq.products.security.models import Finding, ScanResult, Target, ToolRun
from kubeiq.products.security.proxy import ScanProxy, refusal

FIXTURES = Path(__file__).parent / "fixtures" / "security"
CLUSTER = "upload:staging/staging"
KUBECONFIG = """
apiVersion: v1
kind: Config
clusters: [{name: staging, cluster: {server: "https://staging.example:6443"}}]
users: [{name: staging, user: {token: abc}}]
contexts: [{name: staging, context: {cluster: staging, user: staging}}]
current-context: staging
"""


def _kubescape() -> ScanResult:
    texts = kubescape.control_texts(FIXTURES)  # ks-cache-nsa.json stands in for the cache
    return kubescape.parse(json.loads((FIXTURES / "kubescape.json").read_text()), texts)


def _trivy() -> ScanResult:
    return trivy.parse(json.loads((FIXTURES / "trivy.json").read_text()))


# --- the proxy -------------------------------------------------------------------------------


def test_refusals() -> None:
    assert refusal("GET", "/api/v1/namespaces/shop/pods") is None
    assert refusal("GET", "/apis/apps/v1/deployments?limit=500") is None
    assert refusal("HEAD", "/version") is None
    assert refusal("GET", "/api/v1/secrets?limit=500")
    assert refusal("GET", "/api/v1/namespaces/shop/secrets/db")
    assert refusal("GET", "/api/v1/watch/namespaces/shop/secrets")
    assert refusal("GET", "/api/v1/namespaces/shop/pods/web/exec?command=sh")
    assert refusal("GET", "/api/v1/namespaces/shop/services/web/proxy/")
    assert refusal("POST", "/api/v1/namespaces/shop/events")
    assert refusal("DELETE", "/api/v1/namespaces/shop")
    assert refusal("PATCH", "/apis/apps/v1/namespaces/shop/deployments/web")
    assert refusal("POST", "/apis/authorization.k8s.io/v1/selfsubjectaccessreviews") is None
    # A ConfigMap named "secrets" is not the Secrets resource.
    assert refusal("GET", "/api/v1/namespaces/shop/configmaps/secrets") is None


class _Upstream(BaseHTTPRequestHandler):
    seen: ClassVar[list[tuple[str, str, str]]] = []

    def do_GET(self) -> None:
        _Upstream.seen.append((self.command, self.path, self.headers.get("authorization", "")))
        body = b'{"kind":"NamespaceList","items":[]}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        self.do_GET()

    def log_message(self, *_: Any) -> None:
        pass


def test_proxy_adds_credentials_and_refuses_the_rest() -> None:
    upstream = HTTPServer(("127.0.0.1", 0), _Upstream)
    threading.Thread(target=upstream.serve_forever, daemon=True).start()
    configuration = Configuration(host=f"http://127.0.0.1:{upstream.server_address[1]}")
    configuration.api_key = {"authorization": "real-cluster-token"}
    configuration.api_key_prefix = {"authorization": "Bearer"}
    try:
        with ScanProxy(ApiClient(configuration), "test") as proxy:
            kubeconfig = proxy.kubeconfig()
            ca = base64.b64decode(
                kubeconfig["clusters"][0]["cluster"]["certificate-authority-data"]
            )
            context = ssl.create_default_context(cadata=ca.decode())
            server = kubeconfig["clusters"][0]["cluster"]["server"]
            assert server.startswith("https://127.0.0.1:")

            def call(method: str, path: str, token: str) -> int:
                request = urllib.request.Request(server + path, method=method)  # noqa: S310 - https only
                request.add_header("Authorization", f"Bearer {token}")
                try:
                    with urllib.request.urlopen(request, context=context) as response:  # noqa: S310
                        return int(response.status)
                except urllib.error.HTTPError as exc:
                    return exc.code

            token = kubeconfig["users"][0]["user"]["token"]
            assert call("GET", "/api/v1/namespaces", token) == 200
            assert call("GET", "/api/v1/namespaces", "guess") == 401
            assert call("GET", "/api/v1/namespaces/shop/secrets", token) == 403
            assert call("DELETE", "/api/v1/namespaces/shop", token) == 403
            assert proxy.refused == {
                "Secrets are not available to scanners": 1,
                "Scanners are read-only": 1,
            }
    finally:
        upstream.shutdown()
    # Only the allowed request reached the cluster, with the cluster's own credentials.
    assert _Upstream.seen == [("GET", "/api/v1/namespaces", "Bearer real-cluster-token")]


# --- scanner installs ------------------------------------------------------------------------


def _archive(name: str, data: bytes) -> bytes:
    buffer = io.BytesIO()
    with tarfile.open(fileobj=buffer, mode="w:gz") as tar:
        info = tarfile.TarInfo(name)
        info.size = len(data)
        tar.addfile(info, io.BytesIO(data))
    return buffer.getvalue()


def test_install_checks_the_pinned_checksum() -> None:
    archive = _archive("trivy", b"#!/bin/sh\necho trivy\n")
    digest = hashlib.sha256(archive).hexdigest()
    assert tools.extract("trivy", archive, digest) == b"#!/bin/sh\necho trivy\n"
    with pytest.raises(tools.ToolError, match="checksum"):
        tools.extract("trivy", archive, "0" * 64)
    with pytest.raises(tools.ToolError, match="no trivy"):
        other = _archive("README.md", b"hi")
        tools.extract("trivy", other, hashlib.sha256(other).hexdigest())
    for tool in tools.REGISTRY.values():
        assert set(tool.assets) == {"linux-amd64", "linux-arm64", "darwin-amd64", "darwin-arm64"}
        assert all(len(a.sha256) == 64 for a in tool.assets.values())


def test_scanner_commands_stay_read_only(tmp_path: Path) -> None:
    command = runner.trivy_command(Path("trivy"), tmp_path / "kc", tmp_path / "out.json", 20)
    assert "--disable-node-collector" in command  # it would create a Job on a node
    assert command[command.index("--exclude-kinds") + 1] == "Secret"
    assert command[command.index("--image-src") + 1] == "remote"
    assert command[command.index("--scanners") + 1] == "vuln,misconfig,rbac"
    command = runner.kubescape_command(Path("kubescape"), tmp_path / "kc", tmp_path / "out.json")
    assert "--keep-local" in command and "--submit" not in command


# --- parsing and merging ---------------------------------------------------------------------


def test_kubescape_report() -> None:
    result = _kubescape()
    assert {f.name for f in result.frameworks} == {
        "NSA-CISA",
        "MITRE ATT&CK",
        "CIS Kubernetes 1.12",
    }
    assert result.compliance is not None and 0 < result.compliance < 100
    analytics = [f for f in result.findings if f.target.ref == "kubeiq-demo/Deployment/analytics"]
    root = next(f for f in analytics if f.checks[0].id == "C-0013")
    assert root.severity in ("medium", "high")
    assert any(
        fix.path.endswith("securityContext.runAsNonRoot") and fix.value == "true"
        for fix in root.fixes
    )
    # Placeholders from Kubescape become empty values, never "YOUR_VALUE".
    assert all(fix.value != "YOUR_VALUE" for f in result.findings for fix in f.fixes)
    tokens = next(f for f in analytics if f.checks[0].id == "C-0034")
    assert "automountServiceAccountToken" in tokens.remediation
    # Kubescape's own exceptions for system objects are not findings.
    assert all(
        f.target.name != "system:coredns" or f.checks[0].id != "C-0053" for f in result.findings
    )
    skipped = [c for c in result.controls if c.status == "skipped"]
    assert skipped and all(c.note for c in skipped)


def test_trivy_report() -> None:
    assert trivy.normalize_id("KSV001") == "KSV-0001"
    assert trivy.normalize_id("KSV-0118") == "KSV-0118"
    result = _trivy()
    assert result.images == 1
    ids = {v.id: v for v in result.vulnerabilities}
    assert set(ids) == {"CVE-2024-0001", "CVE-2024-0002", "CVE-2024-0003"}
    assert ids["CVE-2024-0001"].severity == "critical" and ids["CVE-2024-0001"].fixed == "3.0.13"
    assert ids["CVE-2024-0003"].image == "nginx:1.25"  # language packages belong to the image
    assert ids["CVE-2024-0002"].fixed is None
    assert [w.ref for w in ids["CVE-2024-0001"].workloads] == ["kubeiq-demo/Deployment/frontend"]
    assert any(f.checks[0].id == "KSV-0001" for f in result.findings)


def test_same_problem_from_both_scanners_is_one_finding() -> None:
    combined = merge.combine([_kubescape(), _trivy()], exposed=set())
    analytics = [f for f in combined.findings if f.target.ref == "kubeiq-demo/Deployment/analytics"]
    checks = [{f"{c.tool}:{c.id}" for c in f.checks} for f in analytics]
    root = next(c for c in checks if "kubescape:C-0013" in c)
    assert "trivy:KSV-0012" in root  # runs as root, reported by both
    escalation = next(c for c in checks if "kubescape:C-0016" in c)
    assert "trivy:KSV-0001" in escalation
    # The broad "apply a security context" checks join each other, not everything else.
    broad = next(c for c in checks if "kubescape:C-0211" in c)
    assert broad == {"kubescape:C-0211", "trivy:KSV-0118"}
    assert len({f.key for f in combined.findings}) == len(combined.findings)
    assert merge.score(combined) == round(combined.compliance or 0)


def test_field_keys() -> None:
    assert (
        merge.field_key("spec.template.spec.containers[0].securityContext.seccompProfile.type")
        == "securityContext.seccompProfile"
    )
    assert (
        merge.field_key("spec.template.spec.containers[1].resources.limits.cpu")
        == "resources.limits.cpu"
    )
    assert (
        merge.field_key("spec.template.spec.automountServiceAccountToken")
        == "automountServiceAccountToken"
    )


def test_risk_ranking() -> None:
    def finding(ns: str, name: str, severity: str = "medium", field: str = "x") -> Finding:
        return Finding(
            key=f"{ns}/{name}/{field}",
            title="t",
            severity=severity,  # type: ignore[arg-type]
            category="workload",
            target=Target(kind="Deployment", name=name, namespace=ns),
            checks=[],
            fixes=[
                {
                    "path": f"spec.template.spec.containers[0].securityContext.{field}",
                    "value": "true",
                }
            ],  # type: ignore[list-item]
        )

    inside = finding("shop", "worker")
    exposed = finding("shop", "web")
    system = finding("kube-system", "coredns")
    privileged = finding("shop", "agent", field="privileged")
    ranked = merge.rank([inside, exposed, system, privileged], [], {"shop/Deployment/web"})
    assert ranked[0] is exposed and "Reachable from outside the cluster" in exposed.reasons
    assert ranked[1] is privileged and privileged.reasons == [
        "Runs as root or with extra privileges"
    ]
    assert ranked[-1] is system and system.risk < inside.risk
    assert merge.system_owned(Target(kind="ClusterRole", name="system:coredns"))
    assert merge.system_owned(Target(kind="ClusterRole", name="admin"))
    assert not merge.system_owned(Target(kind="ClusterRole", name="payments-reader"))


# --- the API ---------------------------------------------------------------------------------


def _store(cluster_id: str) -> str:
    async def run() -> str:
        from kubeiq.db.session import get_sessionmaker

        async with get_sessionmaker()() as session:
            scan = service.SecurityScan(cluster_id=cluster_id, started_by="admin")
            session.add(scan)
            await session.commit()
            scan_id = scan.id
        combined = merge.combine([_kubescape(), _trivy()], exposed=set())
        runs = [ToolRun(tool="kubescape", version="4.0.15", ok=True)]
        await service.save(scan_id, combined, runs, {"Scanners are read-only": 3})
        return scan_id

    return asyncio.run(run())


def _viewer(client: TestClient, namespaces: list[str]) -> TestClient:
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    user = client.post(
        "/api/v1/users", json={"username": "viewer", "password": "viewer-pass"}
    ).json()
    client.post(
        "/api/v1/projects",
        json={
            "name": "Shop",
            "scopes": [{"cluster_id": CLUSTER, "namespaces": namespaces}],
            "members": [{"user_id": user["id"], "role": "viewer"}],
        },
    )
    viewer = TestClient(client.app)
    viewer.post("/api/v1/auth/login", json={"username": "viewer", "password": "viewer-pass"})
    return viewer


def test_results_for_admins(client: TestClient) -> None:
    params = {"cluster_id": CLUSTER}
    assert client.get("/api/v1/security/overview", params=params).status_code == 404
    _store(CLUSTER)
    overview = client.get("/api/v1/security/overview", params=params).json()
    assert overview["cluster_wide"] and overview["scan"]["status"] == "completed"
    assert overview["scan"]["score"] is not None and len(overview["frameworks"]) == 3
    assert overview["vulnerabilities"]["critical"] == 1 and overview["fixable"] == 2
    assert overview["refused"] == {"Scanners are read-only": 3}
    assert len(overview["history"]) == 1 and overview["top"]
    findings = client.get("/api/v1/security/findings", params=params).json()
    assert any(f["target"]["namespace"] is None for f in findings)  # cluster roles
    vulns = client.get("/api/v1/security/vulnerabilities", params=params).json()
    assert {v["id"] for v in vulns} == {"CVE-2024-0001", "CVE-2024-0002", "CVE-2024-0003"}
    assert client.get("/api/v1/security/controls", params=params).json()
    status = client.get("/api/v1/security/status", params=params).json()
    assert status["can_scan"] and {t["name"] for t in status["tools"]} == {"trivy", "kubescape"}


def test_viewers_see_only_their_namespaces(client: TestClient) -> None:
    viewer = _viewer(client, ["kubeiq-demo"])
    _store(CLUSTER)
    params = {"cluster_id": CLUSTER}
    findings = viewer.get("/api/v1/security/findings", params=params).json()
    assert findings and {f["target"]["namespace"] for f in findings} == {"kubeiq-demo"}
    overview = viewer.get("/api/v1/security/overview", params=params).json()
    assert not overview["cluster_wide"] and overview["frameworks"] == []
    assert sum(overview["findings"].values()) == len(findings)
    assert viewer.get("/api/v1/security/controls", params=params).status_code == 403
    assert viewer.post("/api/v1/security/scans", json=params).status_code == 403
    assert viewer.post("/api/v1/security/summary", json=params).status_code == 403
    assert viewer.get("/api/v1/security/status", params=params).json()["can_scan"] is False
    other = viewer.get("/api/v1/security/findings", params={"cluster_id": "kubeconfig:other"})
    assert other.status_code == 403


def test_one_scan_at_a_time(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    started = asyncio.Event()

    async def slow(*_: Any) -> None:
        started.set()
        await asyncio.sleep(30)

    monkeypatch.setattr(service, "run", slow)
    client.post("/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG})
    assert (
        client.post("/api/v1/security/scans", json={"cluster_id": "kubeconfig:nope"}).status_code
        == 404
    )
    first = client.post("/api/v1/security/scans", json={"cluster_id": CLUSTER})
    assert first.status_code == 202 and first.json()["status"] == "running"
    assert client.post("/api/v1/security/scans", json={"cluster_id": CLUSTER}).status_code == 409


# --- AI --------------------------------------------------------------------------------------


class _LLM:
    model = "fake"

    def __init__(self, *replies: dict[str, Any]) -> None:
        self.replies = [json.dumps(r) for r in replies]
        self.prompts: list[str] = []

    async def complete(self, messages: list[dict[str, Any]], tools: Any = None) -> LLMReply:
        self.prompts.append(messages[-1]["content"])
        return LLMReply(content=self.replies.pop(0))


DEPLOYMENT = {
    "apiVersion": "apps/v1",
    "kind": "Deployment",
    "metadata": {"name": "analytics", "namespace": "kubeiq-demo"},
    "spec": {
        "template": {
            "spec": {
                "containers": [
                    {
                        "name": "engine",
                        "image": "nginx",
                        "env": [{"name": "API_TOKEN", "value": "sk-live-abcdef1234567890abcdef"}],
                    }
                ]
            }
        }
    },
}


def _finding() -> Finding:
    return Finding(
        key="k",
        title="Runs as root user",
        severity="medium",
        category="workload",
        target=Target(kind="Deployment", name="analytics", namespace="kubeiq-demo"),
        checks=[],
    )


def test_fix_builds_a_complete_command(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai, "read_object", lambda api, target: json.loads(json.dumps(DEPLOYMENT)))
    patch = {
        "spec": {
            "template": {
                "spec": {
                    "containers": [{"name": "engine", "securityContext": {"runAsNonRoot": True}}]
                }
            }
        }
    }
    llm = _LLM(
        {
            "summary": "Run as a non-root user",
            "patch": patch,
            "caution": "The image must support it",
        }
    )
    result = asyncio.run(ai.fix(llm, None, _finding()))  # type: ignore[arg-type]
    assert result.command == (
        "kubectl patch deployment analytics -n kubeiq-demo --type=strategic -p "
        "'" + json.dumps(patch, separators=(",", ":")) + "'"
    )
    assert "sk-live-abcdef1234567890abcdef" not in llm.prompts[0]  # redacted before the model


def test_fix_rejects_containers_that_do_not_exist(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(ai, "read_object", lambda api, target: json.loads(json.dumps(DEPLOYMENT)))
    patch = {
        "spec": {"template": {"spec": {"containers": [{"name": "app", "securityContext": {}}]}}}
    }
    with pytest.raises(ValueError, match="app"):
        asyncio.run(ai.fix(_LLM({"summary": "x", "patch": patch}), None, _finding()))  # type: ignore[arg-type]


def test_posture_summary() -> None:
    reply = {
        "headline": "Workloads run as root and one image has a critical CVE",
        "summary": "s",
        "priorities": [{"title": f"p{i}", "why": "w"} for i in range(8)],
        "quick_wins": ["Set a default security context"],
    }
    llm = _LLM(reply)
    combined = merge.combine([_kubescape(), _trivy()], exposed=set())
    content = ai.summary_input(
        41, {"findings": {"high": 3}}, combined.findings, combined.vulnerabilities
    )
    result = asyncio.run(ai.summarize(llm, content))
    assert len(result.priorities) == 5 and result.headline.startswith("Workloads")
    assert "CVE-2024-0001" in llm.prompts[0]


def test_patch_command_quotes_safely() -> None:
    target = Target(kind="ClusterRole", name="reader")
    command = ai.patch_command(target, {"metadata": {"annotations": {"note": "it's"}}})
    assert command.startswith("kubectl patch clusterrole reader --type=strategic -p '")
    assert "'\\''" in command and " -n " not in command
