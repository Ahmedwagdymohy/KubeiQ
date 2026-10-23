import type { ReactNode } from "react";

export const input =
  "h-10 w-full rounded-lg border border-control bg-bg px-3 text-sm text-fg outline-none transition-colors placeholder:text-subtle focus:border-accent";

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: ReactNode;
  children: ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-sm font-medium text-fg">{label}</span>
      {children}
      {hint && <span className="text-[13px] text-subtle">{hint}</span>}
    </label>
  );
}

/**
 * One settings area: the title and description in a label column beside the panel that holds
 * the controls. On a narrow screen the label stacks above the panel.
 */
export function Section({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: string;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      className="grid scroll-mt-6 gap-x-10 gap-y-4 border-t border-border py-8 first:border-t-0 first:pt-0 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]"
    >
      <div className="flex flex-col gap-1.5 lg:pt-2">
        <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
        <p className="text-sm text-muted">{description}</p>
        {aside && <div className="mt-3 text-sm text-muted">{aside}</div>}
      </div>
      <div className="min-w-0 rounded-2xl bg-surface p-4 sm:p-5">{children}</div>
    </section>
  );
}

export function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex items-center gap-3 text-left text-sm"
    >
      <span
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
          checked ? "bg-fg" : "bg-control"
        }`}
      >
        <span
          className={`absolute top-0.5 h-4 w-4 rounded-full bg-bg transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="font-medium text-fg">{label}</span>
    </button>
  );
}

/** The one filled action on a screen: the logo cyan. */
export const primaryButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-accent-ink transition-colors hover:bg-accent-strong active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-control bg-bg px-3.5 text-sm font-medium text-fg transition-colors hover:border-subtle hover:bg-surface active:translate-y-px disabled:cursor-not-allowed disabled:opacity-50";
