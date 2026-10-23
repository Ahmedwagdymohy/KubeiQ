/**
 * The broken workloads of KubeiQ's demo namespace (examples/broken-workloads), with the root cause
 * Cluster Doctor reports for each and the commands it writes. Used by the live readout on the site.
 */

export type Diagnosis = {
  name: string;
  kind: "Deployment" | "Service" | "Job";
  /** The one-line root cause, as Cluster Doctor writes it. */
  cause: string;
  confidence: number;
  /** What KubeiQ read, in the order it read it. `••••` marks a value masked before any model sees it. */
  evidence: string[];
  step: string;
  fix: string[];
  check: string[];
};

export const NAMESPACE = "kubeiq-demo";
export const CLUSTER = "kind-kubeiq-dev";

export const DIAGNOSES: Diagnosis[] = [
  {
    name: "payment",
    kind: "Deployment",
    cause: "Environment variable DATABASE_URL is missing",
    confidence: 94,
    evidence: [
      "pod payment-6858dfbd56-bv8fn  CrashLoopBackOff, 41 restarts",
      "log  FATAL: required environment variable DATABASE_URL is not set",
      "revision 1  DATABASE_URL=••••  removed in revision 2",
    ],
    step: "Set DATABASE_URL on the app container. The pods restart with the new value",
    fix: ["kubectl set env deployment/payment -c app DATABASE_URL=<database-url> -n kubeiq-demo"],
    check: [
      "kubectl rollout status deployment/payment -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=payment",
    ],
  },
  {
    name: "billing",
    kind: "Deployment",
    cause: "Secret billing-db is missing key 'password'",
    confidence: 96,
    evidence: [
      "pod billing-766df694f7-dnfgw  CreateContainerConfigError",
      "secret billing-db  keys: username  (names only, values never read)",
      "env  DB_PASSWORD from secret billing-db, key password",
    ],
    step: "Add the password key to the Secret, then restart the deployment",
    fix: [
      `kubectl patch secret billing-db -n kubeiq-demo --type merge -p '{"stringData":{"password":"<db-password>"}}'`,
      "kubectl rollout restart deployment/billing -n kubeiq-demo",
    ],
    check: [
      "kubectl rollout status deployment/billing -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=billing",
    ],
  },
  {
    name: "orders",
    kind: "Deployment",
    cause: "A hostname the app needs cannot be resolved (DNS)",
    confidence: 88,
    evidence: [
      "init wait-for-db  Error, exit code 1, 37 restarts",
      "log  ERROR: could not resolve host postgres-orders: Name or service not known",
      "service postgres-orders  not found in kubeiq-demo",
    ],
    step: "Create the postgres-orders Service, or point the app at the database host that exists",
    fix: [
      "kubectl get services -n kubeiq-demo",
      "kubectl logs deployment/orders -c wait-for-db -n kubeiq-demo --previous",
    ],
    check: [
      "kubectl rollout status deployment/orders -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=orders",
    ],
  },
  {
    name: "analytics",
    kind: "Deployment",
    cause: "Pod requests 64 cpu; no node has that free",
    confidence: 97,
    evidence: [
      "pod analytics-6b56dbf59d-hc7m5  Pending",
      "event  0/1 nodes are available: 1 Insufficient cpu",
      "node kubeiq-dev-control-plane  allocatable cpu 8",
    ],
    step: "Lower the CPU request to what a node can give",
    fix: ["kubectl set resources deployment/analytics -c engine --requests=cpu=500m -n kubeiq-demo"],
    check: [
      "kubectl rollout status deployment/analytics -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=analytics",
    ],
  },
  {
    name: "report-worker",
    kind: "Deployment",
    cause: "Memory limit 64Mi is too low (container OOMKilled)",
    confidence: 92,
    evidence: [
      "container worker  OOMKilled, exit code 137",
      "resources  requests memory 32Mi, limits memory 64Mi",
      "event  Back-off restarting failed container worker",
    ],
    step: "Raise the memory limit to 256Mi. If it is killed again, raise it further",
    fix: [
      "kubectl set resources deployment/report-worker -c worker --limits=memory=256Mi -n kubeiq-demo",
    ],
    check: [
      "kubectl rollout status deployment/report-worker -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=report-worker",
    ],
  },
  {
    name: "inventory",
    kind: "Deployment",
    cause: "Readiness probe uses port 8081; container listens on 80",
    confidence: 95,
    evidence: [
      "pod inventory-58579897d5-4x6z6  Running, 0/1 ready",
      "probe  GET :8081/healthz  connection refused",
      "container api  containerPort 80",
    ],
    step: "Point the readiness probe at port 80",
    fix: [
      `kubectl patch deployment inventory -n kubeiq-demo --type json -p '[{"op":"replace","path":"/spec/template/spec/containers/0/readinessProbe/httpGet/port","value":80}]'`,
    ],
    check: [
      "kubectl rollout status deployment/inventory -n kubeiq-demo --timeout=120s",
      "kubectl get pods -n kubeiq-demo -l app=inventory",
    ],
  },
  {
    name: "checkout",
    kind: "Service",
    cause: "Service selector app=checkut matches no pods (pods use app=checkout)",
    confidence: 98,
    evidence: [
      "service checkout  selector app=checkut, 0 endpoints",
      "pods  app=checkout, 1 running",
      "deployment checkout  1/1 ready",
    ],
    step: "Fix the typo in the Service selector",
    fix: [`kubectl patch service checkout -n kubeiq-demo -p '{"spec":{"selector":{"app":"checkout"}}}'`],
    check: ["kubectl get endpoints checkout -n kubeiq-demo"],
  },
];

/** Values Cluster Doctor cannot know are named placeholders, highlighted for the reader. */
export const PLACEHOLDER = /(<[a-z][a-z0-9-]*>)/;
