"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, type ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import { ActivityIcon, DocsIcon, OverviewIcon, PinIcon, SettingsIcon, SidebarIcon } from "@/components/icons";
import { KindIcon } from "@/components/manager/kind-icons";
import { useMe } from "@/hooks/use-me";
import { usePreference } from "@/hooks/use-preferences";
import { findResource, MAX_PINS } from "@/lib/navigation";
import { GITHUB_URL, INSIGHTS, PRODUCTS } from "@/lib/products";

export type Entry = { href: string; label: string; icon: ReactNode };

const PRODUCT_ENTRIES: Entry[] = [
  { href: "/", label: "Overview", icon: <OverviewIcon width={16} height={16} /> },
  ...PRODUCTS.map((p) => ({ href: p.href, label: p.name, icon: <p.icon width={16} height={16} /> })),
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/** Every entry that can be pinned, by href, so pins keep their label and icon. */
const INSIGHT_ENTRIES: Entry[] = INSIGHTS.map((p) => ({ href: p.href, label: p.name, icon: <p.icon width={16} height={16} /> }));

export function entryFor(href: string): Entry | null {
  const product = [...PRODUCT_ENTRIES, ...INSIGHT_ENTRIES].find((e) => e.href === href);
  if (product) return product;
  const kind = new URLSearchParams(href.split("?")[1] ?? "").get("kind");
  if (!kind) return null;
  // Kinds pinned from Cluster Manager, custom resources too: named after their resource.
  const found = findResource(kind);
  const resource = kind.split("/")[2] ?? kind;
  const label = found?.item.label ?? resource.charAt(0).toUpperCase() + resource.slice(1);
  return { href, label, icon: <KindIcon resource={resource} width={16} height={16} /> };
}

/**
 * The app's navigation: products, insights, then system pages. Resource kinds live in Cluster
 * Manager, not here. Collapses to an icon rail; up to five items can be pinned to the top. Both
 * are saved per user.
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
  const current = pathname === "/manager" ? findResource(kind) : null;


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
          {[...PRODUCT_ENTRIES, ...INSIGHT_ENTRIES].map((e) => (
            <RailLink key={e.href} entry={e} active={isActive(pathname, e.href)} />
          ))}
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
        <Group title="Insights">
          {INSIGHT_ENTRIES.map((e) => (
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

function NavRow({
  entry,
  active,
  pinned = false,
  onPin,
  onNavigate,
}: {
  entry: Entry;
  active: boolean;
  pinned?: boolean;
  onPin?: () => void;
  onNavigate?: () => void;
}) {
  return (
    <div className="group relative">
      <Link
        href={entry.href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        className={`flex h-9 items-center gap-2.5 rounded-lg pl-2.5 pr-8 text-sm transition-colors lg:h-8 ${active ? "bg-frame-hover font-semibold text-fg" : "font-medium text-muted hover:bg-frame-hover hover:text-fg"}`}
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
