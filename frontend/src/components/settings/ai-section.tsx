"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import {
  Field,
  input,
  primaryButton,
  secondaryButton,
  Section,
  Switch,
} from "@/components/settings/fields";
import { Dot } from "@/components/ui";
import { api, type AISettings, type AISettingsInput, type Provider, type TestResult } from "@/lib/api";

const SOURCE_LABEL: Record<AISettings["active_source"], string> = {
  settings: "from these settings",
  environment: "from the server environment (KUBEIQ_LLM_MODEL)",
  none: "",
};

export function AISection() {
  const settings = useQuery({ queryKey: ["settings", "ai"], queryFn: api.aiSettings });
  const providers = useQuery({ queryKey: ["settings", "providers"], queryFn: api.providers });

  return (
    <Section
      id="ai"
      title="AI Model"
      description="KubeiQ finds known problems without AI. With a model it also investigates the unclear ones and writes the fix. Your key is encrypted and never shown again"
      aside={settings.data && <InUse saved={settings.data} />}
    >
      {settings.error && <p className="text-sm text-danger">{(settings.error as Error).message}</p>}
      {settings.data && providers.data && (
        // Remount with fresh values after every save.
        <AIForm key={settings.dataUpdatedAt} saved={settings.data} providers={providers.data} />
      )}
    </Section>
  );
}

function InUse({ saved }: { saved: AISettings }) {
  return (
    <div className="flex items-start gap-2 rounded-lg border border-border px-3 py-2.5">
      <span className="pt-1.5">
        <Dot tone={saved.active_model ? "healthy" : "info"} />
      </span>
      {saved.active_model ? (
        <span className="min-w-0">
          <span className="text-fg">In use: </span>
          <code className="break-all font-mono text-[13px] text-fg">{saved.active_model}</code>{" "}
          <span className="text-subtle">{SOURCE_LABEL[saved.active_source]}</span>
        </span>
      ) : (
        <span>AI is off. Investigations use rules only</span>
      )}
    </div>
  );
}

function AIForm({ saved, providers }: { saved: AISettings; providers: Provider[] }) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    enabled: saved.enabled,
    provider: saved.provider,
    model: saved.model,
    api_base: saved.api_base ?? "",
    api_version: saved.api_version ?? "",
    max_incidents: saved.max_incidents,
    max_steps: saved.max_steps,
  });
  // undefined: keep the saved key; "": remove it; text: replace it.
  const [key, setKey] = useState<string | undefined>(undefined);
  const [test, setTest] = useState<TestResult | null>(null);
  const provider = providers.find((p) => p.id === form.provider) ?? providers[0];

  const body = (): AISettingsInput => ({
    ...form,
    api_base: form.api_base.trim() || null,
    api_version: form.api_version.trim() || null,
    api_key: key,
  });
  const save = useMutation({
    mutationFn: () => api.saveAISettings(body()),
    onSuccess: (data) => queryClient.setQueryData(["settings", "ai"], data),
  });
  const runTest = useMutation({
    mutationFn: () => api.testAISettings(body()),
    onMutate: () => setTest(null),
    onSuccess: setTest,
    onError: (e) => setTest({ ok: false, model: null, message: (e as Error).message, latency_ms: null }),
  });
  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setTest(null);
  };

  return (
    <div className="flex flex-col gap-6">
      <Switch
        checked={form.enabled}
        onChange={(v) => set("enabled", v)}
        label="Use AI to investigate problems the rules cannot explain"
      />

      <div className={`flex flex-col gap-6 ${form.enabled ? "" : "pointer-events-none opacity-50"}`}>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-muted">Provider</span>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {providers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => set("provider", p.id)}
                aria-pressed={p.id === form.provider}
                className={`rounded-lg border bg-bg px-3 py-2.5 text-left text-sm transition-colors ${
                  p.id === form.provider
                    ? "border-accent font-medium text-fg shadow-[inset_0_0_0_1px_var(--accent)]"
                    : "border-border text-muted hover:border-control hover:text-fg"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {provider.help && <p className="text-xs text-subtle">{provider.help}</p>}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Model" hint={`Example: ${provider.model_placeholder}`}>
            <input
              className={input}
              value={form.model}
              onChange={(e) => set("model", e.target.value)}
              placeholder={provider.model_placeholder}
              spellCheck={false}
            />
          </Field>
          {(provider.needs_base || form.api_base) && (
            <Field label={provider.needs_base ? "Endpoint" : "Endpoint (optional)"}>
              <input
                className={input}
                value={form.api_base}
                onChange={(e) => set("api_base", e.target.value)}
                placeholder={provider.base_placeholder ?? "https://"}
                spellCheck={false}
              />
            </Field>
          )}
          {provider.needs_api_version && (
            <Field label="API version" hint="Example: 2024-10-21">
              <input
                className={input}
                value={form.api_version}
                onChange={(e) => set("api_version", e.target.value)}
                placeholder="2024-10-21"
              />
            </Field>
          )}
          {(provider.needs_key || saved.api_key_set) && (
            <Field label="API key">
              {saved.api_key_set && key === undefined ? (
                <div className="flex items-center gap-3">
                  <span className="flex h-10 flex-1 items-center rounded-lg border border-border bg-bg px-3 font-mono text-sm text-muted">
                    •••• {saved.api_key_hint}
                  </span>
                  <button type="button" className={secondaryButton} onClick={() => setKey("")}>
                    Replace
                  </button>
                </div>
              ) : (
                <input
                  className={input}
                  type="password"
                  autoComplete="off"
                  value={key ?? ""}
                  onChange={(e) => setKey(e.target.value)}
                  placeholder={saved.api_key_set ? "Leave empty to remove the saved key" : "Paste your key"}
                />
              )}
            </Field>
          )}
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="AI investigations per scan" hint="Limits cost: the rest use rules only">
            <input
              className={input}
              type="number"
              min={0}
              max={20}
              value={form.max_incidents}
              onChange={(e) => set("max_incidents", Number(e.target.value))}
            />
          </Field>
          <Field label="Steps per investigation" hint="How many lookups the AI may do per issue">
            <input
              className={input}
              type="number"
              min={1}
              max={20}
              value={form.max_steps}
              onChange={(e) => set("max_steps", Number(e.target.value))}
            />
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-border pt-5">
        <button
          type="button"
          className={primaryButton}
          disabled={save.isPending}
          onClick={() => save.mutate()}
        >
          {save.isPending ? "Saving" : "Save"}
        </button>
        <button
          type="button"
          className={secondaryButton}
          disabled={runTest.isPending || !form.enabled || !form.model.trim()}
          onClick={() => runTest.mutate()}
        >
          {runTest.isPending ? "Testing" : "Test connection"}
        </button>
        {save.isSuccess && !save.isPending && <span className="text-sm text-accent">Saved</span>}
        {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
        {test && (
          <span className={`text-sm ${test.ok ? "text-accent" : "text-danger"}`}>
            {test.ok ? `Connected to ${test.model} in ${test.latency_ms} ms` : test.message}
          </span>
        )}
      </div>
    </div>
  );
}
