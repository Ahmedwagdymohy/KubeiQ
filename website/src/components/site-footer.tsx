import Link from "next/link";

import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

const small = "text-[15px] text-field-ink/75 transition-colors hover:text-field-ink";

/** The name opens the footer at full width; the ways in sit under it. */
export function SiteFooter() {
  return (
    <footer className="overflow-hidden bg-field text-field-ink">
      <div className="frame flex flex-col pb-10 pt-16 sm:pt-24">
        <p
          aria-hidden
          className="select-none whitespace-nowrap font-semibold leading-[0.8] tracking-[-0.06em]"
          style={{ fontSize: "clamp(96px, 24.5vw, 420px)" }}
        >
          KubeiQ
        </p>
        <div className="mt-16 grid gap-12 md:grid-cols-12 sm:mt-20">
          <div className="flex flex-col gap-2 md:col-span-5">
            <Link href="/install" className="t-statement font-medium hover:underline">
              Install in one command
            </Link>
            <a href={GITHUB_URL} className="t-statement font-medium hover:underline">
              Star it on GitHub
            </a>
            <a href={DOCS_URL} className="t-statement font-medium hover:underline">
              Read the docs
            </a>
          </div>
          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3 md:col-span-6 md:col-start-7">
            <div className="flex flex-col gap-2.5">
              <p className="text-[15px] font-semibold">Products</p>
              {PRODUCTS.map((p) => (
                <Link key={p.slug} href={`/products/${p.slug}`} className={small}>
                  {p.name}
                </Link>
              ))}
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[15px] font-semibold">Get Started</p>
              <Link href="/install" className={small}>
                Install
              </Link>
              <Link href="/pricing" className={small}>
                Pricing
              </Link>
              <a href={DOCS_URL} className={small}>
                Docs
              </a>
            </div>
            <div className="flex flex-col gap-2.5">
              <p className="text-[15px] font-semibold">Project</p>
              <a href={GITHUB_URL} className={small}>
                GitHub
              </a>
              <a href={`${GITHUB_URL}/blob/main/LICENSE`} className={small}>
                Apache-2.0 License
              </a>
            </div>
          </div>
        </div>
        <div className="mt-20 flex items-center justify-between gap-4 text-sm text-field-ink/75 sm:mt-24">
          <p>Open source, self-hosted, read-only by default</p>
          <a href="#top" className="transition-colors hover:underline">
            Back to top
          </a>
        </div>
      </div>
    </footer>
  );
}
