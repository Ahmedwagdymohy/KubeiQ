import Link from "next/link";

import { ChevronDownIcon, GitHubIcon, SettingsIcon } from "@/components/icons";
import { UserMenu } from "@/components/auth/user-menu";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { GITHUB_URL, PRODUCTS } from "@/lib/products";

export function AppHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-16 max-w-[1680px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/">
            <Logo />
          </Link>
          <div className="group relative">
            <button
              type="button"
              className="flex items-center gap-1 text-sm text-muted transition-colors group-focus-within:text-fg group-hover:text-fg"
            >
              Products
              <ChevronDownIcon width={14} height={14} />
            </button>
            <div className="invisible absolute left-0 top-full z-20 w-80 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
              <div className="rounded-lg border border-border bg-bg p-2 shadow-xl shadow-black/20">
                {PRODUCTS.map(({ href, name, description, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    className="flex items-center gap-3 rounded-md p-3 transition-colors hover:bg-surface-2"
                  >
                    <span className="shrink-0 text-accent">
                      <Icon width={24} height={24} />
                    </span>
                    <span className="flex flex-col">
                      <span className="text-sm font-medium text-fg">{name}</span>
                      <span className="text-sm text-muted">{description}</span>
                    </span>
                  </Link>
                ))}
                <p className="px-3 pb-2 pt-1 text-xs text-subtle">More tools are on the way</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted sm:gap-4">
          <a
            href={`${GITHUB_URL}#readme`}
            className="hidden transition-colors hover:text-fg sm:inline"
          >
            Docs
          </a>
          <a
            href={GITHUB_URL}
            aria-label="GitHub"
            className="rounded-md p-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <GitHubIcon />
          </a>
          <Link
            href="/settings"
            aria-label="Settings"
            title="Settings"
            className="rounded-md p-2 transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <SettingsIcon />
          </Link>
          <ThemeToggle />
          <UserMenu />
        </div>
      </nav>
    </header>
  );
}
