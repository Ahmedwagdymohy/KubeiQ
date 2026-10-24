import pytest

from kubeiq.core.config import Settings


@pytest.mark.parametrize(
    ("value", "expected"),
    [
        ("http://localhost:3000", ["http://localhost:3000"]),
        ("http://a:3000, http://b:3002", ["http://a:3000", "http://b:3002"]),
        ('["http://localhost:3000"]', ["http://localhost:3000"]),
    ],
)
def test_cors_origins_accepts_plain_list_and_json(
    monkeypatch: pytest.MonkeyPatch, value: str, expected: list[str]
) -> None:
    monkeypatch.setenv("KUBEIQ_CORS_ORIGINS", value)
    assert Settings(_env_file=None).cors_origins == expected
