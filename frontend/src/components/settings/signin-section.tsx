"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { GoogleMark } from "@/components/auth/google-mark";
import { Field, input, primaryButton, Section, Switch } from "@/components/settings/fields";
import { CodeBlock } from "@/components/ui";
import { api, type GoogleSettings } from "@/lib/api";

/** Sign in with Google: the OAuth client and the domains whose people may join (ADR 0013). */
export function SignInSection() {
  const saved = useQuery({ queryKey: ["settings", "google"], queryFn: api.googleSettings });
  return (
    <Section
      id="signin"
      title="Sign-In"
      description="How people sign in. Passwords and the master key always work. Add Google so your team signs in with their Google accounts"
    >
      {saved.error && <p className="text-sm text-danger">{saved.error.message}</p>}
      {saved.data && <GoogleForm data={saved.data} />}
    </Section>
  );
}

function GoogleForm({ data }: { data: GoogleSettings }) {
  const queryClient = useQueryClient();
  const [enabled, setEnabled] = useState(data.enabled);
  const [clientId, setClientId] = useState(data.client_id);
  const [secret, setSecret] = useState("");
  const [domains, setDomains] = useState(data.allowed_domains.join(", "));

  const save = useMutation({
    mutationFn: () =>
      api.saveGoogleSettings({
        enabled,
        client_id: clientId.trim(),
        client_secret: secret.trim() ? secret.trim() : null,
        allowed_domains: domains.split(/[\s,]+/).filter(Boolean),
      }),
    onSuccess: (data) => {
      queryClient.setQueryData(["settings", "google"], data);
      queryClient.invalidateQueries({ queryKey: ["auth", "providers"] });
      setSecret("");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    save.mutate();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-5">
        <div className="flex items-center gap-3">
          <GoogleMark size={20} />
          <span className="flex-1 text-sm font-medium">Sign in with Google</span>
          <Switch checked={enabled} onChange={setEnabled} label="On" />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Redirect URI</span>
          <p className="text-[13px] text-muted">
            In Google Cloud, under APIs &amp; Services › Credentials, create an OAuth client of type
            Web application and add this as an authorized redirect URI. Google needs a domain, or
            localhost; an IP address is refused
          </p>
          <CodeBlock text={data.redirect_uri} />
        </div>

        <Field label="Client ID">
          <input
            className={input}
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="1234567890-abc.apps.googleusercontent.com"
            spellCheck={false}
          />
        </Field>
        <Field
          label="Client Secret"
          hint={data.client_secret_set ? `Saved, ends in ${data.client_secret_hint}. Type a new one to replace it` : "Encrypted when saved, and never shown again"}
        >
          <input
            className={input}
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder={data.client_secret_set ? "••••••••" : "GOCSPX-..."}
            autoComplete="off"
          />
        </Field>
        <Field
          label="Allowed Domains"
          hint="Anyone with a verified email on these domains gets an account on first sign-in, as a user with no project. Leave empty to let in only people you add under Users, by their email"
        >
          <input
            className={input}
            value={domains}
            onChange={(e) => setDomains(e.target.value)}
            placeholder="acme.com, acme.io"
            spellCheck={false}
          />
        </Field>

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" className={`${primaryButton} self-start`} disabled={save.isPending}>
            {save.isPending ? "Saving" : "Save"}
          </button>
          {save.isSuccess && !save.isPending && <span className="text-sm text-muted">Saved</span>}
          {save.error && <span className="text-sm text-danger">{(save.error as Error).message}</span>}
        </div>
    </form>
  );
}
