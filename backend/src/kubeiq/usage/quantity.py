"""Kubernetes resource quantities ("250m", "1Gi", "123456Ki") as plain numbers."""

import re

_SUFFIX = {
    "n": 1e-9,
    "u": 1e-6,
    "m": 1e-3,
    "": 1.0,
    "k": 1e3,
    "K": 1e3,
    "M": 1e6,
    "G": 1e9,
    "T": 1e12,
    "P": 1e15,
    "E": 1e18,
    "Ki": 2**10,
    "Mi": 2**20,
    "Gi": 2**30,
    "Ti": 2**40,
    "Pi": 2**50,
    "Ei": 2**60,
}
_QUANTITY = re.compile(r"^([+-]?[0-9.]+(?:[eE][+-]?[0-9]+)?)([a-zA-Z]*)$")


def parse(value: str | int | float | None) -> float:
    """Cores for CPU, bytes for memory and storage. Unparseable values count as 0."""
    if value is None:
        return 0.0
    if isinstance(value, int | float):
        return float(value)
    match = _QUANTITY.match(value.strip())
    if not match or match.group(2) not in _SUFFIX:
        return 0.0
    return float(match.group(1)) * _SUFFIX[match.group(2)]
