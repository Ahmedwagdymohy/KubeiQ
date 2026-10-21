---
description: Verify, document, commit and push the current change
---
1. Run the relevant checks: backend `uv run ruff check . && uv run mypy src && uv run pytest`; frontend `pnpm lint && pnpm build`.
2. Fix failures. Do not skip or disable checks.
3. Update `docs/ROADMAP.md` (and `CLAUDE.md`/ADRs if needed) in the same commit.
4. Commit with a conventional, professional message — no AI/Claude attribution lines — and push to `origin`.
