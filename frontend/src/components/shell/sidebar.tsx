"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import {
  ActivityIcon,
  ChevronDownIcon,
  ChevronIcon,
  DocsIcon,
  OverviewIcon,
  PinIcon,
  SettingsIcon,
  SidebarIcon,
} from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { kindKey } from "@/components/manager/kinds";
import { useAllNamespaces, useMe } from "@/hooks/use-me";
import { usePreference } from "@/hooks/use-preferences";
import { api } from "@/lib/api";
import {
  findResource,
  MAX_PINS,
  RESOURCE_GROUPS,
  resourceHref,
  type ResourceGroup,
  type ResourceItem,
} from "@/lib/navigation";
import { GITHUB_URL, PRODUCTS } from "@/lib/products";
import { resolveCluster, useClusterScope } from "@/lib/scope";

export type Entry = { href: string; label: string; icon: ReactNode };

const PRODUCT_ENTRIES: Entry[] = [
  { href: "/", label: "Overview", icon: <OverviewIcon width={16} height={16} /> },
  ...PRODUCTS.map((p) => ({ href: p.href, label: p.name, icon: <p.icon width={16} height={16} /> })),
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Every entry that can be pinned, by href, so pins keep their label and icon. */
export function entryFor(href: string): Entry | null {
  const product = PRODUCT_ENTRIES.find((e) => e.href === href);
  if (product) return product;
  const kind = new URLSearchParams(href.split("?")[1] ?? "").get("kind");
  const found = findResource(kind);
  return found
    ? { href, label: found.item.label, icon: <KindIcon resource={found.item.resource} width={16} height={16} /> }
    : null;
}

/** Kinds this cluster serves, keyed by group/resource, so links use the cluster's own version. */
function useServedKinds() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const cluster = resolveCluster(clusters.data, useClusterScope());
  const kinds = useQuery({
    queryKey: ["manager", "kinds", cluster],
    queryFn: () => api.kinds(cluster!),
    enabled: Boolean(cluster),
    staleTime: 5 * 60_000,
  });
  const served = new Map<string, string>();
  for (const k of kinds.data?.flatMap((c) => c.kinds) ?? []) served.set(`${k.group || "core"}/${k.resource}`, kindKey(k));
  return { served: kinds.data ? served : null, cluster };
}

const short = (kind: string) => {
  const [g, , r] = kind.split("/");
  return `${g}/${r}`;
};

/**
 * The app's navigation. Products, then the resource groups (one open at a time, the one holding
 * the current page opens by itself), then system pages. Collapses to an icon rail; up to five
 * items can be pinned to the top. Both are saved per user.
 */
export function Sidebar({
  pathname,
  kind,
  collapsed = false,
  hideBrand = false,
  onToggle,
  onNavigate,
}: {
  pathname: string;
  /** The Cluster Manager kind on screen, from the URL. */
  kind: string | null;
  collapsed?: boolean;
  hideBrand?: boolean;
  onToggle?: () => void;
  onNavigate?: () => void;
}) {
  const me = useMe();
  const admin = me.data?.role === "admin";
  const [pins, setPins] = usePreference<string[]>("pinned", []);
  const [notice, setNotice] = useState<string | null>(null);
  const { served, cluster } = useServedKinds();
  const allNamespaces = useAllNamespaces(cluster);
  const current = pathname === "/manager" ? findResource(kind) : null;

  const [openGroup, setOpenGroup] = useState<string | null>(current?.group.name ?? null);
  const [lastGroup, setLastGroup] = useState(current?.group.name ?? null);
  if ((current?.group.name ?? null) !== lastGroup) {
    setLastGroup(current?.group.name ?? null);
    if (current) setOpenGroup(current.group.name);
  }

  const visible = (items: ResourceItem[]) =>
    items.filter(
      (i) => (allNamespaces || i.namespaced) && (!served || served.has(short(i.kind))),
    );
  const hrefOf = (i: ResourceItem) => resourceHref(served?.get(short(i.kind)) ?? i.kind);
  const itemActive = (i: ResourceItem) => current?.item.kind === i.kind;

  const togglePin = (href: string) => {
    if (pins.includes(href)) setPins(pins.filter((p) => p !== href));
    else if (pins.length >= MAX_PINS) {
      setNotice(`Pin up to ${MAX_PINS} items. Unpin one first`);
      setTimeout(() => setNotice(null), 3000);
    } else setPins([...pins, href]);
  };
  const pinned = pins.map(entryFor).filter((e): e is Entry => e !== null);
  const pinActive = (href: string) => {
    const k = new URLSearchParams(href.split("?")[1] ?? "").get("kind");
    return k ? pathname === "/manager" && current?.item.kind === findResource(k)?.item.kind : isActive(pathname, href);
  };

  if (collapsed)
    return (
      <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col items-center px-2 pb-3">
        <div className="flex h-12 shrink-0 items-center">
          <Link href="/" aria-label="KubeiQ Overview">
            <Image src="/logo.png" alt="" width={26} height={26} priority />
          </Link>
        </div>
        <div className="flex min-h-0 w-full flex-1 flex-col items-center gap-0.5 overflow-y-auto pt-2">
          {pinned.map((e) => (
            <RailLink key={`pin-${e.href}`} entry={e} active={pinActive(e.href)} />
          ))}
          {pinned.length > 0 && <hr className="my-1.5 w-6 border-border" />}
          {PRODUCT_ENTRIES.map((e) => (
            <RailLink key={e.href} entry={e} active={isActive(pathname, e.href)} />
          ))}
          <hr className="my-1.5 w-6 border-border" />
          {RESOURCE_GROUPS.map((g) => {
            const items = visible(g.items);
            if (!items.length) return null;
            return (
              <RailLink
                key={g.name}
                entry={{ href: hrefOf(items[0]), label: g.name, icon: <KindIcon resource={g.icon} width={16} height={16} /> }}
                active={current?.group.name === g.name}
              />
            );
          })}
        </div>
        <div className="flex flex-col items-center gap-0.5 pt-3">
          <RailLink
            entry={{ href: "/settings", label: "Settings", icon: <SettingsIcon width={16} height={16} /> }}
            active={isActive(pathname, "/settings")}
          />
          <button
            type="button"
            onClick={onToggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-frame-hover hover:text-fg"
          >
            <SidebarIcon />
          </button>
          <div className="mt-2 border-t border-border pt-2">
            <UserMenu compact />
          </div>
        </div>
      </nav>
    );

  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col pb-3">
      {!hideBrand && (
        <div className="flex h-12 shrink-0 items-center justify-between px-5">
          <Link href="/" className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight">
            <Image src="/logo.png" alt="" width={26} height={26} priority />
            KubeiQ
          </Link>
          {onToggle && (
            <button
              type="button"
              onClick={onToggle}
              aria-label="Collapse sidebar"
              title="Collapse sidebar"
              className="flex h-8 w-8 items-center justify-center rounded-lg text-subtle transition-colors hover:bg-frame-hover hover:text-fg"
            >
              <SidebarIcon />
            </button>
          )}
        </div>
      )}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-3 pt-2">
        {pinned.length > 0 && (
          <Group title="Pinned">
            {pinned.map((e) => (
              <NavRow
                key={e.href}
                entry={e}
                active={pinActive(e.href)}
                pinned
                onPin={() => togglePin(e.href)}
                onNavigate={onNavigate}
              />
            ))}
          </Group>
        )}
        <Group title="Products">
          {PRODUCT_ENTRIES.map((e) => (
            <NavRow
              key={e.href}
              entry={e}
              active={isActive(pathname, e.href)}
              pinned={pins.includes(e.href)}
              onPin={() => togglePin(e.href)}
              onNavigate={onNavigate}
            />
          ))}
        </Group>
        <Group title="Resources">
          {RESOURCE_GROUPS.map((g) => {
            const items = visible(g.items);
            if (!items.length) return null;
            return (
              <ResourceSection
                key={g.name}
                group={g}
                open={openGroup === g.name}
                holdsCurrent={current?.group.name === g.name}
                onToggle={() => setOpenGroup(openGroup === g.name ? null : g.name)}
              >
                {items.map((i) => {
                  const href = hrefOf(i);
                  const pinKey = resourceHref(i.kind);
                  return (
                    <NavRow
                      key={i.kind}
                      entry={{ href, label: i.label, icon: <KindIcon resource={i.resource} width={15} height={15} /> }}
                      active={pathname === "/manager" && itemActive(i)}
                      pinned={pins.includes(pinKey)}
                      onPin={() => togglePin(pinKey)}
                      onNavigate={onNavigate}
                      nested
                    />
                  );
                })}
              </ResourceSection>
            );
          })}
        </Group>
      </div>
      {notice && (
        <p role="status" className="mx-3 mt-2 rounded-lg bg-bg px-3 py-2 text-xs text-muted shadow-sm">
          {notice}
        </p>
      )}
      <div className="flex flex-col gap-0.5 px-3 pt-4">
        <NavRow
          entry={{ href: "/settings", label: "Settings", icon: <SettingsIcon width={16} height={16} /> }}
          active={isActive(pathname, "/settings")}
          onNavigate={onNavigate}
        />
        {admin && (
          <NavRow
            entry={{ href: "/settings#activity", label: "Activity", icon: <ActivityIcon width={16} height={16} /> }}
            active={false}
            onNavigate={onNavigate}
          />
        )}
        <a
          href={`${GITHUB_URL}#readme`}
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted transition-colors hover:bg-frame-hover hover:text-fg lg:h-8"
        >
          <span className="text-subtle">
            <DocsIcon />
          </span>
          Docs
        </a>
        <div className="mt-3 border-t border-border pt-3">
          <UserMenu onNavigate={onNavigate} />
        </div>
      </div>
    </nav>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <p className="px-2.5 pb-1 text-xs font-medium text-subtle">{title}</p>
      {children}
    </div>
  );
}

function ResourceSection({
  group,
  open,
  holdsCurrent,
  onToggle,
  children,
}: {
  group: ResourceGroup;
  open: boolean;
  holdsCurrent: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-left text-sm font-medium text-muted transition-colors hover:bg-frame-hover hover:text-fg lg:h-8"
      >
        <span className="text-subtle">
          <KindIcon resource={group.icon} width={16} height={16} />
        </span>
        <span className="flex-1">{group.name}</span>
        {holdsCurrent && !open && (
          <span aria-label="Current page is here" className="h-1.5 w-1.5 rounded-full bg-accent" />
        )}
        {open ? (
          <ChevronDownIcon width={14} height={14} className="text-subtle" />
        ) : (
          <ChevronIcon width={14} height={14} className="text-subtle" />
        )}
      </button>
      {open && <div className="flex flex-col gap-0.5 pb-1">{children}</div>}
    </div>
  );
}

function NavRow({
  entry,
  active,
  pinned = false,
  onPin,
  onNavigate,
  nested = false,
}: {
  entry: Entry;
  active: boolean;
  pinned?: boolean;
  onPin?: () => void;
  onNavigate?: () => void;
  nested?: boolean;
}) {
  return (
    <div className="group relative">
      <Link
        href={entry.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-lg pr-8 text-sm transition-colors lg:h-8 ${
          nested ? "pl-8" : "pl-2.5"
        } ${active ? "bg-frame-hover font-semibold text-fg" : "font-medium text-muted hover:bg-frame-hover hover:text-fg"}`}
      >
        <span className={active ? "text-accent" : "text-subtle"}>{entry.icon}</span>
        <span className="truncate">{entry.label}</span>
      </Link>
      {onPin && (
        <button
          type="button"
          onClick={onPin}
          aria-label={pinned ? `Unpin ${entry.label}` : `Pin ${entry.label}`}
          title={pinned ? "Unpin" : "Pin to the top"}
          className={`absolute right-1.5 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md transition-opacity hover:bg-bg focus-visible:opacity-100 ${
            pinned ? "text-accent opacity-0 group-hover:opacity-100" : "text-subtle opacity-0 group-hover:opacity-100"
          }`}
        >
          <PinIcon width={13} height={13} />
        </button>
      )}
    </div>
  );
}

function RailLink({ entry, active }: { entry: Entry; active: boolean }) {
  return (
    <Link
      href={entry.href}
      aria-label={entry.label}
      title={entry.label}
      aria-current={active ? "page" : undefined}
      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg transition-colors ${
        active ? "bg-frame-hover text-accent" : "text-subtle hover:bg-frame-hover hover:text-fg"
      }`}
    >
      {entry.icon}
    </Link>
  );
}
