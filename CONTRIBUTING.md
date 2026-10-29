# Contributing to KubeiQ

Thanks for your interest!

1. Read [CLAUDE.md](CLAUDE.md) for layout, commands, and engineering rules.
2. Check [docs/ROADMAP.md](docs/ROADMAP.md) and open an issue before large changes.
3. Use conventional commits (`feat:`, `fix:`, `docs:` ...) and include tests.
4. Ensure lint, type checks, and tests pass (`make check`) before opening a PR.

Contributions to the core are accepted under Apache-2.0. Code under `ee/` is not open for external contributions.

## Branching model

```
feat/explain-chat      o---o
                      /     \
staging     o--------o-------o-------o------------o----   (features collect here)
           /                          \          /
main  ----o----------------------------o--------o------   (releases only)
        v0.2.0                       v0.3.0  v0.3.1
                                         \    /
hotfix/login                              o--o
```

- **`main`** holds released code only. Each merge into it is a release (or a hotfix) and is
  tagged `vX.Y.Z`. Images and the website deploy from it.
- **`staging`** is the integration branch: finished features land here and are tested
  together. When it holds a good set of features, it becomes the next release.
- **`feat/<name>`**, **`fix/<name>`** (and `docs/`, `chore/`, `refactor/`, `ci/`) branch from
  `staging` and merge back into `staging`.
- **`hotfix/<name>`** branches from `main` for an urgent fix to a released version, merges into
  `main` as a patch release, then `main` is merged into `staging`.

Nobody commits directly to `main` or `staging`. CI runs on pushes to both and on every PR.

### A feature, start to finish

```bash
git fetch origin
git worktree add -b feat/my-feature /tmp/kq-my-feature origin/staging
cd /tmp/kq-my-feature
# ... work, commit in logical units, push ...
git push -u origin feat/my-feature
```

When it is tested and approved:

```bash
make check
git switch staging && git pull
git merge --no-ff feat/my-feature
git push origin staging
git branch -d feat/my-feature && git push origin --delete feat/my-feature
git worktree remove /tmp/kq-my-feature
```

Add a line under `## Unreleased` in `CHANGELOG.md` as part of the feature.

### A release

1. `make check` on `staging`.
2. On `staging`: move `## Unreleased` in `CHANGELOG.md` to `## X.Y.Z — <date>` and bump the
   version in `backend/pyproject.toml`, `backend/src/kubeiq/__init__.py` and
   `frontend/package.json`, then `cd backend && uv lock`. Commit `chore: release X.Y.Z`.
3. `git switch main && git merge --no-ff staging`, push, and tag `vX.Y.Z`.
4. Wait for the CI and Images workflows, then `gh release create vX.Y.Z`.
