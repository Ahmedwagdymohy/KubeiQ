import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex h-11 items-center justify-center rounded-md bg-accent px-5 text-[15px] font-medium text-accent-ink transition-[background-color,transform] hover:bg-accent-strong active:translate-y-px"
    >
      {children}
    </Link>
  );
}

/** A plain text link with an arrow that moves on hover. */
export function TextLink({ href, children }: { href: string; children: ReactNode }) {
  const className =
    "group inline-flex items-center gap-1.5 text-[15px] font-medium text-fg underline-offset-4 transition-colors hover:text-accent";
  const inner = (
    <>
      {children}
      <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
        →
      </span>
    </>
  );
  return href.startsWith("http") ? (
    <a href={href} className={className}>
      {inner}
    </a>
  ) : (
    <Link href={href} className={className}>
      {inner}
    </Link>
  );
}

/** Staggered entrance wrapper (see .rise in globals.css). */
export function Rise({
  children,
  delay = 0,
  className = "",
  as: Tag = "div",
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  as?: "div" | "p" | "h2" | "h3" | "li" | "figure";
}) {
  return (
    <Tag className={`rise ${className}`} style={{ "--d": `${delay}ms` } as CSSProperties}>
      {children}
    </Tag>
  );
}

export function SectionTitle({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <h2
      className={`rise text-[26px] font-medium leading-[1.1] tracking-[-0.02em] sm:text-[30px] ${className}`}
    >
      {children}
    </h2>
  );
}

/** A real screenshot of the app, light or dark to match the page. */
export function Screen({
  light,
  dark,
  alt,
  width = 1600,
  height = 1000,
  priority = false,
  className = "",
}: {
  light?: string;
  dark: string;
  alt: string;
  width?: number;
  height?: number;
  priority?: boolean;
  className?: string;
}) {
  return (
    <div className={`overflow-hidden rounded-xl bg-surface ${className}`}>
      {light && (
        <Image
          src={light}
          alt={alt}
          width={width}
          height={height}
          priority={priority}
          className="show-in-light h-auto w-full"
        />
      )}
      <Image
        src={dark}
        alt={alt}
        width={width}
        height={height}
        priority={priority}
        className={`${light ? "show-in-dark" : ""} h-auto w-full`}
      />
    </div>
  );
}
