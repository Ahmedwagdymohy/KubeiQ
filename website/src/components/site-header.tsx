import Link from "next/link";

import { GitHubIcon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

const link = "transition-colors hover:text-fg";

/** Wordmark at the margin, the links on the page axis, the one action at the right margin. */
export function SiteHeader() {
  return (
    <header className="frame relative z-30 flex h-20 items-center justify-between bg-bg">
      <Link href="/" aria-label="KubeiQ home">
        <Logo />
      </Link>
      <nav
        aria-label="Main"
        className="absolute hidden items-center gap-8 text-[15px] text-muted md:flex"
        style={{ left: "42vw" }}
      >
        <div className="group relative">
          <Link href="/#products" className={link}>
            Products
          </Link>
          <div className="absolute left-0 top-full hidden w-80 pt-4 group-focus-within:block group-hover:block">
            <div className="flex flex-col rounded-lg bg-surface-2 p-2 shadow-2xl shadow-black/30">
              {PRODUCTS.map(({ slug, name, description, icon: Icon }) => (
                <Link
                  key={slug}
                  href={`/products/${slug}`}
                  className="flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-bg"
                >
                  <span className="mt-0.5 shrink-0 text-accent">
                    <Icon width={20} height={20} />
                  </span>
                  <span className="flex flex-col">
                    <span className="text-sm font-medium text-fg">{name}</span>
                    <span className="text-sm text-muted">{description}</span>
                  </span>
                </Link>
              ))}
            </div>
          </div>
        </div>
        <Link href="/pricing" className={link}>
          Pricing
        </Link>
        <a href={DOCS_URL} className={link}>
          Docs
        </a>
      </nav>
      <div className="flex items-center gap-1 sm:gap-2">
        <a
          href={GITHUB_URL}
          aria-label="GitHub"
          className="rounded-md p-2.5 text-muted transition-colors hover:bg-surface-2 hover:text-fg"
        >
          <GitHubIcon />
        </a>
        <ThemeToggle />
        <Link
          href="/install"
          className="ml-2 rounded-md bg-primary px-5 py-3 text-sm font-semibold text-primary-ink transition-transform hover:-translate-y-0.5 active:translate-y-0"
        >
          Get Started
        </Link>
      </div>
    </header>
  );
}
