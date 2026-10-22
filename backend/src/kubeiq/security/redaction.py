"""Mask secrets in text before it is stored, shown, or sent to an LLM.

Patterns are intentionally broad: a false positive costs a little context,
a false negative leaks a credential.
"""

import re

MASK = "[REDACTED]"

_SENSITIVE_KEY = (
    r"[A-Za-z0-9_.-]*(?:passw(?:or)?d|pwd|secret|token|api[_-]?key|access[_-]?key|"
    r"private[_-]?key|client[_-]?secret|credential|auth)[A-Za-z0-9_.-]*"
)

_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    # PEM blocks (private keys, certificates with keys)
    (
        re.compile(r"-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----", re.S),
        MASK,
    ),
    # Credentials embedded in URLs: scheme://user:password@host
    (re.compile(r"(?P<pre>\b[a-zA-Z][a-zA-Z0-9+.-]*://[^\s:/@]+:)[^\s@/]+(?=@)"), rf"\g<pre>{MASK}"),
    # Authorization headers
    (re.compile(r"(?i)(?P<pre>\b(?:bearer|basic)\s+)[A-Za-z0-9._~+/=-]{8,}"), rf"\g<pre>{MASK}"),
    # JSON Web Tokens
    (re.compile(r"\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}"), MASK),
    # Well-known token formats
    (re.compile(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b"), MASK),  # AWS access key id
    (re.compile(r"\bgh[pousr]_[A-Za-z0-9]{30,}\b"), MASK),  # GitHub
    (re.compile(r"\bxox[abpors]-[A-Za-z0-9-]{10,}\b"), MASK),  # Slack
    (re.compile(r"\bsk-[A-Za-z0-9_-]{20,}\b"), MASK),  # OpenAI / Anthropic style keys
    # key=value / key: value / "key": "value" where the key looks sensitive
    (
        re.compile(
            rf"""(?ix)(?P<pre>["']?\b{_SENSITIVE_KEY}["']?\s*[:=]\s*["']?)"""
            r"""(?!\[REDACTED\])[^\s"',;&}]+"""
        ),
        rf"\g<pre>{MASK}",
    ),
]

_SENSITIVE_NAME = re.compile(rf"(?i)^{_SENSITIVE_KEY}$")


def redact(text: str) -> str:
    for pattern, replacement in _PATTERNS:
        text = pattern.sub(replacement, text)
    return text


def is_sensitive_name(name: str) -> bool:
    """True if an env var / config key name suggests it holds a secret."""
    return bool(_SENSITIVE_NAME.match(name))


def redact_env_value(name: str, value: str) -> str:
    """Mask an environment variable value if its name or content looks secret."""
    return MASK if is_sensitive_name(name) else redact(value)
