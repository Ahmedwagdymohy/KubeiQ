# KubeiQ

**AI-powered Kubernetes operations, self-hosted.**

KubeiQ connects to your Kubernetes clusters, investigates failures, and explains the root cause with
actionable fixes — using the LLM provider of your choice, including fully local models.

> Status: early development. See [docs/ROADMAP.md](docs/ROADMAP.md).

## Features (planned for first release)

- **AI Troubleshooting Agent** — investigates pods, events, logs, deployments, and networking, then
  produces a root cause, fix steps, and an evidence-based confidence score.
- **Multi-cluster** — pick any context from your kubeconfig; private clusters via an in-cluster agent (coming).
- **Any LLM** — OpenAI, Anthropic, OpenRouter, Azure, Bedrock, or Ollama via LiteLLM.
- **Safe by default** — read-only access, secret redaction before any model call.

Detected failure types: CrashLoopBackOff, ImagePullBackOff, OOMKilled, Pending/FailedScheduling,
probe failures, stuck rollouts, service selector mismatches, DNS/networking issues.

## Quick start

```bash
docker compose up --build
```

- Dashboard: http://localhost:3000
- API: http://localhost:8000/healthz

Ports already in use? Override them: `KUBEIQ_FRONTEND_PORT=3001 KUBEIQ_BACKEND_PORT=8001 docker compose up --build`.

See [CLAUDE.md](CLAUDE.md) for development commands.

## Documentation

- [Architecture](docs/architecture.md)
- [Roadmap](docs/ROADMAP.md)
- [Architecture decisions](docs/adr/)

## License

The KubeiQ core is licensed under [Apache-2.0](LICENSE). Code in [`ee/`](ee/) is licensed
separately under the [KubeiQ Enterprise License](ee/LICENSE).
