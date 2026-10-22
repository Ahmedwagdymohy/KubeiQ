"""Known log patterns that explain why a container crashed."""

import re
from dataclasses import dataclass

from kubeiq.detectors.models import Certainty


@dataclass(frozen=True)
class LogPattern:
    key: str
    regex: re.Pattern[str]
    cause: str  # may use {0} for the first captured group
    fix: str
    certainty: Certainty


@dataclass(frozen=True)
class LogMatch:
    pattern: LogPattern
    line: str
    line_number: int
    value: str | None

    @property
    def cause(self) -> str:
        return self.pattern.cause.format(self.value or "")


_ENV = r"['\"`]?([A-Z][A-Z0-9_]{2,})['\"`]?"

PATTERNS: list[LogPattern] = [
    LogPattern(
        "missing_env",
        re.compile(
            rf"(?i)(?:env(?:ironment)?\s*var(?:iable)?|config(?:uration)?\s*key)s?\s*{_ENV}\s*"
            r"(?:is\s+)?(?:not\s+set|missing|undefined|required|empty|not\s+defined)"
        ),
        "Environment variable {0} is missing",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.HIGH,
    ),
    LogPattern(
        "missing_env",
        re.compile(
            rf"(?i)(?:missing|required|undefined)\s+(?:env(?:ironment)?\s*var(?:iable)?)\s*:?\s*{_ENV}"
        ),
        "Environment variable {0} is missing",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.HIGH,
    ),
    LogPattern(
        "missing_env",
        re.compile(r"KeyError: ['\"]([A-Z][A-Z0-9_]{2,})['\"]"),
        "Environment variable {0} is missing",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "exec_format",
        re.compile(r"(?i)exec format error"),
        "Image architecture does not match the node (amd64 vs arm64)",
        "Build or pull a multi-arch image that matches the node architecture (amd64/arm64)",
        Certainty.HIGH,
    ),
    LogPattern(
        "db_auth",
        re.compile(
            r"(?i)(password authentication failed|access denied for user|authentication failed)"
        ),
        "Database or dependency rejected the app's credentials",
        "Check the username and password in the Secret the app uses",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "dns",
        re.compile(
            r"(?i)(no such host|could not resolve host|name or service not known|"
            r"getaddrinfo ENOTFOUND|temporary failure in name resolution)"
        ),
        "A hostname the app needs cannot be resolved (DNS)",
        "Verify the service name and namespace in the app config and that CoreDNS is healthy",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "connection_refused",
        re.compile(r"(?i)(connection refused|ECONNREFUSED)"),
        "A dependency refuses connections at startup",
        "Check that the dependency is running and its Service has endpoints",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "port_in_use",
        re.compile(r"(?i)address already in use"),
        "Port already in use inside the pod",
        "Check for duplicate listeners or a sidecar using the same port",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "permission",
        re.compile(r"(?i)(permission denied|EACCES|read-only file system)"),
        "Permission denied on a file or directory",
        "Check securityContext (runAsUser, readOnlyRootFilesystem) and volume permissions",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "file_missing",
        re.compile(r"(?i)no such file or directory"),
        "Expected file is missing in the container",
        "Check volume mounts, ConfigMap keys and the image contents",
        Certainty.LOW,
    ),
]


def match_logs(lines: list[str]) -> list[LogMatch]:
    """All pattern matches: strongest certainty first, then most specific pattern
    (PATTERNS is ordered most specific first), then earliest line."""
    matches = []
    for number, line in enumerate(lines):
        for pattern in PATTERNS:
            found = pattern.regex.search(line)
            if found:
                value = found.group(1) if pattern.regex.groups else None
                matches.append(LogMatch(pattern, line, number, value))
                break
    specificity = {id(p): i for i, p in enumerate(PATTERNS)}
    return sorted(
        matches,
        key=lambda m: (-m.pattern.certainty, specificity[id(m.pattern)], m.line_number),
    )
