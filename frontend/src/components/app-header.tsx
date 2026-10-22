import Link from "next/link";

import { Logo } from "@/components/logo";

export const GITHUB_URL = "https://github.com/Ahmedwagdymohy/KubeiQ";

export function AppHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
        <Link href="/">
          <Logo />
        </Link>
        <div className="flex items-center gap-4 text-sm text-muted sm:gap-6">
          <Link href="/dashboard" className="transition-colors hover:text-fg">
            Dashboard
          </Link>
          <a href={`${GITHUB_URL}#readme`} className="hidden transition-colors hover:text-fg sm:inline">
            Docs
          </a>
          <a href={GITHUB_URL} className="transition-colors hover:text-fg">
            GitHub
          </a>
        </div>
      </nav>
    </header>
  );
}
