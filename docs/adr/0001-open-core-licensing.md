# 0001 — Open-core licensing

- **Status:** Accepted
- **Date:** 2026-10-21

## Context
KubeiQ is free and open source, with paid Pro/Enterprise tiers (managed hosting, team and compliance features), similar to LiteLLM.

## Decision
- Everything outside `ee/` is licensed **Apache-2.0**.
- `ee/` holds commercial features under a separate commercial license, enabled by a license key at runtime.
- Core must not import `ee/`; `ee/` integrates via extension points (auth providers, permission checks, audit sinks).

## Consequences
- Permissive core maximizes adoption and enterprise comfort; Apache-2.0 includes a patent grant.
- Clear boundary keeps contributions and commercial code separable.
