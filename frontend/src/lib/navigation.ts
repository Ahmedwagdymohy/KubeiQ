/**
 * The app's navigation: products, resource groups and system pages. The sidebar, the command
 * palette and the breadcrumb all read from here, so a page is named the same way everywhere.
 */

export type ResourceItem = {
  /** Cluster Manager kind key, e.g. "apps/v1/deployments" ("core/v1/pods" for the core group). */
  kind: string;
  resource: string;
  label: string;
  namespaced: boolean;
};

export type ResourceGroup = { name: string; icon: string; items: ResourceItem[] };

const item = (kind: string, label: string, namespaced = true): ResourceItem => ({
  kind,
  resource: kind.split("/")[2],
  label,
  namespaced,
});

export const RESOURCE_GROUPS: ResourceGroup[] = [
  {
    name: "Workloads",
    icon: "pods",
    items: [
      item("core/v1/pods", "Pods"),
      item("apps/v1/deployments", "Deployments"),
      item("apps/v1/statefulsets", "StatefulSets"),
      item("apps/v1/daemonsets", "DaemonSets"),
      item("apps/v1/replicasets", "ReplicaSets"),
      item("batch/v1/jobs", "Jobs"),
      item("batch/v1/cronjobs", "CronJobs"),
      item("autoscaling/v2/horizontalpodautoscalers", "Autoscalers"),
    ],
  },
  {
    name: "Network",
    icon: "services",
    items: [
      item("core/v1/services", "Services"),
      item("networking.k8s.io/v1/ingresses", "Ingresses"),
      item("networking.k8s.io/v1/networkpolicies", "Network Policies"),
      item("discovery.k8s.io/v1/endpointslices", "Endpoint Slices"),
      item("gateway.networking.k8s.io/v1/gateways", "Gateways"),
      item("gateway.networking.k8s.io/v1/httproutes", "HTTP Routes"),
    ],
  },
  {
    name: "Config",
    icon: "configmaps",
    items: [
      item("core/v1/configmaps", "ConfigMaps"),
      item("core/v1/secrets", "Secrets"),
      item("core/v1/resourcequotas", "Resource Quotas"),
      item("core/v1/limitranges", "Limit Ranges"),
      item("policy/v1/poddisruptionbudgets", "Disruption Budgets"),
    ],
  },
  {
    name: "Storage",
    icon: "persistentvolumeclaims",
    items: [
      item("core/v1/persistentvolumeclaims", "Volume Claims"),
      item("core/v1/persistentvolumes", "Volumes", false),
      item("storage.k8s.io/v1/storageclasses", "Storage Classes", false),
    ],
  },
  {
    name: "Access",
    icon: "serviceaccounts",
    items: [
      item("core/v1/serviceaccounts", "Service Accounts"),
      item("rbac.authorization.k8s.io/v1/roles", "Roles"),
      item("rbac.authorization.k8s.io/v1/rolebindings", "Role Bindings"),
      item("rbac.authorization.k8s.io/v1/clusterroles", "Cluster Roles", false),
      item("rbac.authorization.k8s.io/v1/clusterrolebindings", "Cluster Role Bindings", false),
    ],
  },
  {
    name: "Cluster",
    icon: "nodes",
    items: [
      item("core/v1/nodes", "Nodes", false),
      item("core/v1/namespaces", "Namespaces", false),
      item("core/v1/events", "Events"),
      item("apiextensions.k8s.io/v1/customresourcedefinitions", "Custom Resources", false),
    ],
  },
];

export const resourceHref = (kind: string) => `/manager?kind=${kind}`;

/** The group and item a Cluster Manager kind key belongs to. Versions may differ by cluster. */
export function findResource(kind: string | null): { group: ResourceGroup; item: ResourceItem } | null {
  if (!kind) return null;
  const [g, , r] = kind.split("/");
  for (const group of RESOURCE_GROUPS) {
    const found = group.items.find((i) => {
      const [ig, , ir] = i.kind.split("/");
      return ig === g && ir === r;
    });
    if (found) return { group, item: found };
  }
  return null;
}

export const MAX_PINS = 5;
