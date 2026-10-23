"use client";

import { useQuery } from "@tanstack/react-query";

import { Section } from "@/components/settings/fields";
import { api, type AuditEvent } from "@/lib/api";

const ACTIONS: Record<string, string> = {
  "auth.login": "Signed in",
  "auth.password": "Changed their password",
  "user.create": "Added user",
  "user.update": "Updated user",
  "user.delete": "Removed user",
  "project.create": "Added project",
  "project.update": "Updated project",
  "project.delete": "Deleted project",
  "settings.ai": "Changed the AI model",
  "settings.kubeconfig.add": "Added kubeconfig",
  "settings.kubeconfig.delete": "Removed a kubeconfig",
  "settings.changes": "Changed cluster change settings",
  "k8s.scale": "Scaled",
  "k8s.restart": "Restarted",
  "k8s.delete": "Deleted",
  "k8s.cordon": "Cordoned",
  "k8s.uncordon": "Uncordoned",
};

function describe(event: AuditEvent) {
  const action = ACTIONS[event.action] ?? event.action;
  if (event.action === "auth.login" && !event.ok) return "Failed sign-in";
  return event.target ? `${action} ${event.target}` : action;
}

export function ActivitySection() {
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => api.audit(100) });
  return (
    <Section
      id="activity"
      title="Activity"
      description="Sign-ins, access and settings changes, and every change made to a cluster"
    >
      <div className="max-w-3xl overflow-x-auto rounded-md border border-border">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs text-subtle">
            <tr>
              <th className="px-4 py-2 font-medium">When</th>
              <th className="px-4 py-2 font-medium">Who</th>
              <th className="px-4 py-2 font-medium">What</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {audit.data?.map((event) => (
              <tr key={event.id}>
                <td className="whitespace-nowrap px-4 py-2 text-muted">
                  {new Date(event.created_at).toLocaleString()}
                </td>
                <td className="px-4 py-2">{event.username}</td>
                <td className={`px-4 py-2 ${event.ok ? "" : "text-danger"}`}>
                  {describe(event)}
                  {event.detail && <span className="text-muted"> · {event.detail}</span>}
                  {event.namespace && <span className="text-muted"> · {event.namespace}</span>}
                </td>
              </tr>
            ))}
            {audit.data?.length === 0 && (
              <tr>
                <td colSpan={3} className="px-4 py-6 text-center text-muted">
                  Nothing yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Section>
  );
}
