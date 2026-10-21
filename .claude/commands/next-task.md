---
description: Pick up the next open roadmap task and drive it to done
---
1. Read `CLAUDE.md` and `docs/ROADMAP.md`. Run `git log --oneline -10` to see recent work.
2. Identify the first `[~]` (in progress) task, otherwise the first `[ ]` task in the earliest phase.
3. Briefly state the task and plan, then implement it following the engineering rules in `CLAUDE.md`.
4. Apply the Definition of Done: tests/lint pass, tick the roadmap box, add an ADR for new decisions,
   update `CLAUDE.md` if layout/commands changed.
5. Commit with a conventional, professional message (no AI attribution) and push.
