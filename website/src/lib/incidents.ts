/**
 * Real Cluster Doctor output from the demo workloads in `examples/` (namespace kubeiq-demo),
 * used on the landing page so every root cause and command shown is one KubeiQ produced.
 */
export type Incident = {
  workload: string;
  kind: "Deployment" | "Job";
  symptom: string;
  rootCause: string;
  why: string;
  commands: string[];
  verify: string[];
  confidence: number;
  /** Found by the built-in rules, or needs the AI agent. */
  foundBy: "rules" | "agent";
};

export const INCIDENTS: Incident[] = [
  {
    workload: "payment",
    kind: "Deployment",
    symptom: "CrashLoopBackOff, 126 restarts",
    rootCause: "Environment variable DATABASE_URL is missing",
    why: "Container app keeps crashing with exit code 1 because DATABASE_URL is not set",
    commands: [
      "kubectl set env deployment/payment DATABASE_URL=<database-url> -c app -n kubeiq-demo",
    ],
    verify: ["kubectl rollout status deployment/payment -n kubeiq-demo --timeout=120s"],
    confidence: 94,
    foundBy: "rules",
  },
  {
    workload: "billing",
    kind: "Deployment",
    symptom: "CreateContainerConfigError",
    rootCause: "Secret billing-db is missing key 'password'",
    why: "Container api cannot be created: the key password is not in Secret billing-db",
    commands: [
      `kubectl patch secret billing-db -n kubeiq-demo --type merge -p '{"stringData":{"password":"<password>"}}'`,
      "kubectl rollout restart deployment/billing -n kubeiq-demo",
    ],
    verify: ["kubectl rollout status deployment/billing -n kubeiq-demo --timeout=120s"],
    confidence: 92,
    foundBy: "rules",
  },
  {
    workload: "analytics",
    kind: "Deployment",
    symptom: "Pending for 25 hours",
    rootCause: "Pod requests 64 cpu; no node has that free",
    why: "The pod cannot be scheduled on any node until the request fits",
    commands: [
      "kubectl set resources deployment/analytics -c engine --requests=cpu=5 -n kubeiq-demo",
    ],
    verify: ["kubectl rollout status deployment/analytics -n kubeiq-demo --timeout=120s"],
    confidence: 92,
    foundBy: "rules",
  },
  {
    workload: "report-worker",
    kind: "Deployment",
    symptom: "OOMKilled",
    rootCause: "Memory limit 64Mi is too low (container OOMKilled)",
    why: "Container worker was killed for using more memory than its limit",
    commands: [
      "kubectl set resources deployment/report-worker -c worker --limits=memory=256Mi -n kubeiq-demo",
    ],
    verify: ["kubectl rollout status deployment/report-worker -n kubeiq-demo --timeout=120s"],
    confidence: 92,
    foundBy: "rules",
  },
  {
    workload: "inventory",
    kind: "Deployment",
    symptom: "Readiness probe failed 7,476 times",
    rootCause: "Readiness probe uses port 8081; container listens on 80",
    why: "The probe calls a port nothing listens on, so the pod never becomes ready",
    commands: [
      `kubectl patch deployment/inventory -n kubeiq-demo --type json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80}]'`,
    ],
    verify: ["kubectl rollout status deployment/inventory -n kubeiq-demo --timeout=120s"],
    confidence: 92,
    foundBy: "rules",
  },
  {
    workload: "checkout",
    kind: "Deployment",
    symptom: "Service has no endpoints",
    rootCause: "Service selector app=checkut matches no pods (pods use app=checkout)",
    why: "A typo in the selector leaves the Service with nothing to send traffic to",
    commands: [
      `kubectl patch service checkout -n kubeiq-demo -p '{"spec":{"selector":{"app":"checkout"}}}'`,
    ],
    verify: ["kubectl get endpointslices -n kubeiq-demo -l kubernetes.io/service-name=checkout"],
    confidence: 92,
    foundBy: "rules",
  },
  {
    workload: "queue-worker",
    kind: "Deployment",
    symptom: "CrashLoopBackOff, 130 restarts",
    rootCause: "ConfigMap queue-worker-config: queue.concurrency is 0 (allowed 1-64)",
    why: "The worker validates its mounted config on start and panics on a concurrency of 0",
    commands: [
      `kubectl -n kubeiq-demo patch configmap queue-worker-config --type merge -p '{"data":{"config.yaml":"queue:\\n  name: orders\\n  concurrency: 4\\n"}}'`,
      "kubectl -n kubeiq-demo rollout restart deployment/queue-worker",
    ],
    verify: ["kubectl rollout status deployment/queue-worker -n kubeiq-demo --timeout=120s"],
    confidence: 82,
    foundBy: "agent",
  },
  {
    workload: "orders",
    kind: "Deployment",
    symptom: "Init:CrashLoopBackOff, 160 restarts",
    rootCause: "Service postgres-orders does not exist in namespace kubeiq-demo",
    why: "Init container wait-for-db polls postgres-orders:5432 and the name does not resolve",
    commands: [
      "kubectl -n kubeiq-demo create service externalname postgres-orders --external-name=<postgres-fqdn>",
      "kubectl -n kubeiq-demo rollout restart deployment/orders",
    ],
    verify: ["kubectl rollout status deployment/orders -n kubeiq-demo --timeout=120s"],
    confidence: 72,
    foundBy: "agent",
  },
  {
    workload: "db-migrate",
    kind: "Job",
    symptom: "Job failed, exit code 3",
    rootCause: "Migration 0042 hit a lock timeout on table 'invoices', held by DB pid 4711",
    why: "Another database session holds the lock the migration needs",
    commands: [
      "kubectl -n kubeiq-demo delete job db-migrate",
      "kubectl -n kubeiq-demo apply -f db-migrate-job.yaml",
    ],
    verify: ["kubectl wait --for=condition=complete job/db-migrate -n kubeiq-demo --timeout=120s"],
    confidence: 68,
    foundBy: "agent",
  },
];

/** The demo cluster as the app's Overview shows it: one entry per workload. */
export const WORKLOADS: { name: string; namespace: string; failing: boolean }[] = [
  ...INCIDENTS.filter((i) => i.workload !== "checkout").map((i) => ({
    name: i.workload,
    namespace: "kubeiq-demo",
    failing: true,
  })),
  { name: "checkout", namespace: "kubeiq-demo", failing: false },
  { name: "frontend", namespace: "kubeiq-demo", failing: false },
  { name: "coredns", namespace: "kube-system", failing: false },
  { name: "etcd", namespace: "kube-system", failing: false },
  { name: "kube-apiserver", namespace: "kube-system", failing: false },
  { name: "kube-controller-manager", namespace: "kube-system", failing: false },
  { name: "kube-scheduler", namespace: "kube-system", failing: false },
  { name: "kube-proxy", namespace: "kube-system", failing: false },
  { name: "kindnet", namespace: "kube-system", failing: false },
  { name: "local-path-provisioner", namespace: "local-path-storage", failing: false },
];
