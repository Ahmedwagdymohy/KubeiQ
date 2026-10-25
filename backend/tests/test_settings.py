"""Settings: AI model overrides the environment, secrets stay write-only, kubeconfigs work."""

from fastapi.testclient import TestClient

from kubeiq.core import config
from kubeiq.settings import crypto, kubeconfigs
from kubeiq.settings.providers import litellm_model
from kubeiq.settings.service import apply_ai

KUBECONFIG = """
apiVersion: v1
kind: Config
current-context: staging
clusters:
  - name: staging
    cluster: {server: "https://10.0.0.1:6443", certificate-authority-data: "Zm9v"}
contexts:
  - name: staging
    context: {cluster: staging, user: admin, namespace: shop}
users:
  - name: admin
    user: {token: "abc"}
"""


def test_environment_model_is_used_until_settings_are_saved(client: TestClient) -> None:
    ai = client.get("/api/v1/settings/ai").json()
    assert ai["active_source"] == "environment"
    assert ai["active_model"] == "openai/env-model"

    saved = client.put(
        "/api/v1/settings/ai",
        json={"provider": "anthropic", "model": "claude-sonnet-5-5", "api_key": "sk-secret-1234"},
    ).json()
    assert saved["active_source"] == "settings"
    assert saved["active_model"] == "anthropic/claude-sonnet-5-5"
    assert saved["api_key_set"] is True
    assert saved["api_key_hint"] == "1234"
    assert "sk-secret" not in client.get("/api/v1/settings/ai").text


def test_key_is_kept_when_omitted_and_removed_when_empty(client: TestClient) -> None:
    body = {"provider": "openai", "model": "gpt-4.1", "api_key": "sk-first"}
    client.put("/api/v1/settings/ai", json=body)
    kept = client.put("/api/v1/settings/ai", json={"provider": "openai", "model": "gpt-4.1"}).json()
    assert kept["api_key_set"] is True
    cleared = client.put(
        "/api/v1/settings/ai", json={"provider": "openai", "model": "gpt-4.1", "api_key": ""}
    ).json()
    assert cleared["api_key_set"] is False


def test_disabling_ai_turns_off_the_model(client: TestClient) -> None:
    off = client.put("/api/v1/settings/ai", json={"enabled": False}).json()
    assert off["active_source"] == "none"
    assert off["active_model"] is None


def test_secrets_are_encrypted_at_rest(client: TestClient) -> None:
    token = crypto.encrypt("sk-plain")
    assert "sk-plain" not in token
    assert crypto.decrypt(token) == "sk-plain"


def test_uploaded_kubeconfig_becomes_a_cluster(client: TestClient) -> None:
    created = client.post(
        "/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG}
    )
    assert created.status_code == 201
    assert created.json()["contexts"] == ["staging"]

    ids = [c["id"] for c in client.get("/api/v1/clusters", params={"all": True}).json()]
    assert "upload:staging/staging" in ids

    duplicate = client.post(
        "/api/v1/settings/kubeconfigs", json={"name": "staging", "content": KUBECONFIG}
    )
    assert duplicate.status_code == 409

    client.delete(f"/api/v1/settings/kubeconfigs/{created.json()['id']}")
    assert "upload:staging/staging" not in [c["id"] for c in client.get("/api/v1/clusters").json()]


def test_invalid_kubeconfig_is_rejected(client: TestClient) -> None:
    response = client.post(
        "/api/v1/settings/kubeconfigs", json={"name": "bad", "content": "kind: Pod\nname: x"}
    )
    assert response.status_code == 422


def test_kubeconfig_warnings_for_exec_login_and_file_references() -> None:
    content = KUBECONFIG.replace(
        'user: {token: "abc"}', "user: {exec: {command: aws}, client-key: /home/me/key.pem}"
    )
    _, _, warnings = kubeconfigs.inspect(content)
    assert any("'aws'" in w for w in warnings)
    assert any("--flatten" in w for w in warnings)


def test_provider_model_names() -> None:
    assert litellm_model("openai", "gpt-4.1") == "openai/gpt-4.1"
    assert litellm_model("openrouter", "anthropic/claude") == "openrouter/anthropic/claude"
    assert litellm_model("custom", "my-alias") == "openai/my-alias"
    assert litellm_model("openai", "openai/gpt-4.1") == "openai/gpt-4.1"


def test_saved_limits_apply_to_investigations() -> None:
    base = config.Settings(llm_model=None)
    ai = {
        "enabled": True,
        "provider": "openai",
        "model": "",
        "api_base": None,
        "api_version": None,
        "api_key": None,
        "max_incidents": 7,
        "max_steps": 4,
    }
    applied = apply_ai(base, ai)
    assert (applied.agent_max_incidents, applied.agent_max_steps) == (7, 4)
    assert applied.llm_model is None
