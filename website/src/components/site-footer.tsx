import Link from "next/link";

import { Logo } from "@/components/logo";
import { DOCS_URL, GITHUB_URL, PRODUCTS } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1680px] flex-col gap-10 px-6 py-12 md:flex-row md:justify-between">
        <div className="flex flex-col gap-3">
          <Logo />
          <p className="max-w-xs text-sm text-muted">
            Open source AI tools for Kubernetes, running on your own servers
          </p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <p className="font-medium">Products</p>
            {PRODUCTS.map((p) => (
              <Link key={p.slug} href={`/products/${p.slug}`} className="text-muted hover:text-fg">
                {p.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-medium">Get Started</p>
            <Link href="/install" className="text-muted hover:text-fg">
              Install
            </Link>
            <Link href="/pricing" className="text-muted hover:text-fg">
              Pricing
            </Link>
            <a href={DOCS_URL} className="text-muted hover:text-fg">
              Docs
            </a>
          </div>
          <div className="flex flex-col gap-2">
            <p className="font-medium">Project</p>
            <a href={GITHUB_URL} className="text-muted hover:text-fg">
              GitHub
            </a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className="text-muted hover:text-fg">
              Apache-2.0 License
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
