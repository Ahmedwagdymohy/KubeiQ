import Link from "next/link";

import { ChevronDownIcon, GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

/** A plain bar on the cyan field: wordmark, a few links, one action. Every page opens on the field. */
export function SiteHeader() {
  return (
    <header className="relative z-30 bg-field text-field-ink">
      <nav className="frame flex h-16 items-center justify-between gap-4">
        <Link href="/" aria-label="KubeiQ home" className="press">
          <Logo />
        </Link>
        <div className="flex items-center gap-1 sm:gap-2">
          <div className="hidden items-center gap-7 pr-4 text-lg font-semibold md:flex">
            <div className="group relative">
              <button type="button" className="flex items-center gap-1 py-2">
                Products
                <ChevronDownIcon width={16} height={16} />
              </button>
              <div className="absolute right-0 top-full hidden w-80 pt-2 group-focus-within:block group-hover:block">
                <div className="bg-bg p-2 text-fg shadow-2xl shadow-black/30">
                  {PRODUCTS.map(({ slug, name, description }) => (
                    <Link
                      key={slug}
                      href={`/products/${slug}`}
                      className="flex flex-col gap-0.5 px-4 py-3 transition-colors hover:bg-surface-2"
                    >
                      <span className="text-base font-bold">{name}</span>
                      <span className="text-sm font-medium text-muted">{description}</span>
                    </Link>
                  ))}
                  <p className="px-4 pb-2 pt-1 text-sm font-medium text-subtle">
                    Every product is included in one install
                  </p>
                </div>
              </div>
            </div>
            <Link href="/pricing" className="underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-current">
              Pricing
            </Link>
            <a href={DOCS_URL} className="underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-current">
              Docs
            </a>
          </div>
          <a href={GITHUB_URL} aria-label="GitHub" className="press p-2.5 hover:bg-field-deep">
            <GitHubIcon width={20} height={20} />
          </a>
          <ThemeToggle />
          <Link
            href="/install"
            className="press ml-1 inline-flex h-11 items-center bg-field-ink px-4 text-base font-bold text-field hover:bg-black sm:px-5"
          >
            Get Started
          </Link>
        </div>
      </nav>
    </header>
  );
}
