import Link from "next/link";

import { GITHUB_URL } from "@/lib/site";

/** Two plans as two colour fields meeting at a hard edge; the wider one is the one to start with. */
export function PricingFields() {
  return (
    <section aria-labelledby="pricing" className="grid lg:grid-cols-12">
      <div className="order-2 flex min-h-[48svh] flex-col justify-between gap-12 bg-surface-2 p-8 sm:p-12 lg:order-none lg:col-span-5 lg:min-h-[90svh]">
        <div data-reveal className="flex flex-col gap-4">
          <h3 className="t-title">Teams</h3>
          <p className="max-w-[30ch] text-[17px] text-muted">
            Pro and Enterprise add unlimited users, SSO, custom roles, scheduled scans, PDF reports
            and audit export, in the same install
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="t-display text-muted">Soon</p>
          <a
            href={GITHUB_URL}
            className="rounded-md bg-bg px-6 py-4 font-semibold transition-transform hover:-translate-y-0.5"
          >
            Watch on GitHub
          </a>
        </div>
      </div>
      <div className="flex min-h-[56svh] flex-col justify-between gap-12 bg-field p-8 text-field-ink sm:p-12 lg:col-span-7 lg:min-h-[90svh]">
        <div data-reveal className="flex flex-col gap-4">
          <h2 id="pricing" className="t-title">
            Free
          </h2>
          <p className="max-w-[34ch] text-[17px]">
            Cluster Doctor, Cluster Map and Cluster Manager for up to 3 users, with any AI model or
            none. Apache-2.0, on your own servers, for good
          </p>
        </div>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <p className="flex items-baseline gap-3">
            <span
              className="font-medium leading-[0.85] tracking-[-0.06em]"
              style={{ fontSize: "clamp(96px, 12vw, 200px)" }}
            >
              $0
            </span>
            <span className="text-[17px]">forever</span>
          </p>
          <Link
            href="/install"
            className="rounded-md bg-field-ink px-7 py-4 font-semibold text-field transition-transform hover:-translate-y-0.5"
          >
            Get Started
          </Link>
        </div>
      </div>
    </section>
  );
}
