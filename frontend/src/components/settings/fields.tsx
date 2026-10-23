import type { ReactNode } from "react";

export const input =
  "w-full rounded-md border border-control bg-bg px-3 py-2 text-sm text-fg outline-none placeholder:text-subtle focus:border-accent";

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
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-medium text-muted">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="px-5 py-6 sm:px-10 sm:py-8">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>
      <div className="mt-6">{children}</div>
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
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-primary bg-primary" : "border-control bg-surface-2"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full bg-bg shadow transition-all ${
            checked ? "left-[18px]" : "left-0.5"
          }`}
        />
      </span>
      <span className="text-fg">{label}</span>
    </button>
  );
}

export const primaryButton =
  "rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-ink transition-opacity hover:opacity-85 disabled:cursor-not-allowed disabled:opacity-50";
export const secondaryButton =
  "rounded-md border border-control px-4 py-2 text-sm text-fg transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50";
