"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import { HelmWheel } from "@/components/helm-wheel";
import { BookIcon, CompassIcon, GitHubIcon, SettingsIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL, PRODUCTS } from "@/lib/products";

type IconType = ComponentType<{ width?: number; height?: number }>;

/** A label that appears beside a rail icon on hover and focus (the rail has no visible labels). */
function Tip({ children }: { children: ReactNode }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-50 ml-3 hidden -translate-y-1/2 whitespace-nowrap rounded-md bg-primary px-2.5 py-1 text-xs font-medium text-primary-ink opacity-0 shadow-lg shadow-black/20 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 md:block">
      {children}
    </span>
  );
}

const item =
  "group relative flex h-10 w-10 items-center justify-center rounded-md transition-colors duration-150";

function RailLink({ href, label, icon: Icon, active }: { href: string; label: string; icon: IconType; active: boolean }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`${item} ${active ? "bg-surface-2 text-fg" : "text-muted hover:bg-surface hover:text-fg"}`}
    >
      <Icon width={18} height={18} />
      <Tip>{label}</Tip>
    </Link>
  );
}

/**
 * The app shell: a helm rail. From md up it is a fixed 56px rail on the left (the mark, Overview,
 * the three products, then Docs, GitHub, theme, Settings and the account at the bottom); on a phone
 * it folds into a 48px bar across the top. Pages keep rendering it first, as they did the header.
 */
export function AppHeader() {
  const pathname = usePathname();
  const on = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <header className="app-rail relative z-40 flex h-12 shrink-0 items-center gap-1 border-b border-border bg-bg px-2 md:fixed md:inset-y-0 md:left-0 md:h-auto md:w-14 md:flex-col md:border-b-0 md:border-r md:px-0 md:py-3">
      <Link
        href="/"
        aria-label="KubeiQ Overview"
        className="group relative mr-1 flex h-10 w-10 items-center justify-center text-fg md:mb-4 md:mr-0"
      >
        <HelmWheel className="h-7 w-7" cubeColor="var(--accent)" />
        <Tip>KubeiQ</Tip>
      </Link>
      <nav aria-label="Products" className="flex items-center gap-1 md:flex-col">
        <RailLink href="/" label="Overview" icon={CompassIcon} active={on("/")} />
        {PRODUCTS.map((p) => (
          <RailLink key={p.href} href={p.href} label={p.name} icon={p.icon} active={on(p.href)} />
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-1 md:ml-0 md:mt-auto md:flex-col">
        <a href={`${GITHUB_URL}#readme`} aria-label="Docs" className={`${item} hidden text-muted hover:bg-surface hover:text-fg sm:flex`}>
          <BookIcon width={18} height={18} />
          <Tip>Docs</Tip>
        </a>
        <a href={GITHUB_URL} aria-label="GitHub" className={`${item} hidden text-muted hover:bg-surface hover:text-fg sm:flex`}>
          <GitHubIcon width={18} height={18} />
          <Tip>GitHub</Tip>
        </a>
        <ThemeToggle />
        <RailLink href="/settings" label="Settings" icon={SettingsIcon} active={on("/settings")} />
        <div className="md:mt-2">
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
