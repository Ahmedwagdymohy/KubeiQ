from fastapi.testclient import TestClient

from kubeiq import __version__
from kubeiq.core.config import Settings
from kubeiq.main import create_app

client = TestClient(create_app(Settings(env="test")))


def test_healthz() -> None:
    response = client.get("/healthz")
    assert response.status_code == 200
    assert response.json() == {"status": "healthy", "service": "kubeiq", "version": __version__}


def test_readyz() -> None:
    response = client.get("/readyz")
    assert response.status_code == 200
    assert response.json()["status"] == "ready"
