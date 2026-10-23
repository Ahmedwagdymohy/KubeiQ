/**
 * A real Cluster Doctor scan of the kubeiq-demo namespace on a kind cluster (KubeiQ's own demo
 * workloads, broken on purpose). Used by the bearing finder and the incident plate on the website.
 * Each workload gets a bearing on the wheel: 360 degrees shared by the nine findings.
 */

export type Finding = {
  name: string;
  kind: string;
  bearing: number;
  rootCause: string;
  explanation: string;
  fix: string[];
  commands: string[];
  verify: string[];
  confidence: number;
  affected: string[];
  prevention: string | null;
};

export const SCAN = {
  cluster: "kind-kubeiq-dev",
  namespace: "kubeiq-demo",
  finished: "23:04:40",
  date: "22 Oct 2026",
  seconds: 15,
  checked: { pods: 11, workloads: 9, services: 1, nodes: 1, events: 8, logs: 13 },
};

export const FINDINGS: Finding[] = [
  {
    "name": "payment",
    "kind": "Deployment",
    "bearing": 0,
    "rootCause": "Environment variable DATABASE_URL is missing",
    "explanation": "Container 'app' keeps crashing (126 restarts, last exit code 1). Environment variable DATABASE_URL is missing.",
    "fix": [
      "Add DATABASE_URL to the container env, usually from a Secret or ConfigMap"
    ],
    "commands": [
      "kubectl set env deployment/payment DATABASE_URL=<database-url> -c app -n kubeiq-demo"
    ],
    "verify": [
      "kubectl rollout status deployment/payment -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=payment"
    ],
    "confidence": 94,
    "affected": [
      "Deployment/kubeiq-demo/payment",
      "Pod/kubeiq-demo/payment-6858dfbd56-bv8fn",
      "Pod/kubeiq-demo/payment-6858dfbd56-tj6s7"
    ],
    "prevention": "Validate required configuration at startup and in CI before deploying"
  },
  {
    "name": "report-worker",
    "kind": "Deployment",
    "bearing": 40,
    "rootCause": "Memory limit 64Mi is too low (container OOMKilled)",
    "explanation": "Container 'worker' was killed for using too much memory. Memory limit 64Mi is too low (container OOMKilled).",
    "fix": [
      "Raise the memory limit to 256Mi. If it is killed again, raise it further or reduce the app's memory usage"
    ],
    "commands": [
      "kubectl set resources deployment/report-worker -c worker --limits=memory=256Mi -n kubeiq-demo"
    ],
    "verify": [
      "kubectl rollout status deployment/report-worker -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=report-worker"
    ],
    "confidence": 92,
    "affected": [
      "Deployment/kubeiq-demo/report-worker",
      "Pod/kubeiq-demo/report-worker-f969ccf64-8d2hn"
    ],
    "prevention": "Set memory limits from observed usage and alert when usage nears the limit"
  },
  {
    "name": "billing",
    "kind": "Deployment",
    "bearing": 80,
    "rootCause": "Secret billing-db is missing key 'password'",
    "explanation": "Container 'api' cannot be created: couldn't find key password in Secret kubeiq-demo/billing-db. Secret billing-db is missing key 'password'.",
    "fix": [
      "Add key 'password' to Secret billing-db, or fix the key name in the pod spec"
    ],
    "commands": [
      "kubectl patch secret billing-db -n kubeiq-demo --type merge -p '{\"stringData\":{\"password\":\"<password>\"}}'",
      "kubectl rollout restart deployment/billing -n kubeiq-demo"
    ],
    "verify": [
      "kubectl rollout status deployment/billing -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=billing"
    ],
    "confidence": 92,
    "affected": [
      "Deployment/kubeiq-demo/billing",
      "Pod/kubeiq-demo/billing-766df694f7-dnfgw"
    ],
    "prevention": null
  },
  {
    "name": "inventory",
    "kind": "Deployment",
    "bearing": 120,
    "rootCause": "Readiness probe uses port 8081; container listens on 80",
    "explanation": "Readiness probe failing for pod inventory-58579897d5-4x6z6 (7476 times): Readiness probe failed: Get \"http://10.244.0.9:8081/healthz\": dial tcp 10.244.0.9:8081: connect: connection refused. Readiness probe uses port 8081; container listens on 80.",
    "fix": [
      "Point the readiness probe at the port the app actually serves"
    ],
    "commands": [
      "kubectl patch deployment/inventory -n kubeiq-demo --type json -p '[{\"op\":\"replace\",\"path\":\"/spec/template/spec/containers/0/readinessProbe/httpGet/port\",\"value\":80}]'"
    ],
    "verify": [
      "kubectl rollout status deployment/inventory -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=inventory"
    ],
    "confidence": 92,
    "affected": [
      "Deployment/kubeiq-demo/inventory",
      "Pod/kubeiq-demo/inventory-58579897d5-4x6z6"
    ],
    "prevention": "Keep probe ports and paths in sync with the app, and test them in CI"
  },
  {
    "name": "analytics",
    "kind": "Deployment",
    "bearing": 160,
    "rootCause": "Pod requests 64 cpu; no node has that free",
    "explanation": "Pod analytics-6b56dbf59d-hc7m5 cannot be scheduled on any node. Pod requests 64 cpu; no node has that free.",
    "fix": [
      "Lower the cpu request, add nodes, or free capacity on existing nodes"
    ],
    "commands": [
      "kubectl set resources deployment/analytics -c engine --requests=cpu=5 -n kubeiq-demo"
    ],
    "verify": [
      "kubectl rollout status deployment/analytics -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=analytics"
    ],
    "confidence": 92,
    "affected": [
      "Deployment/kubeiq-demo/analytics",
      "Pod/kubeiq-demo/analytics-6b56dbf59d-hc7m5"
    ],
    "prevention": "Right-size resource requests and monitor cluster capacity"
  },
  {
    "name": "orders",
    "kind": "Deployment",
    "bearing": 200,
    "rootCause": "Service postgres-orders does not exist in namespace kubeiq-demo (init container wait-for-db cannot resolve it)",
    "explanation": "The init container wait-for-db in Deployment orders polls postgres-orders:5432 and exits 1 with \"Name or service not known\". The Service lookup returns 404, and no postgres pod runs in kubeiq-demo. DNS in the cluster is probably fine. The init container never completes, so the api container stays in PodInitializing and the rollout times out.",
    "fix": [
      "Check whether a Postgres Service for orders exists in another namespace or under a different name.",
      "If Postgres runs elsewhere, create Service postgres-orders in kubeiq-demo as an ExternalName pointing to its FQDN.",
      "If Postgres is not deployed, deploy it and expose it as Service postgres-orders on port 5432.",
      "Restart Deployment orders and confirm the init container completes."
    ],
    "commands": [
      "kubectl -n kubeiq-demo create service externalname postgres-orders --external-name=<postgres-fqdn>",
      "kubectl -n kubeiq-demo rollout restart deployment/orders"
    ],
    "verify": [
      "kubectl rollout status deployment/orders -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=orders"
    ],
    "confidence": 72,
    "affected": [
      "Deployment/kubeiq-demo/orders",
      "Pod/kubeiq-demo/orders-65c6855c7-sddzj"
    ],
    "prevention": "Deploy the database Service together with its dependents, and alert on init containers that keep restarting."
  },
  {
    "name": "queue-worker",
    "kind": "Deployment",
    "bearing": 240,
    "rootCause": "ConfigMap queue-worker-config: config.yaml queue.concurrency is 0 (allowed 1-64)",
    "explanation": "The worker container reads /etc/worker/config.yaml, which is mounted from ConfigMap queue-worker-config. It sets queue.concurrency to 0. Config validation panics and the container exits with code 2, so the pod goes into CrashLoopBackOff and the Deployment has 0/1 ready replicas.",
    "fix": [
      "Edit ConfigMap queue-worker-config and set queue.concurrency to a value from 1 to 64, for example 4.",
      "Restart Deployment queue-worker so the pod reads the new config.",
      "Check that the pod becomes Ready and the logs no longer show a validation panic."
    ],
    "commands": [
      "kubectl -n kubeiq-demo patch configmap queue-worker-config --type merge -p '{\"data\":{\"config.yaml\":\"queue:\\n  name: orders\\n  concurrency: 4\\n\"}}'",
      "kubectl -n kubeiq-demo rollout restart deployment/queue-worker"
    ],
    "verify": [
      "kubectl rollout status deployment/queue-worker -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=queue-worker"
    ],
    "confidence": 82,
    "affected": [
      "Deployment/kubeiq-demo/queue-worker",
      "Pod/kubeiq-demo/queue-worker-55d646866b-5p4x6"
    ],
    "prevention": "Validate config values in CI, or add a schema check, before ConfigMap changes are applied."
  },
  {
    "name": "checkout",
    "kind": "Deployment",
    "bearing": 280,
    "rootCause": "Service selector app=checkut matches no pods (pods use app=checkout)",
    "explanation": "Service checkout selects no pods (selector app=checkut). Service selector app=checkut matches no pods (pods use app=checkout).",
    "fix": [
      "Change the Service selector to app=checkout"
    ],
    "commands": [
      "kubectl patch service checkout -n kubeiq-demo -p '{\"spec\":{\"selector\":{\"app\":\"checkout\"}}}'"
    ],
    "verify": [
      "kubectl get endpointslices -n kubeiq-demo -l kubernetes.io/service-name=checkout"
    ],
    "confidence": 92,
    "affected": [
      "Service/kubeiq-demo/checkout"
    ],
    "prevention": "Define Service selectors and pod labels in one place (Helm, Kustomize)"
  },
  {
    "name": "db-migrate",
    "kind": "Job",
    "bearing": 320,
    "rootCause": "Migration 0042 hit a lock timeout on table 'invoices', held by DB pid 4711",
    "explanation": "Container 'migrate' in Job/db-migrate ran migration 0042_add_invoice_index and exited with code 3. It logged \"lock timeout acquiring table 'invoices' (held by pid 4711)\". Another DB session (pid 4711) holds the lock on 'invoices'. The Job has backoffLimit 0, so the single failed pod failed the whole Job. This is an application/database problem, not a Kubernetes one.",
    "fix": [
      "Find the session with pid 4711 in the database and check what it is doing.",
      "Wait for it to finish, or terminate it if it is stuck or safe to kill.",
      "Delete the failed Job db-migrate.",
      "Re-create the Job from its manifest to rerun migration 0042.",
      "Confirm the Job completes."
    ],
    "commands": [
      "kubectl -n kubeiq-demo delete job db-migrate",
      "kubectl -n kubeiq-demo apply -f db-migrate-job.yaml"
    ],
    "verify": [
      "kubectl wait --for=condition=complete job/db-migrate -n kubeiq-demo --timeout=120s",
      "kubectl -n kubeiq-demo get job db-migrate -o yaml > db-migrate-job.yaml"
    ],
    "confidence": 68,
    "affected": [
      "Pod/kubeiq-demo/db-migrate-f6kn9"
    ],
    "prevention": "Run migrations in a low-traffic window and add a retry or higher backoffLimit for lock timeouts."
  }
];
