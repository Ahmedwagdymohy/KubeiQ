"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { describe } from "@/components/settings/activity-section";
import { useMe } from "@/hooks/use-me";
import { api } from "@/lib/api";
import { PRODUCTS } from "@/lib/products";

const panel = "rounded-lg border border-border bg-panel";

function clock(iso: string) {
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  return today ? t : `${d.toLocaleDateString([], { day: "numeric", month: "short" })} ${t}`;
}

/**
 * The log: the latest entries from Activity, written like a ship's log (time, who, what). Only
 * admins can read Activity; everyone else gets the products in its place.
 */
export function ShipsLog() {
  const me = useMe();
  const admin = me.data?.role === "admin";
  const audit = useQuery({ queryKey: ["audit", 8], queryFn: () => api.audit(8), enabled: admin });

  if (!admin) {
    return (
      <section className={`${panel} flex flex-col`}>
        <h2 className="px-5 pb-3 pt-5 text-base font-semibold">Products</h2>
        <ul className="flex flex-col">
          {PRODUCTS.map(({ href, name, description }) => (
            <li key={href} className="border-t border-border">
              <Link href={href} className="flex flex-col gap-0.5 px-5 py-3 transition-colors hover:bg-surface">
                <span className="font-medium">{name}</span>
                <span className="text-sm text-muted">{description}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <section className={`${panel} flex flex-col`}>
      <div className="flex items-baseline justify-between gap-3 px-5 pb-3 pt-5">
        <h2 className="text-base font-semibold">Log</h2>
        <Link href="/settings#activity" className="text-sm text-muted transition-colors hover:text-fg">
          All activity
        </Link>
      </div>
      {audit.isError && <p className="border-t border-border px-5 py-4 text-sm text-muted">Could not load activity</p>}
      <ol className="flex flex-col">
        {audit.data?.map((event) => (
          <li key={event.id} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 border-t border-border px-5 py-2.5 text-sm">
            <span className="tabular-nums text-muted">{clock(event.created_at)}</span>
            <span className="min-w-0 truncate">
              <span className="font-medium">{event.username}</span>{" "}
              <span className={event.ok ? "text-muted" : "text-danger"}>{describe(event).toLowerCase()}</span>
            </span>
          </li>
        ))}
        {audit.data?.length === 0 && <li className="border-t border-border px-5 py-4 text-sm text-muted">Nothing logged yet</li>}
      </ol>
    </section>
  );
}
