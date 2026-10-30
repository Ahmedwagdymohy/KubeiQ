"use client";

import { useQuery } from "@tanstack/react-query";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";

import { CloseIcon, MenuIcon, SearchIcon } from "@/components/icons";
import { DEFAULT_KIND } from "@/components/manager/kinds";
import { AssistantPanel } from "@/components/assistant/assistant-panel";
import { CommandPalette, openPalette } from "@/components/shell/command-palette";
import { Sidebar } from "@/components/shell/sidebar";
import { ClusterSwitcher, StatusBar, useScopedClusters } from "@/components/shell/status-bar";
import { ThemeToggle } from "@/components/theme-toggle";
import { useHash } from "@/hooks/use-hash";
import { useMe } from "@/hooks/use-me";
import { usePreference, usePreferences } from "@/hooks/use-preferences";
import { api } from "@/lib/api";
import { findResource } from "@/lib/navigation";
import { INSIGHTS, PRODUCTS } from "@/lib/products";
import { restoreClusterScope, setClusterScope, useClusterScope, resolveCluster } from "@/lib/scope";
import { areaFromHash, SETTINGS_AREAS } from "@/lib/settings-nav";

type Location = { kind: string | null; name: string | null; namespace: string | null };
const NOWHERE: Location = { kind: null, name: null, namespace: null };

/** Reads the URL query (which needs a Suspense boundary) and hands the parts the shell uses up. */
function LocationWatcher({ onChange }: { onChange: (l: Location) => void }) {
  const params = useSearchParams();
  const kind = params.get("kind");
  const name = params.get("name");
  const namespace = params.get("in");
  useEffect(() => onChange({ kind, name, namespace }), [kind, name, namespace, onChange]);
  return null;
}

/**
 * The app frame: a tinted sidebar and 48px top bar around a white sheet that holds the page, with
 * the cluster status bar at the top of the sheet. On a phone the frame folds into the top bar, and
 * the menu opens the navigation as a sheet.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [location, setLocation] = useState<Location>(NOWHERE);
  const [sidebar, setSidebar] = usePreference<{ collapsed: boolean }>("sidebar", { collapsed: false });
  const toggleSidebar = useCallback(() => setSidebar({ collapsed: !sidebar.collapsed }), [sidebar, setSidebar]);
  const kind = pathname === "/manager" ? (location.kind ?? DEFAULT_KIND) : null;
  // Close the phone menu whenever the page changes (adjusting state during render).
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setMenuOpen(false);
  }

  const prefs = usePreferences();
  useEffect(() => {
    if (!prefs.data) return;
    restoreClusterScope(prefs.data.cluster);
    const mono = (prefs.data.appearance as { mono?: string } | undefined)?.mono;
    if (mono === "system") document.documentElement.dataset.mono = "system";
    else delete document.documentElement.dataset.mono;
  }, [prefs.data]);

  useEffect(() => {
    if (!menuOpen) return;
    const escape = (event: KeyboardEvent) => event.key === "Escape" && setMenuOpen(false);
    document.addEventListener("keydown", escape);
    return () => document.removeEventListener("keydown", escape);
  }, [menuOpen]);

  const toast = useClusterShortcuts();

  return (
    <div
      className={`flex h-dvh flex-col bg-frame lg:grid lg:grid-rows-[48px_minmax(0,1fr)] ${
        sidebar.collapsed ? "lg:grid-cols-[60px_minmax(0,1fr)]" : "lg:grid-cols-[228px_minmax(0,1fr)]"
      }`}
    >
      <Suspense>
        <LocationWatcher onChange={setLocation} />
      </Suspense>
      <aside className="hidden lg:row-span-2 lg:flex lg:min-h-0 lg:flex-col">
        <Sidebar pathname={pathname} kind={kind} collapsed={sidebar.collapsed} onToggle={toggleSidebar} />
      </aside>

      <TopBar pathname={pathname} location={location} kind={kind} onMenu={() => setMenuOpen(true)} />

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden bg-bg lg:mb-2 lg:mr-2 lg:rounded-2xl lg:border lg:border-border">
        {!pathname.startsWith("/settings") && <StatusBar />}
        <div id="sheet" className="flex min-h-0 flex-1 flex-col overflow-auto">
          {children}
        </div>
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
          <PhoneClusterPicker />
          <Sidebar pathname={pathname} kind={kind} hideBrand onNavigate={() => setMenuOpen(false)} />
        </div>
      )}

      <CommandPalette onToggleSidebar={toggleSidebar} />
      {toast && (
        <div
          role="status"
          className="fixed bottom-6 left-1/2 z-[70] -translate-x-1/2 rounded-lg bg-fg px-4 py-2 text-sm font-medium text-bg shadow-lg"
        >
          {toast}
        </div>
      )}
    </div>
  );
}

/** Ctrl+1 to Ctrl+9 switch to the clusters in the switcher's order, with a short confirmation. */
function useClusterShortcuts(): string | null {
  const { ordered } = useScopedClusters();
  const [toast, setToast] = useState<string | null>(null);
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const key = (event: KeyboardEvent) => {
      if (!event.ctrlKey || event.metaKey || event.altKey || !/^[1-9]$/.test(event.key)) return;
      const target = ordered[Number(event.key) - 1];
      if (!target) return;
      event.preventDefault();
      setClusterScope(target.id);
      setToast(`Switched to ${target.name}`);
      clearTimeout(timer);
      timer = setTimeout(() => setToast(null), 2000);
    };
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("keydown", key);
      clearTimeout(timer);
    };
  }, [ordered]);
  return toast;
}

function Brand() {
  return (
    <Link href="/" className="flex items-center gap-2 rounded-md text-[15px] font-semibold tracking-tight">
      <Image src="/logo.png" alt="" width={26} height={26} priority />
      KubeiQ
    </Link>
  );
}

function PhoneClusterPicker() {
  const { current, ordered } = useScopedClusters();
  if (!current) return null;
  return (
    <div className="px-4 pb-3">
      <ClusterSwitcher current={current} ordered={ordered} wide />
    </div>
  );
}

function productName(pathname: string): string {
  if (pathname === "/") return "Overview";
  if (pathname.startsWith("/settings")) return "Settings";
  return [...PRODUCTS, ...INSIGHTS].find((p) => pathname === p.href || pathname.startsWith(`${p.href}/`))?.name ?? "KubeiQ";
}

/** "Group / Page / Resource": the middle collapses on narrow screens. */
function Breadcrumb({ pathname, location, kind }: { pathname: string; location: Location; kind: string | null }) {
  const hash = useHash();
  const me = useMe();
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const cluster = resolveCluster(clusters.data, useClusterScope());
  const kinds = useQuery({
    queryKey: ["manager", "kinds", cluster],
    queryFn: () => api.kinds(cluster!),
    enabled: Boolean(cluster) && pathname === "/manager",
    staleTime: 5 * 60_000,
  });
  const title = productName(pathname);
  const parts: string[] = [title];
  let leaf: { name: string; sub: string | null } | null = null;

  if (pathname.startsWith("/settings")) {
    const area = areaFromHash(hash, me.data?.role === "admin");
    parts.push(SETTINGS_AREAS.find((a) => a.id === area)?.label ?? "");
  } else if (pathname === "/manager" && kind) {
    const [g, , r] = kind.split("/");
    const served = kinds.data?.flatMap((c) => c.kinds).find((k) => (k.group || "core") === g && k.resource === r);
    parts.push(findResource(kind)?.item.label ?? served?.label ?? r);
    if (location.name) leaf = { name: location.name, sub: location.namespace };
  }

  if (parts.length === 1 && !leaf)
    return pathname === "/" ? (
      <span className="font-medium text-fg">{title}</span>
    ) : (
      <h1 className="truncate text-[15px] font-semibold text-fg">{title}</h1>
    );

  return (
    <ol className="flex min-w-0 items-center gap-2">
      {parts.map((part, i) => {
        const last = i === parts.length - 1 && !leaf;
        const middle = i > 0 && !last;
        return (
          <li key={part} className={`flex min-w-0 items-center gap-2 ${middle || (!last && i === 0) ? "hidden sm:flex" : "flex"}`}>
            {i > 0 && <span className="text-subtle">/</span>}
            <span className={last ? "truncate font-medium text-fg" : "truncate text-muted"}>{part}</span>
          </li>
        );
      })}
      {leaf && (
        <li className="flex min-w-0 items-center gap-2">
          <span className="text-subtle">/</span>
          <span className="truncate font-mono text-[13px] font-medium text-fg">{leaf.name}</span>
          {leaf.sub && <span className="hidden shrink-0 text-xs text-subtle md:inline">in {leaf.sub}</span>}
        </li>
      )}
    </ol>
  );
}

function TopBar({
  pathname,
  location,
  kind,
  onMenu,
}: {
  pathname: string;
  location: Location;
  kind: string | null;
  onMenu: () => void;
}) {
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
        <Breadcrumb pathname={pathname} location={location} kind={kind} />
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <button
          type="button"
          onClick={openPalette}
          aria-label="Search (Ctrl K)"
          className="flex h-8 items-center gap-2 rounded-lg border border-control bg-bg px-2.5 text-sm text-subtle transition-colors hover:border-subtle hover:text-fg"
        >
          <SearchIcon width={14} height={14} />
          <span className="hidden md:inline">Search</span>
          <kbd className="hidden rounded border border-border px-1 font-sans text-[11px] md:inline">Ctrl K</kbd>
        </button>
        <AssistantPanel />
        <ThemeToggle />
      </div>
    </header>
  );
}
