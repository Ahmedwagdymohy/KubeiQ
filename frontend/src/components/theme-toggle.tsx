"use client";

import { MoonIcon, SunIcon } from "@/components/icons";

function currentTheme(): "light" | "dark" {
  const explicit = document.documentElement.dataset.theme;
  if (explicit === "light" || explicit === "dark") return explicit;
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

/** "system" follows the operating system; light and dark are remembered in this browser. */
export function setTheme(theme: "light" | "dark" | "system") {
  try {
    if (theme === "system") {
      delete document.documentElement.dataset.theme;
      localStorage.removeItem("kubeiq-theme");
    } else {
      document.documentElement.dataset.theme = theme;
      localStorage.setItem("kubeiq-theme", theme);
    }
  } catch {
    // storage unavailable; the theme still applies for this page
  }
}

export function savedTheme(): "light" | "dark" | "system" {
  try {
    const t = localStorage.getItem("kubeiq-theme");
    return t === "light" || t === "dark" ? t : "system";
  } catch {
    return "system";
  }
}

export function toggleTheme() {
  const next = currentTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  try {
    localStorage.setItem("kubeiq-theme", next);
  } catch {
    // storage unavailable (private mode); theme still applies for this page
  }
}

export function ThemeToggle() {
  const toggle = toggleTheme;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle light and dark mode"
      className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
    >
      {/* Both icons render; CSS shows the right one, so server and client markup match. */}
      <SunIcon className="show-in-dark" />
      <MoonIcon className="show-in-light" />
    </button>
  );
}
