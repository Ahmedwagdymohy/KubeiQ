"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { Section, Switch } from "@/components/settings/fields";
import { Terminal } from "@/components/ui";
import { api } from "@/lib/api";

const RBAC =
  "kubectl apply -f https://raw.githubusercontent.com/Ahmedwagdymohy/KubeiQ/main/deploy/rbac/kubeiq-changes.yaml";

export function ChangesSection() {
  const queryClient = useQueryClient();
  const setting = useQuery({ queryKey: ["settings", "changes"], queryFn: api.changesSetting });
  const save = useMutation({
    mutationFn: api.saveChangesSetting,
    onSuccess: (value) => {
      queryClient.setQueryData(["settings", "changes"], value);
      queryClient.invalidateQueries({ queryKey: ["me"] });
      queryClient.invalidateQueries({ queryKey: ["audit"] });
    },
  });
  const enabled = setting.data?.enabled ?? false;

  return (
    <Section
      id="changes"
      title="Cluster Changes"
      description="KubeiQ is read-only by default. Turn this on to let admins and project editors scale, restart, cordon and delete resources from Cluster Manager. Every change is confirmed and recorded in Activity"
    >
      <div className="flex flex-col gap-4">
        <Switch
          checked={enabled}
          onChange={(value) => save.mutate(value)}
          label={enabled ? "Changes are on" : "Changes are off (read-only)"}
        />
        {save.error && <p className="text-sm text-danger">{save.error.message}</p>}
        {enabled && (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-muted">
              The cluster credentials KubeiQ uses also need permission to make these changes. For
              a KubeiQ service account, apply:
            </p>
            <Terminal commands={[RBAC]} />
          </div>
        )}
      </div>
    </Section>
  );
}
