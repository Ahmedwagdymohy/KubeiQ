"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api";

/** Shown on Home until an AI model is configured, so users know what they are missing. */
export function AINotice() {
  const ai = useQuery({ queryKey: ["settings", "ai"], queryFn: api.aiSettings });
  if (!ai.data || ai.data.active_model) return null;
  return (
    <p className="rounded-lg border border-border bg-panel px-5 py-3 text-sm text-muted">
      AI investigations are off.{" "}
      <Link href="/settings#ai" className="font-semibold text-fg underline underline-offset-4">
        Add a model in Settings
      </Link>{" "}
      to get root causes for the problems rules cannot explain
    </p>
  );
}
