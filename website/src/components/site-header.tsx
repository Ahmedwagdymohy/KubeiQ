import Link from "next/link";

import { ChevronDownIcon, GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="border-b border-border">
      <nav className="mx-auto flex h-16 max-w-[1680px] items-center justify-between px-6">
        <div className="flex items-center gap-8">
          <Link href="/">
            <Logo />
          </Link>
          <div className="hidden items-center gap-6 text-sm text-muted md:flex">
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1 transition-colors group-focus-within:text-fg group-hover:text-fg"
              >
                Products
                <ChevronDownIcon width={14} height={14} />
              </button>
              <div className="invisible absolute left-0 top-full z-20 w-80 pt-3 opacity-0 transition-opacity group-focus-within:visible group-focus-within:opacity-100 group-hover:visible group-hover:opacity-100">
                <div className="rounded-lg border border-border bg-bg p-2 shadow-xl shadow-black/20">
                  {PRODUCTS.map(({ slug, name, description, icon: Icon }) => (
                    <Link
                      key={slug}
                      href={`/products/${slug}`}
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
                  <p className="px-3 pb-2 pt-1 text-xs text-subtle">
                    Every product is included in one install
                  </p>
                </div>
              </div>
            </div>
            <Link href="/pricing" className="transition-colors hover:text-fg">
              Pricing
            </Link>
            <a href={DOCS_URL} className="transition-colors hover:text-fg">
              Docs
            </a>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3">
          <a
            href={GITHUB_URL}
            aria-label="GitHub"
            className="rounded-md p-2 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
          <Link
            href="/install"
            className="ml-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-accent-ink transition-colors hover:bg-accent-strong"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}
