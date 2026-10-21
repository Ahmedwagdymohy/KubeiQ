export function Logo() {
  return (
    <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
      <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
        <path
          d="M12 2 20.66 7v10L12 22 3.34 17V7z"
          fill="none"
          stroke="var(--accent)"
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="12" r="3" fill="var(--accent)" />
      </svg>
      KubeiQ
    </span>
  );
}
