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
        "Required environment variable {0} is not set",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.HIGH,
    ),
    LogPattern(
        "missing_env",
        re.compile(
            rf"(?i)(?:missing|required|undefined)\s+(?:env(?:ironment)?\s*var(?:iable)?)\s*:?\s*{_ENV}"
        ),
        "Required environment variable {0} is not set",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.HIGH,
    ),
    LogPattern(
        "missing_env",
        re.compile(r"KeyError: ['\"]([A-Z][A-Z0-9_]{2,})['\"]"),
        "Environment variable {0} is read by the app but not set",
        "Add {0} to the container env, usually from a Secret or ConfigMap",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "exec_format",
        re.compile(r"(?i)exec format error"),
        "Image was built for a different CPU architecture than the node",
        "Build or pull a multi-arch image that matches the node architecture (amd64/arm64)",
        Certainty.HIGH,
    ),
    LogPattern(
        "db_auth",
        re.compile(
            r"(?i)(password authentication failed|access denied for user|authentication failed)"
        ),
        "The app was rejected by a dependency because of invalid credentials",
        "Check the username and password in the Secret the app uses",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "dns",
        re.compile(
            r"(?i)(no such host|could not resolve host|name or service not known|"
            r"getaddrinfo ENOTFOUND|temporary failure in name resolution)"
        ),
        "A hostname the app depends on cannot be resolved",
        "Verify the service name and namespace in the app config and that CoreDNS is healthy",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "connection_refused",
        re.compile(r"(?i)(connection refused|ECONNREFUSED)"),
        "A dependency the app connects to at startup is refusing connections",
        "Check that the dependency is running and its Service has endpoints",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "port_in_use",
        re.compile(r"(?i)address already in use"),
        "The app tries to bind a port that is already in use",
        "Check for duplicate listeners or a sidecar using the same port",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "permission",
        re.compile(r"(?i)(permission denied|EACCES|read-only file system)"),
        "The app is not allowed to access a file or directory it needs",
        "Check securityContext (runAsUser, readOnlyRootFilesystem) and volume permissions",
        Certainty.MEDIUM,
    ),
    LogPattern(
        "file_missing",
        re.compile(r"(?i)no such file or directory"),
        "The app expects a file that does not exist in the container",
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
