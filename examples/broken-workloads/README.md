# Broken Workloads

Intentionally failing workloads for testing KubeiQ diagnoses. Everything lives in the `kubeiq-demo` namespace.

| File | Failure | Expected root cause |
|------|---------|---------------------|
| `crashloop-missing-env.yaml` | CrashLoopBackOff | `DATABASE_URL` env var missing |
| `image-pull-bad-tag.yaml` | ImagePullBackOff | image tag does not exist |
| `oom-killed.yaml` | OOMKilled | memory limit (64Mi) too low |
| `selector-mismatch.yaml` | Service without endpoints | selector `app=checkut` vs pod label `app=checkout` |
| `pending-insufficient-cpu.yaml` | Pending | requests 64 CPUs, no node fits |
| `readiness-probe-failure.yaml` | Not ready | probe targets port 8081, app listens on 80 |
| `crashloop-unknown-error.yaml` | CrashLoopBackOff | `queue.concurrency: 0` in ConfigMap (no rule matches; AI agent investigates) |

```bash
kind create cluster --name kubeiq-dev
kubectl apply -f examples/broken-workloads/
# clean up
kubectl delete namespace kubeiq-demo
```
