"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ComponentType, ReactNode } from "react";

import { UserMenu } from "@/components/auth/user-menu";
import { BookIcon, HomeIcon, SettingsIcon } from "@/components/icons";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL, PRODUCTS } from "@/lib/products";

type Destination = {
  href: string;
  name: string;
  short: string;
  icon: ComponentType<{ width?: number; height?: number }>;
};

const MAIN: Destination[] = [
  { href: "/", name: "Overview", short: "Overview", icon: HomeIcon },
  ...PRODUCTS.map((p) => ({ ...p, short: p.name.replace("Cluster ", "") })),
];
const SETTINGS: Destination = {
  href: "/settings",
  name: "Settings",
  short: "Settings",
  icon: SettingsIcon,
};

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Label that appears beside a rail icon on hover and keyboard focus. */
function Tip({ children }: { children: string }) {
  return (
    <span className="pointer-events-none absolute left-full top-1/2 z-30 ml-2 -translate-y-1/2 whitespace-nowrap rounded-md border border-border bg-bg px-2 py-1 text-xs text-fg opacity-0 shadow-lg shadow-black/20 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
      {children}
    </span>
  );
}

function RailLink({ item, active }: { item: Destination; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-label={item.name}
      aria-current={active ? "page" : undefined}
      className={`group relative flex h-10 w-full items-center justify-center transition-colors ${
        active ? "text-fg" : "text-subtle hover:text-fg"
      }`}
    >
      <Icon width={18} height={18} />
      {/* The one selection mark: a 1px line on the rail's edge. */}
      {active && <span className="absolute inset-y-2 right-0 w-px bg-accent" />}
      <Tip>{item.name}</Tip>
    </Link>
  );
}

function Rail({ pathname }: { pathname: string }) {
  return (
    <nav
      aria-label="Main"
      className="sticky top-0 hidden h-dvh w-14 shrink-0 flex-col items-center border-r border-border bg-bg py-3 md:flex"
    >
      <Link href="/" aria-label="KubeiQ" className="group relative mb-4 flex h-10 items-center">
        <Image src="/logo.png" alt="" width={30} height={30} priority />
        <Tip>KubeiQ</Tip>
      </Link>
      <div className="flex w-full flex-col gap-1">
        {MAIN.map((item) => (
          <RailLink key={item.href} item={item} active={isActive(pathname, item.href)} />
        ))}
      </div>
      <div className="mt-auto flex w-full flex-col items-center gap-1">
        <a
          href={`${GITHUB_URL}#readme`}
          aria-label="Docs"
          className="group relative flex h-10 w-full items-center justify-center text-subtle transition-colors hover:text-fg"
        >
          <BookIcon width={18} height={18} />
          <Tip>Docs</Tip>
        </a>
        <RailLink item={SETTINGS} active={isActive(pathname, SETTINGS.href)} />
        <ThemeToggle />
        <div className="mt-2">
          <UserMenu placement="rail" />
        </div>
      </div>
    </nav>
  );
}

/** Phone: a slim top bar for the brand and account, and the destinations along the bottom. */
function PhoneBars({ pathname }: { pathname: string }) {
  return (
    <>
      <header className="sticky top-0 z-20 flex h-12 items-center justify-between border-b border-border bg-bg px-4 md:hidden">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Image src="/logo.png" alt="" width={24} height={24} />
          KubeiQ
        </Link>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <UserMenu />
        </div>
      </header>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-20 grid h-14 grid-cols-5 border-t border-border bg-bg px-2 md:hidden"
      >
        {[...MAIN, SETTINGS].map((item) => {
          const active = isActive(pathname, item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={`relative flex flex-col items-center justify-center gap-1 text-[11px] ${
                active ? "text-fg" : "text-subtle"
              }`}
            >
              {active && <span className="absolute inset-x-5 top-0 h-px bg-accent" />}
              <Icon width={18} height={18} />
              {item.short}
            </Link>
          );
        })}
      </nav>
    </>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <>{children}</>;
  return (
    <div className="flex min-h-dvh flex-1">
      <Rail pathname={pathname} />
      <div className="flex min-w-0 flex-1 flex-col pb-14 md:pb-0">
        <PhoneBars pathname={pathname} />
        {children}
      </div>
    </div>
  );
}
