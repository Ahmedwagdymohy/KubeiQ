import pytest

from kubeiq.security.redaction import MASK, is_sensitive_name, redact, redact_env_value


@pytest.mark.parametrize(
    ("raw", "secret"),
    [
        ("connecting to postgres://app:s3cr3t@db:5432/orders", "s3cr3t"),
        ("password=hunter2 user=admin", "hunter2"),
        ('{"api_key": "abc123xyz", "region": "eu"}', "abc123xyz"),
        ("DB_PASSWORD: 'topsecret'", "topsecret"),
        ("Authorization: Bearer abcdefghijklmnop.qrstu", "abcdefghijklmnop.qrstu"),
        ("token eyJhbGciOiJIUzI1.eyJzdWIiOiIxMjM0.SflKxwRJSMeKKF2QT4", "eyJhbGciOiJIUzI1"),
        ("aws key AKIAIOSFODNN7EXAMPLE used", "AKIAIOSFODNN7EXAMPLE"),
        ("key=sk-proj-abcdefghijklmnopqrstuvwx", "sk-proj-abcdefghijklmnopqrstuvwx"),
        (
            "-----BEGIN RSA PRIVATE KEY-----\nMIIEow\n-----END RSA PRIVATE KEY-----",
            "MIIEow",
        ),
    ],
)
def test_redacts_secrets(raw: str, secret: str) -> None:
    result = redact(raw)
    assert secret not in result
    assert MASK in result


def test_keeps_useful_context() -> None:
    line = "Error: connect ECONNREFUSED 10.0.0.5:5432 while reading DATABASE_URL"
    assert redact(line) == line


def test_url_keeps_user_and_host() -> None:
    assert redact("redis://cache:pw123@redis:6379") == f"redis://cache:{MASK}@redis:6379"


@pytest.mark.parametrize("name", ["DB_PASSWORD", "STRIPE_SECRET_KEY", "githubToken", "API_KEY"])
def test_sensitive_names(name: str) -> None:
    assert is_sensitive_name(name)


@pytest.mark.parametrize("name", ["DATABASE_HOST", "LOG_LEVEL", "PORT"])
def test_non_sensitive_names(name: str) -> None:
    assert not is_sensitive_name(name)


def test_env_value_masking() -> None:
    assert redact_env_value("DB_PASSWORD", "plain") == MASK
    assert redact_env_value("LOG_LEVEL", "debug") == "debug"
    assert redact_env_value("DATABASE_URL", "postgres://u:p@db/x") == f"postgres://u:{MASK}@db/x"
