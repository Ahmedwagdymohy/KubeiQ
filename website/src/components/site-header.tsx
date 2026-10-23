import Link from "next/link";

import { ChevronDownIcon, GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

export function SiteHeader() {
  return (
    <header className="bg-frame">
      <nav className="wrap flex h-16 items-center justify-between">
        <div className="flex items-center gap-10">
          <Link href="/" aria-label="KubeiQ home">
            <Logo />
          </Link>
          <div className="hidden items-center gap-7 text-[15px] text-muted md:flex">
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1 transition-colors group-focus-within:text-fg group-hover:text-fg"
              >
                Products
                <ChevronDownIcon width={14} height={14} />
              </button>
              <div className="absolute left-0 top-full z-30 hidden w-80 pt-3 group-focus-within:block group-hover:block">
                <div className={"rounded-xl bg-bg p-2 shadow-xl shadow-black/15" /* taste-skill-ignore: open menu floats */}>
                  {PRODUCTS.map(({ slug, name, description }) => (
                    <Link
                      key={slug}
                      href={`/products/${slug}`}
                      className="flex flex-col rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-2"
                    >
                      <span className="text-[15px] font-medium text-fg">{name}</span>
                      <span className="text-sm text-muted">{description}</span>
                    </Link>
                  ))}
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
        <div className="flex items-center gap-1 sm:gap-2">
          <a
            href={GITHUB_URL}
            aria-label="GitHub"
            className="hidden rounded-md p-2 text-muted transition-colors hover:bg-frame-hover hover:text-fg sm:block"
          >
            <GitHubIcon />
          </a>
          <ThemeToggle />
          <Link
            href="/install"
            className="ml-2 rounded-md bg-accent px-4 py-2 text-[15px] font-medium text-accent-ink transition-[background-color,transform] hover:bg-accent-strong active:translate-y-px"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}
