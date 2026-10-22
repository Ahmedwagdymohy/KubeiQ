---
description: Verify, document, commit and push the current change
---
1. Run `make fmt` then `make check` (identical to CI).
2. Fix failures. Do not skip or disable checks.
3. Update `docs/ROADMAP.md` (and `CLAUDE.md`/ADRs if needed) in the same commit.
4. Commit with a conventional, professional message — no AI/Claude attribution lines — and push to `origin`.
