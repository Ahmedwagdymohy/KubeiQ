import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";

/** Stagger index for a `data-rise` part (80ms per step). */
export const rise = (i: number) => ({ "--i": i }) as CSSProperties;

type Tone = "field" | "ink" | "inverse";

const TONES: Record<Tone, string> = {
  // cyan rectangle with dark ink: the one action colour
  field: "bg-field text-field-ink hover:bg-field-deep",
  // the page's ink as a fill: used on a cyan field
  ink: "bg-fg text-bg hover:bg-fg/85",
  // used on an inverse field
  inverse: "bg-inverse-ink text-inverse hover:bg-inverse-ink/85",
};

/** The one button shape on the site: a square-cornered, chunky rectangle. */
export function Action({
  href,
  children,
  tone = "field",
  className = "",
}: {
  href: string;
  children: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const cls = `press inline-flex min-h-14 items-center justify-center px-7 text-lg font-bold ${TONES[tone]} ${className}`;
  return href.startsWith("http") ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

/** A plain text link with an underline that appears on hover. */
export function TextLink({ href, children, className = "" }: { href: string; children: ReactNode; className?: string }) {
  const cls = `underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-current ${className}`;
  return href.startsWith("http") ? (
    <a href={href} className={cls}>
      {children}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {children}
    </Link>
  );
}

export function SectionHeading({
  title,
  description,
  className = "",
}: {
  title: string;
  description?: string;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-5 ${className}`}>
      <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em]">
        {title}
      </h2>
      {description && (
        <p data-rise style={rise(1)} className="max-w-[46ch] text-lg leading-relaxed">
          {description}
        </p>
      )}
    </div>
  );
}
