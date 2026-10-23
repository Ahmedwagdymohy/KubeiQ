import { age } from "@/components/manager/kinds";
import type { KindInfo, KubeObject } from "@/lib/api";

type Condition = { type: string; status: string; reason?: string; message?: string };
type Container = { name: string; image?: string };
type ContainerStatus = {
  name: string;
  ready?: boolean;
  restartCount?: number;
  state?: Record<string, { reason?: string }>;
};

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[140px_minmax(0,1fr)] gap-4 py-2 text-sm">
      <span className="text-subtle">{label}</span>
      <span className="min-w-0 break-words">{children}</span>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-medium text-muted">{title}</h3>
      {children}
    </section>
  );
}

function containersOf(obj: KubeObject["object"]): Container[] {
  const spec = obj.spec as
    | { containers?: Container[]; template?: { spec?: { containers?: Container[] } } }
    | undefined;
  const cronJob = obj.spec as
    | { jobTemplate?: { spec?: { template?: { spec?: { containers?: Container[] } } } } }
    | undefined;
  return (
    spec?.containers ??
    spec?.template?.spec?.containers ??
    cronJob?.jobTemplate?.spec?.template?.spec?.containers ??
    []
  );
}

export function ObjectOverview({ detail, kind }: { detail: KubeObject; kind: KindInfo }) {
  const obj = detail.object;
  const meta = obj.metadata ?? {};
  const status = (obj.status ?? {}) as {
    conditions?: Condition[];
    phase?: string;
    replicas?: number;
    readyReplicas?: number;
    containerStatuses?: ContainerStatus[];
    podIP?: string;
  };
  const spec = (obj.spec ?? {}) as { replicas?: number; nodeName?: string; type?: string };
  const labels = Object.entries(meta.labels ?? {});
  const containers = containersOf(obj);
  const statuses = new Map((status.containerStatuses ?? []).map((s) => [s.name, s]));

  return (
    <div className="flex flex-col gap-6 p-6">
      <div className="flex flex-col divide-y divide-border">
        {meta.namespace && <Row label="Namespace">{meta.namespace}</Row>}
        <Row label="Created">
          {meta.creationTimestamp
            ? `${new Date(meta.creationTimestamp).toLocaleString()} (${age(meta.creationTimestamp)} ago)`
            : "Unknown"}
        </Row>
        {status.phase && <Row label="Phase">{status.phase}</Row>}
        {spec.replicas !== undefined && (
          <Row label="Replicas">
            {status.readyReplicas ?? 0} of {spec.replicas} ready
          </Row>
        )}
        {spec.nodeName && <Row label="Node">{spec.nodeName}</Row>}
        {status.podIP && <Row label="Pod IP">{status.podIP}</Row>}
        {kind.kind === "Service" && spec.type && <Row label="Type">{spec.type}</Row>}
        {meta.ownerReferences?.length ? (
          <Row label="Owned by">
            {meta.ownerReferences.map((o) => `${o.kind} ${o.name}`).join(", ")}
          </Row>
        ) : null}
      </div>

      {detail.values_hidden && (
        <p className="text-sm text-muted">
          Secret values are never read. Only names and metadata are shown.
        </p>
      )}

      {containers.length > 0 && (
        <Block title="Containers">
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {containers.map((c) => {
              const s = statuses.get(c.name);
              const waiting = s?.state ? Object.values(s.state)[0]?.reason : undefined;
              return (
                <div key={c.name} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                  <span className="flex items-center justify-between gap-3">
                    <span className="font-medium">{c.name}</span>
                    {s && (
                      <span className={s.ready ? "text-healthy" : "text-danger"}>
                        {s.ready ? "Ready" : (waiting ?? "Not ready")}
                        {s.restartCount ? ` · ${s.restartCount} restarts` : ""}
                      </span>
                    )}
                  </span>
                  {c.image && <code className="break-all font-mono text-xs text-muted">{c.image}</code>}
                </div>
              );
            })}
          </div>
        </Block>
      )}

      {status.conditions?.length ? (
        <Block title="Conditions">
          <div className="flex flex-col divide-y divide-border rounded-md border border-border">
            {status.conditions.map((c) => (
              <div key={c.type} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
                <span className="flex items-center justify-between gap-3">
                  <span>{c.type}</span>
                  <span className={c.status === "True" ? "text-healthy" : "text-muted"}>
                    {c.status === "True" ? "Yes" : c.status === "False" ? "No" : c.status}
                  </span>
                </span>
                {c.message && <span className="text-xs text-subtle">{c.message}</span>}
              </div>
            ))}
          </div>
        </Block>
      ) : null}

      {labels.length > 0 && (
        <Block title="Labels">
          <div className="flex flex-wrap gap-1.5">
            {labels.map(([k, v]) => (
              <code
                key={k}
                className="rounded border border-border bg-surface px-2 py-0.5 font-mono text-xs text-muted"
              >
                {k}={v}
              </code>
            ))}
          </div>
        </Block>
      )}
    </div>
  );
}
