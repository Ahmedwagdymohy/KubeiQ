import Link from "next/link";

import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

/** One quiet line under the sheet: what this is, the links, the licence. */
export function SiteFooter() {
  const link = "text-fg transition-colors hover:text-accent";
  return (
    <footer className="wrap grid gap-2 py-7 text-[15px] text-muted lg:grid-cols-[1fr_auto_1fr] lg:items-baseline lg:gap-6">
      <p>KubeiQ, AI tools for Kubernetes</p>
      <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-1">
        {PRODUCTS.map((p) => (
          <Link key={p.slug} href={`/products/${p.slug}`} className={link}>
            {p.name}
          </Link>
        ))}
        <Link href="/pricing" className={link}>
          Pricing
        </Link>
        <Link href="/install" className={link}>
          Install
        </Link>
        <a href={DOCS_URL} className={link}>
          Docs
        </a>
        <a href={GITHUB_URL} className={link}>
          GitHub
        </a>
      </nav>
      <p className="lg:text-right">
        2026, open source under{" "}
        <a href={`${GITHUB_URL}/blob/main/LICENSE`} className={link}>
          Apache-2.0
        </a>
      </p>
    </footer>
  );
}
