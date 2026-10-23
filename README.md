# KubeiQ

**AI-powered Kubernetes operations, self-hosted.**

KubeiQ connects to your Kubernetes clusters, investigates failures, and explains the root cause with
actionable fixes — using the LLM provider of your choice, including fully local models.

> Status: early development. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Products

- **Cluster Doctor**, the AI troubleshooting agent: investigates pods, events, logs, deployments, and networking, then
  produces a root cause, fix steps, and an evidence-based confidence score.

- **Cluster Map**: a live picture of your namespace. Every pod, workload, service, volume claim,
  config and secret reference, how they connect, and which ones are broken with a one-line reason.
  Click a broken resource and **Investigate** opens Cluster Doctor on it with the fix ready.
  Built on [Headlamp](https://github.com/kubernetes-sigs/headlamp)'s map logic (see `NOTICE`).

- **Cluster Manager**: browse every resource kind, custom resources included. Read YAML, events and
  live pod logs. Admins can turn on changes (scale, restart, cordon, delete), which are confirmed,
  limited to project editors and recorded in the activity log.

More products will ship in the same install.

## Platform

- **Multi-cluster** — pick any context from your kubeconfig; private clusters via an in-cluster agent (coming).
- **Any LLM** — OpenAI, Anthropic, OpenRouter, Azure, Bedrock, or Ollama via LiteLLM.
- **Users and projects** — master key sign-in for the admin, users with access to chosen clusters and
  namespaces, an activity log. Free for up to 3 users.
- **Safe by default** — read-only until an admin turns changes on, Secret values never read, redaction
  before any model call.

Detected failure types: CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending/FailedScheduling,
probe failures, stuck rollouts, service selector mismatches, DNS/networking issues.

## Quick start

One command installs KubeiQ with every product included (needs Docker, git and a kubeconfig):

```bash
curl -fsSL https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/install.sh | sh
```

Then open http://localhost:3000 and sign in as `admin` with the **master key** the installer prints
(also saved as `KUBEIQ_MASTER_KEY` in `~/kubeiq/backend/.env`). Open **Settings** (gear icon) to choose your AI provider and model,
paste your key, add kubeconfig files for more clusters, and invite users into projects. Keys and kubeconfigs are encrypted at rest.
Environment variables in `backend/.env` still work and are used until a model is saved in Settings.

Port 3000 in use? `export KUBEIQ_FRONTEND_PORT=3001` before running the installer.

From a clone instead: `docker compose up --build`. See [CLAUDE.md](CLAUDE.md) for development commands.

## Repository

- `backend/`, `frontend/`: the KubeiQ platform (one install, products as modules)
- `website/`: the marketing site (landing, product pages, pricing, install)
- `deploy/`: installer, RBAC, deployment assets

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/adr/)

## License

The KubeiQ core is licensed under [Apache-2.0](LICENSE). Code in [`ee/`](ee/) is licensed
separately under the [KubeiQ Enterprise License](ee/LICENSE).
