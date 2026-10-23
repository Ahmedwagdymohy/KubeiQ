import Link from "next/link";

import { Action } from "@/components/ui";
import { DOCS_URL, GITHUB_URL, PICTURE_CREDITS, PRODUCTS } from "@/lib/site";

const link = "underline decoration-transparent decoration-2 underline-offset-4 transition-colors hover:decoration-current";

/** Close and footer in one field of the inverse colour, with the name cropped by the bottom edge. */
export function SiteFooter() {
  return (
    <footer data-reveal className="relative flex flex-col overflow-hidden bg-inverse lg:min-h-[100svh] text-inverse-ink">
      <div className="frame grid gap-12 pt-[clamp(64px,9vw,128px)] md:grid-cols-12">
        <div className="flex flex-col items-start gap-8 md:col-span-7">
          <h2 data-rise className="text-[11vw] font-extrabold leading-[0.92] tracking-[-0.045em] md:text-[clamp(48px,5vw,88px)]">
            Built in the Open
          </h2>
          <p data-rise className="max-w-[44ch] text-lg leading-relaxed">
            KubeiQ is Apache-2.0. Read the code, run it on your own servers and bring your own AI model
          </p>
          <div data-rise className="w-full sm:w-auto">
            <Action href={GITHUB_URL} tone="inverse" className="w-full sm:w-auto">
              View on GitHub
            </Action>
          </div>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-8 gap-y-8 text-base font-semibold md:col-span-5 md:grid-cols-2">
          <div className="flex flex-col gap-2.5">
            <p className="text-inverse-muted">Products</p>
            {PRODUCTS.map((p) => (
              <Link key={p.slug} href={`/products/${p.slug}`} className={link}>
                {p.name}
              </Link>
            ))}
          </div>
          <div className="flex flex-col gap-2.5">
            <p className="text-inverse-muted">Get Started</p>
            <Link href="/install" className={link}>
              Install
            </Link>
            <Link href="/pricing" className={link}>
              Pricing
            </Link>
            <a href={DOCS_URL} className={link}>
              Docs
            </a>
            <a href={`${GITHUB_URL}/blob/main/LICENSE`} className={link}>
              Apache-2.0 License
            </a>
          </div>
        </nav>
      </div>

      <div className="frame mt-auto pt-16">
        <p className="max-w-[120ch] text-sm leading-relaxed text-inverse-muted">
          Pictures, all public domain via Wikimedia Commons:{" "}
          {PICTURE_CREDITS.map((c, i) => (
            <span key={c.page}>
              <a href={c.page} className={`text-inverse-ink ${link}`}>
                {c.title}
              </a>
              , {c.creator}
              {i < PICTURE_CREDITS.length - 1 ? "; " : "."}
            </span>
          ))}
        </p>
      </div>
      <p
        aria-hidden
        className="frame -mb-[0.2em] mt-4 select-none whitespace-nowrap text-[36vw] font-extrabold leading-[0.8] tracking-[-0.06em] md:-mb-[0.24em] md:text-[29vw]"
      >
        KubeiQ
      </p>
    </footer>
  );
}
