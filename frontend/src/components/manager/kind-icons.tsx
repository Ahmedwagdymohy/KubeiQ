import type { ReactNode, SVGProps } from "react";

/** One icon per Kubernetes kind, drawn in the stroke style of components/icons. */
type IconProps = SVGProps<SVGSVGElement>;

function Icon({ children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="16"
      height="16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

// A cube: the pod, the unit everything else runs.
const cube = (
  <>
    <path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z" />
    <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
  </>
);

const SHAPES: Record<string, ReactNode> = {
  pods: cube,
  // Layers: a rolled-out set of replicas.
  deployments: (
    <>
      <path d="m12 3 9 4.5-9 4.5-9-4.5Z" />
      <path d="m3 12 9 4.5 9-4.5" />
      <path d="m3 16.5 9 4.5 9-4.5" />
    </>
  ),
  // A database: replicas with their own storage.
  statefulsets: (
    <>
      <ellipse cx="12" cy="5.5" rx="7.5" ry="2.5" />
      <path d="M4.5 5.5v13c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5v-13" />
      <path d="M4.5 12c0 1.4 3.4 2.5 7.5 2.5s7.5-1.1 7.5-2.5" />
    </>
  ),
  // Server rows: one pod on every node.
  daemonsets: (
    <>
      <rect x="3.5" y="4" width="17" height="7" rx="1.5" />
      <rect x="3.5" y="13" width="17" height="7" rx="1.5" />
      <path d="M7.5 7.5h.01M7.5 16.5h.01" />
    </>
  ),
  // Copies.
  replicasets: (
    <>
      <rect x="8" y="8" width="12.5" height="12.5" rx="2" />
      <path d="M16 8V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2V14a2 2 0 0 0 2 2H8" />
    </>
  ),
  // A stopwatch: runs once to completion.
  jobs: (
    <>
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V10M10 2.5h4M18.5 6.5 17 8" />
    </>
  ),
  cronjobs: (
    <>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
      <path d="M8 3v4M16 3v4M3.5 10h17M8 14h.01M12 14h.01M16 14h.01M8 17h.01M12 17h.01" />
    </>
  ),
  // Network: one address in front of many pods.
  services: (
    <>
      <circle cx="12" cy="5.5" r="2.5" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
      <path d="M12 8v4M12 12l-5 4.5M12 12l5 4.5" />
    </>
  ),
  ingresses: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17M12 3.5c2.4 2.3 3.5 5.2 3.5 8.5s-1.1 6.2-3.5 8.5c-2.4-2.3-3.5-5.2-3.5-8.5S9.6 5.8 12 3.5Z" />
    </>
  ),
  ingressclasses: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 12h7M12 8.5v7" />
    </>
  ),
  networkpolicies: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  endpointslices: (
    <>
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8.3 11 15.7 7M8.3 13l7.4 4" />
    </>
  ),
  gateways: (
    <>
      <path d="M4 20V9l8-5 8 5v11" />
      <path d="M9 20v-6h6v6" />
    </>
  ),
  httproutes: (
    <>
      <circle cx="6" cy="18" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" />
    </>
  ),
  // Configuration.
  configmaps: (
    <>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" />
      <path d="M14 3v5h5M9 13h6M9 17h6" />
    </>
  ),
  secrets: (
    <>
      <rect x="4.5" y="10.5" width="15" height="10" rx="2" />
      <path d="M8 10.5V7.5a4 4 0 0 1 8 0v3M12 15v1.5" />
    </>
  ),
  // A gauge: scales with load.
  horizontalpodautoscalers: (
    <>
      <path d="M4.5 18a8.5 8.5 0 1 1 15 0" />
      <path d="m12 13 3.5-4" />
      <circle cx="12" cy="13.5" r="1" />
    </>
  ),
  poddisruptionbudgets: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z" />
      <path d="M12 8.5v4M12 15.5h.01" />
    </>
  ),
  resourcequotas: (
    <>
      <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5H12Z" />
      <path d="M15 3.8A8.5 8.5 0 0 1 20.2 9H15Z" />
    </>
  ),
  limitranges: (
    <>
      <path d="M4 7h16M4 17h16" />
      <path d="M8 4v6M16 14v6" />
    </>
  ),
  priorityclasses: (
    <>
      <path d="M6 20V10M12 20V4M18 20v-7" />
    </>
  ),
  validatingwebhookconfigurations: (
    <>
      <path d="M9 7.5 4.5 12 9 16.5M15 7.5l4.5 4.5-4.5 4.5" />
    </>
  ),
  mutatingwebhookconfigurations: (
    <>
      <path d="M9 7.5 4.5 12 9 16.5M15 7.5l4.5 4.5-4.5 4.5M13 5l-2 14" />
    </>
  ),
  // Storage.
  persistentvolumeclaims: (
    <>
      <path d="M3.5 13h17l-2.5-7.5H6Z" />
      <rect x="3.5" y="13" width="17" height="6" rx="1.5" />
      <path d="M7.5 16h.01M11 16h.01" />
    </>
  ),
  persistentvolumes: (
    <>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M3.5 12h17M7.5 8.5h.01M7.5 15.5h.01" />
    </>
  ),
  storageclasses: (
    <>
      <path d="M4 8.5h16M4 15.5h16" />
      <rect x="3.5" y="4" width="17" height="16" rx="2" />
    </>
  ),
  csidrivers: (
    <>
      <rect x="6" y="6" width="12" height="12" rx="1.5" />
      <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
    </>
  ),
  // Access.
  serviceaccounts: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </>
  ),
  roles: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z" />
    </>
  ),
  clusterroles: (
    <>
      <path d="M12 3 19.5 6v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6Z" />
      <path d="M12 8v7M8.5 11.5h7" />
    </>
  ),
  rolebindings: (
    <>
      <path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" />
      <path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" />
    </>
  ),
  // Cluster.
  nodes: (
    <>
      <rect x="3.5" y="4" width="17" height="11" rx="2" />
      <path d="M8 20h8M12 15v5" />
    </>
  ),
  namespaces: (
    <>
      <rect x="3.5" y="3.5" width="17" height="17" rx="2" strokeDasharray="3 2.5" />
      <path d="M8 12h8" />
    </>
  ),
  events: <path d="M3.5 12h3.5l2.5-6.5 5 13 2.5-6.5h3.5" />,
  customresourcedefinitions: (
    <path d="M9.5 4.5a2 2 0 0 1 4 0V6H17a1 1 0 0 1 1 1v3.5h-1.5a2 2 0 0 0 0 4H18V18a1 1 0 0 1-1 1h-3.5v-1.5a2 2 0 0 0-4 0V19H6a1 1 0 0 1-1-1v-3.5h1.5a2 2 0 0 0 0-4H5V7a1 1 0 0 1 1-1h3.5Z" />
  ),
};
SHAPES.clusterrolebindings = SHAPES.rolebindings;

// Kinds without their own icon (custom resources, rare built-ins).
const OTHER = (
  <>
    <rect x="4.5" y="4.5" width="15" height="15" rx="3" />
    <circle cx="12" cy="12" r="2" />
  </>
);

export function KindIcon({ resource, ...props }: IconProps & { resource: string }) {
  return <Icon {...props}>{SHAPES[resource] ?? OTHER}</Icon>;
}
