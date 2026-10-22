import Link from "next/link";
import type { ReactNode } from "react";

export function Pill({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted">
      <span className="h-1.5 w-1.5 rounded-full bg-accent" />
      {children}
    </span>
  );
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md bg-accent px-6 py-3 text-center font-medium text-accent-ink transition-colors hover:bg-accent-strong"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  const className =
    "rounded-md border border-fg/80 px-6 py-3 text-center font-medium transition-colors hover:bg-surface-2";
  return href.startsWith("http") ? (
    <a href={href} className={className}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className}>
      {children}
    </Link>
  );
}

export function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-3xl font-medium leading-tight tracking-tight sm:text-4xl">{title}</h2>
      {description && <p className="max-w-2xl text-lg text-muted">{description}</p>}
    </div>
  );
}
