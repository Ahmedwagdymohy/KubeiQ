"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ComponentType, type ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import {
  ChevronDownIcon,
  CloseIcon,
  DocsIcon,
  MenuIcon,
  OverviewIcon,
  SettingsIcon,
} from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHash } from "@/hooks/use-hash";
import { useMe } from "@/hooks/use-me";
import { api, type Cluster } from "@/lib/api";
import { GITHUB_URL, PRODUCTS } from "@/lib/products";
import { resolveCluster, setClusterScope, useClusterScope } from "@/lib/scope";
import { SETTINGS_AREAS } from "@/lib/settings-nav";

type NavItem = { href: string; name: string; icon: ComponentType<{ width?: number; height?: number }> };

const MAIN_NAV: NavItem[] = [{ href: "/", name: "Overview", icon: OverviewIcon }, ...PRODUCTS];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

/**
 * The app frame: a tinted sidebar and 48px top bar around a white sheet that holds the page.
 * On a phone the frame folds into the top bar, and the menu opens the navigation as a sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  // Close the phone menu whenever the page changes (adjusting state during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  return (
    <div className="flex h-dvh flex-col bg-frame lg:grid lg:grid-cols-[228px_minmax(0,1fr)] lg:grid-rows-[48px_minmax(0,1fr)]">
      <aside className="hidden lg:row-span-2 lg:flex lg:min-h-0 lg:flex-col">
        <Sidebar pathname={pathname} />
      </aside>

      <TopBar pathname={pathname} onMenu={() => setMenuOpen(true)} />

      <main
        id="sheet"
        className="flex min-h-0 flex-1 flex-col overflow-auto bg-bg lg:mb-2 lg:mr-2 lg:rounded-2xl lg:border lg:border-border"
      >
        {children}
      </main>

      {menuOpen && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation"
          className="fixed inset-0 z-50 flex flex-col bg-frame lg:hidden"
        >
          <div className="flex h-12 shrink-0 items-center justify-between px-4">
            <Brand />
            <button
              type="button"
              aria-label="Close menu"
              onClick={() => setMenuOpen(false)}
              className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-frame-hover hover:text-fg"
            >
              <CloseIcon width={18} height={18} />
            </button>
          </div>
          <div className="px-4 pb-3">
            <ClusterScope wide />
          </div>
          <Sidebar pathname={pathname} hideBrand onNavigate={() => setMenuOpen(false)} />
        </div>
      )}
    </div>
  );
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={26} height={26} priority />
      KubeiQ
    </Link>
  );
}

function Sidebar({
  pathname,
  hideBrand = false,
  onNavigate,
}: {
  pathname: string;
  hideBrand?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main" className="flex min-h-0 flex-1 flex-col px-3 pb-3">
      {!hideBrand && (
        <div className="flex h-12 shrink-0 items-center px-2">
          <Brand />
        </div>
      )}
      <ul className="mt-2 flex flex-col gap-0.5">
        {MAIN_NAV.map((item) => (
          <li key={item.href}>
            <NavLink item={item} active={isActive(pathname, item.href)} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="mt-auto flex flex-col gap-0.5 pt-6">
        <NavLink
          item={{ href: "/settings", name: "Settings", icon: SettingsIcon }}
          active={isActive(pathname, "/settings")}
          onNavigate={onNavigate}
        />
        <a
          href={`${GITHUB_URL}#readme`}
          className="flex h-9 items-center gap-2.5 rounded-lg px-2.5 text-sm font-medium text-muted transition-colors hover:bg-frame-hover hover:text-fg lg:h-8"
        >
          <DocsIcon />
          Docs
        </a>
        <div className="mt-3 border-t border-border pt-3">
          <UserMenu onNavigate={onNavigate} />
        </div>
      </div>
    </nav>
  );
}

function NavLink({
  item,
  active,
  onNavigate,
}: {
  item: NavItem;
  active: boolean;
  onNavigate?: () => void;
}) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 items-center gap-2.5 rounded-lg px-2.5 text-sm transition-colors lg:h-8 ${
        active
          ? "bg-frame-hover font-semibold text-fg"
          : "font-medium text-muted hover:bg-frame-hover hover:text-fg"
      }`}
    >
      <span className={active ? "text-fg" : "text-subtle"}>
        <Icon width={16} height={16} />
      </span>
      {item.name}
    </Link>
  );
}

function pageTitle(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/settings")) return "Settings";
  return PRODUCTS.find((p) => isActive(pathname, p.href))?.name ?? "KubeiQ";
}

function TopBar({ pathname, onMenu }: { pathname: string; onMenu: () => void }) {
  const hash = useHash();
  const me = useMe();
  const title = pageTitle(pathname);
  const area = pathname.startsWith("/settings")
    ? SETTINGS_AREAS.find((a) => `#${a.id}` === hash)?.label ??
      (me.data?.role === "admin" ? "AI Model" : "Account")
    : null;

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 px-2 lg:pl-1 lg:pr-4">
      <button
        type="button"
        aria-label="Open menu"
        onClick={onMenu}
        className="flex h-11 w-11 items-center justify-center rounded-lg text-muted transition-colors hover:bg-frame-hover hover:text-fg lg:hidden"
      >
        <MenuIcon width={18} height={18} />
      </button>
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        {/* Product pages are full-height tools: the top bar carries their title. */}
        {pathname !== "/" && !area ? (
          <h1 className="truncate text-[15px] font-semibold text-fg">{title}</h1>
        ) : (
          <span className={area ? "hidden text-muted sm:inline" : "font-medium text-fg"}>{title}</span>
        )}
        {area && (
          <>
            <span className="hidden text-subtle sm:inline">/</span>
            <span className="truncate font-medium text-fg">{area}</span>
          </>
        )}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <div className="hidden sm:block">
          <ClusterScope />
        </div>
        <ThemeToggle />
      </div>
    </header>
  );
}

type Tone = "ok" | "checking" | "no-access" | "offline";

function clusterTone(c: Cluster): Tone {
  if (!c.status) return "checking";
  if (!c.status.reachable && !c.login) return "offline";
  return c.status.can_read === false || c.login ? "no-access" : "ok";
}

const rank = (tone: Tone) => ["ok", "checking", "no-access", "offline"].indexOf(tone);
const DOT: Record<Tone, string> = {
  ok: "bg-healthy",
  checking: "bg-subtle",
  "no-access": "bg-warning",
  offline: "bg-danger",
};
const LABEL: Record<Tone, string> = {
  ok: "",
  checking: "",
  "no-access": " (no access, fix in Settings)",
  offline: " (offline)",
};

/** The cluster every product opens on. Picking one switches the page you are on. */
function ClusterScope({ wide = false }: { wide?: boolean }) {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const scoped = useClusterScope();
  const current = resolveCluster(clusters.data, scoped);
  const cluster = clusters.data?.find((c) => c.id === current);
  if (!clusters.data?.length || !cluster) return null;
  const tone = clusterTone(cluster);
  // Working clusters first; the ones KubeiQ cannot use go last, with why.
  const ordered = [...clusters.data].sort((a, b) => rank(clusterTone(a)) - rank(clusterTone(b)));

  return (
    <label
      className={`relative flex h-8 items-center gap-2 rounded-lg border border-control bg-bg pl-2.5 pr-7 text-sm transition-colors focus-within:border-accent hover:border-subtle ${
        wide ? "h-11 w-full" : "max-w-[280px]"
      }`}
    >
      <span className="sr-only">Cluster</span>
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 shrink-0 rounded-full ${DOT[tone]}`}
      />
      <span className="truncate font-mono text-[13px] text-fg">{cluster.name}</span>
      {cluster.status?.version && (
        <span className="hidden shrink-0 text-xs text-subtle md:inline">{cluster.status.version}</span>
      )}
      <ChevronDownIcon
        width={14}
        height={14}
        className="pointer-events-none absolute right-2 text-subtle"
      />
      <select
        value={current ?? ""}
        onChange={(e) => setClusterScope(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {ordered.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
            {LABEL[clusterTone(c)]}
          </option>
        ))}
      </select>
    </label>
  );
}
