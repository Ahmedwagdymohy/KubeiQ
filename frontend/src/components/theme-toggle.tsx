"use client";

import { MoonIcon, SunIcon } from "@/components/icons";

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
}

export function ThemeToggle() {
  const toggle = () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem("kubeiq-theme", next);
    } catch {
      // storage unavailable (private mode); theme still applies for this page
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      className="flex h-10 w-10 items-center justify-center rounded-md text-muted transition-colors hover:bg-surface hover:text-fg"
    >
      {/* Both icons render; CSS shows the right one, so server and client markup match. */}
      <SunIcon width={18} height={18} className="show-in-dark" />
      <MoonIcon width={18} height={18} className="show-in-light" />
    </button>
  );
}
