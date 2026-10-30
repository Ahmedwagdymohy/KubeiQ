"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { Field, input, primaryButton, secondaryButton, Section, Switch } from "@/components/settings/fields";
import { api, type AlertRules, type Channel, type ChannelType } from "@/lib/api";

type FieldSpec = { key: string; label: string; secret?: boolean; placeholder?: string; hint?: string };

const TYPES: Record<ChannelType, { label: string; fields: FieldSpec[] }> = {
  slack: { label: "Slack", fields: [{ key: "url", label: "Incoming webhook URL", secret: true, placeholder: "https://hooks.slack.com/services/..." }] },
  teams: { label: "Microsoft Teams", fields: [{ key: "url", label: "Workflow webhook URL", secret: true, placeholder: "https://...webhook.office.com/..." }] },
  discord: { label: "Discord", fields: [{ key: "url", label: "Webhook URL", secret: true, placeholder: "https://discord.com/api/webhooks/..." }] },
  telegram: {
    label: "Telegram",
    fields: [
      { key: "token", label: "Bot token", secret: true, placeholder: "123456:ABC..." },
      { key: "chat_id", label: "Chat ID", placeholder: "-1001234567890" },
    ],
  },
  webhook: {
    label: "Webhook",
    fields: [
      { key: "url", label: "URL", secret: true, placeholder: "https://example.com/kubeiq" },
      { key: "secret", label: "Signing secret", secret: true, hint: "Optional. Requests carry X-KubeiQ-Signature: sha256=<HMAC of the body>" },
    ],
  },
  email: {
    label: "Email",
    fields: [
      { key: "host", label: "SMTP server", placeholder: "smtp.example.com" },
      { key: "port", label: "Port", placeholder: "587", hint: "587 uses STARTTLS, 465 TLS" },
      { key: "username", label: "Username" },
      { key: "password", label: "Password", secret: true },
      { key: "sender", label: "From", placeholder: "kubeiq@example.com" },
      { key: "to", label: "To", placeholder: "oncall@example.com, team@example.com" },
    ],
  },
};

/** Settings › Notifications: where alerts go and which events send them. */
export function NotificationsSection() {
  const queryClient = useQueryClient();
  const data = useQuery({ queryKey: ["notifications"], queryFn: api.notifications });
  const [editing, setEditing] = useState<Channel | "new" | null>(null);
  const set = (next: Awaited<ReturnType<typeof api.notifications>>) => queryClient.setQueryData(["notifications"], next);
  const remove = useMutation({ mutationFn: api.deleteChannel, onSuccess: set });
  const toggle = useMutation({
    mutationFn: (c: Channel) => api.saveChannel({ id: c.id, name: c.name, type: c.type, enabled: !c.enabled, config: c.config }),
    onSuccess: set,
  });

  return (
    <Section
      id="notifications"
      title="Notifications"
      description="Alerts in Slack, Teams, Discord, Telegram, email or your own webhook when a cluster needs attention. Each alert is sent once, again after the cooldown if it is still on, and when it is resolved"
    >
      <div className="flex flex-col gap-8">
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">Channels</h2>
            {editing === null && (
              <button type="button" className={secondaryButton} onClick={() => setEditing("new")}>
                Add Channel
              </button>
            )}
          </div>
          {data.data?.channels.length === 0 && editing === null && (
            <p className="text-sm text-muted">No channels yet. Alerts go nowhere until you add one</p>
          )}
          <ul className="flex flex-col gap-2">
            {data.data?.channels.map((c) => (
              <li key={c.id} className="flex flex-col gap-1.5 rounded-lg border border-border bg-bg px-4 py-3">
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-subtle">{TYPES[c.type].label}</span>
                  <span className="ml-auto flex items-center gap-3">
                    <TestButton id={c.id} />
                    <button type="button" className="text-subtle hover:text-fg" onClick={() => toggle.mutate(c)}>
                      {c.enabled ? "Pause" : "Resume"}
                    </button>
                    <button type="button" className="text-subtle hover:text-fg" onClick={() => setEditing(c)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-subtle hover:text-danger"
                      onClick={() => window.confirm(`Remove ${c.name}?`) && remove.mutate(c.id)}
                    >
                      Remove
                    </button>
                  </span>
                </div>
                {!c.enabled && <p className="text-xs text-warning">Paused: nothing is sent here</p>}
                {c.last_error && <p className="break-words text-xs text-danger">Last message failed: {c.last_error}</p>}
              </li>
            ))}
          </ul>
          {editing !== null && (
            <ChannelForm
              channel={editing === "new" ? null : editing}
              onDone={(next) => {
                if (next) set(next);
                setEditing(null);
              }}
            />
          )}
        </div>
        {data.data && <RulesForm rules={data.data.rules} available={data.data.available} onSaved={set} />}
      </div>
    </Section>
  );
}

function TestButton({ id }: { id: string }) {
  const test = useMutation({ mutationFn: () => api.testChannel(id) });
  return (
    <span className="flex items-center gap-2">
      {test.data && <span className={`text-xs ${test.data.ok ? "text-healthy" : "text-danger"}`}>{test.data.ok ? "Sent" : test.data.message}</span>}
      <button type="button" className="text-subtle hover:text-fg" disabled={test.isPending} onClick={() => test.mutate()}>
        {test.isPending ? "Sending" : "Send test"}
      </button>
    </span>
  );
}

function ChannelForm({ channel, onDone }: { channel: Channel | null; onDone: (next?: Awaited<ReturnType<typeof api.notifications>>) => void }) {
  const [type, setType] = useState<ChannelType>(channel?.type ?? "slack");
  const [name, setName] = useState(channel?.name ?? "");
  const [config, setConfig] = useState<Record<string, string>>(
    Object.fromEntries(Object.entries(channel?.config ?? {}).map(([k, v]) => [k, String(v ?? "")])),
  );
  const save = useMutation({
    mutationFn: () =>
      api.saveChannel({
        id: channel?.id,
        name: name || TYPES[type].label,
        type,
        enabled: channel?.enabled ?? true,
        config: Object.fromEntries(Object.entries(config).filter(([, v]) => v !== "")),
      }),
    onSuccess: (next) => onDone(next),
  });
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      {!channel && (
        <div role="radiogroup" aria-label="Channel type" className="flex flex-wrap gap-2">
          {(Object.keys(TYPES) as ChannelType[]).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={type === t}
              onClick={() => {
                setType(t);
                setConfig({});
              }}
              className={`h-8 rounded-lg border px-3 text-sm ${type === t ? "border-accent font-medium" : "border-control text-muted hover:text-fg"}`}
            >
              {TYPES[t].label}
            </button>
          ))}
        </div>
      )}
      <Field label="Name">
        <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={`${TYPES[type].label} on-call`} maxLength={60} />
      </Field>
      {TYPES[type].fields.map((f) => {
        const configured = channel?.secrets.includes(f.key);
        return (
          <Field key={f.key} label={f.label} hint={configured ? "Configured. Type a new value to replace it" : f.hint}>
            <input
              className={`${input} ${f.secret ? "font-mono text-[13px]" : ""}`}
              type={f.secret && f.key !== "url" ? "password" : "text"}
              value={config[f.key] ?? ""}
              placeholder={configured ? "Configured" : f.placeholder}
              autoComplete="off"
              onChange={(e) => setConfig({ ...config, [f.key]: e.target.value })}
            />
          </Field>
        );
      })}
      {type === "email" && (
        <Switch checked={config.starttls !== "false"} onChange={(v) => setConfig({ ...config, starttls: v ? "true" : "false" })} label="Use STARTTLS" />
      )}
      {save.error && <p className="text-sm text-danger">{(save.error as Error).message}</p>}
      <div className="flex gap-2">
        <button type="button" className={primaryButton} disabled={save.isPending} onClick={() => save.mutate()}>
          {save.isPending ? "Saving" : channel ? "Save" : "Add Channel"}
        </button>
        <button type="button" className={secondaryButton} onClick={() => onDone()}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function RulesForm({ rules, available, onSaved }: { rules: AlertRules; available: { id: string; label: string }[]; onSaved: (n: Awaited<ReturnType<typeof api.notifications>>) => void }) {
  const [draft, setDraft] = useState(rules);
  const [reasons, setReasons] = useState(rules.event_reasons.join(", "));
  const save = useMutation({
    mutationFn: () =>
      api.saveAlertRules({ ...draft, event_reasons: reasons.split(",").map((r) => r.trim()).filter(Boolean) }),
    onSuccess: onSaved,
  });
  const hour = (value: number | null, onChange: (v: number | null) => void, label: string) => (
    <select aria-label={label} value={value ?? ""} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} className="h-8 rounded-lg border border-control bg-bg px-2 text-sm">
      <option value="">Off</option>
      {Array.from({ length: 24 }, (_, h) => (
        <option key={h} value={h}>
          {String(h).padStart(2, "0")}:00 UTC
        </option>
      ))}
    </select>
  );
  return (
    <div className="flex flex-col gap-4 border-t border-border pt-6">
      <h2 className="text-sm font-medium">When to alert</h2>
      <ul className="flex flex-col gap-2.5">
        {available.map((r) => (
          <li key={r.id} className="flex flex-col gap-1.5">
            <label className="flex items-start gap-2.5 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-[var(--accent)]"
                checked={draft.enabled.includes(r.id)}
                onChange={(e) =>
                  setDraft({ ...draft, enabled: e.target.checked ? [...draft.enabled, r.id] : draft.enabled.filter((x) => x !== r.id) })
                }
              />
              {r.label}
            </label>
            {r.id === "workload.failing" && draft.enabled.includes(r.id) && (
              <label className="flex items-center gap-2 pl-7 text-sm text-muted">
                for longer than
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={draft.failing_minutes}
                  onChange={(e) => setDraft({ ...draft, failing_minutes: Number(e.target.value) || 1 })}
                  className="h-8 w-16 rounded-lg border border-control bg-bg px-2 text-right tabular-nums"
                />
                minutes
              </label>
            )}
            {r.id === "event.reason" && draft.enabled.includes(r.id) && (
              <input
                value={reasons}
                onChange={(e) => setReasons(e.target.value)}
                aria-label="Event reasons"
                placeholder="OOMKilling, FailedMount, Evicted"
                className="ml-7 h-8 max-w-96 rounded-lg border border-control bg-bg px-2.5 font-mono text-[13px]"
              />
            )}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
        <label className="flex items-center gap-2 text-muted">
          Remind every
          <input
            type="number"
            min={5}
            value={draft.cooldown_minutes}
            onChange={(e) => setDraft({ ...draft, cooldown_minutes: Number(e.target.value) || 60 })}
            className="h-8 w-20 rounded-lg border border-control bg-bg px-2 text-right tabular-nums"
          />
          minutes while it lasts
        </label>
        <span className="flex items-center gap-2 text-muted">
          Quiet from {hour(draft.quiet_start, (v) => setDraft({ ...draft, quiet_start: v }), "Quiet hours start")} to{" "}
          {hour(draft.quiet_end, (v) => setDraft({ ...draft, quiet_end: v }), "Quiet hours end")}
        </span>
      </div>
      <p className="text-[13px] text-subtle">
        Clusters send to every channel by default; choose per cluster in Clusters › Edit › Alerts. Set KubeiQ&apos;s
        address (KUBEIQ_APP_URL) so alerts link back to it
      </p>
      {save.error && <p className="text-sm text-danger">{(save.error as Error).message}</p>}
      <button type="button" className={`${primaryButton} self-start`} disabled={save.isPending} onClick={() => save.mutate()}>
        {save.isPending ? "Saving" : "Save"}
      </button>
    </div>
  );
}
