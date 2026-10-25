import { Action, rise, TextLink } from "@/components/ui";
import { GITHUB_URL } from "@/lib/site";

export const FREE_FEATURES = [
  "Cluster Doctor, Cluster Map and Cluster Manager",
  "Up to 3 users, 1 project and 3 clusters",
  "Sign in with Google",
  "Read-only by default, opt-in changes with an activity log",
  "Any AI model, or rules only",
  "Community support on GitHub",
];

const PRO_FEATURES = [
  "Everything in Free",
  "Unlimited users",
  "Scheduled scans and alerts",
  "PDF investigation reports",
  "More cluster connections",
];

const ENTERPRISE_FEATURES = [
  "Everything in Pro",
  "SSO with OIDC and LDAP",
  "Custom roles and fine-grained access",
  "Audit log export and retention",
  "AI keys per team, managed hosting",
];

const sentence = (items: string[]) => items.join(". ");

/** Pricing as two colour fields meeting at a hard edge: the free plan wide, the paid plans narrow. */
export function Plans({ heading = true }: { heading?: boolean }) {
  return (
    <section data-reveal className="flex flex-col gap-12 pt-[clamp(96px,12vw,200px)]">
      {heading && (
        <div className="frame grid gap-5 md:grid-cols-12">
          <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em] md:col-span-5">
            Pricing
          </h2>
          <p data-rise style={rise(1)} className="max-w-[48ch] text-lg leading-relaxed md:col-span-6 md:col-start-7">
            The core stays free and open source. Paid plans will add what teams and organizations need
          </p>
        </div>
      )}
      <div className="grid md:grid-cols-12">
        <div className="flex min-h-[78svh] flex-col justify-between gap-12 bg-inverse p-6 text-inverse-ink sm:p-10 md:col-span-7 md:min-h-[min(90svh,860px)]">
          <div className="flex flex-col gap-5">
            <h3 data-rise className="text-[clamp(56px,5.5vw,96px)] font-extrabold leading-[0.9] tracking-[-0.04em]">
              Free
            </h3>
            <p data-rise style={rise(1)} className="max-w-[28ch] text-xl font-semibold leading-snug">
              For anyone running Kubernetes, with every product included
            </p>
            <p data-rise style={rise(2)} className="max-w-[52ch] text-lg leading-relaxed text-inverse-ink/85">
              {sentence(FREE_FEATURES)}. Open source under Apache-2.0, on your own servers
            </p>
          </div>
          <div data-rise style={rise(3)} className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="text-[clamp(96px,10vw,176px)] font-extrabold leading-[0.8] tracking-[-0.05em]">$0</p>
            <Action href="/install" className="w-full sm:w-auto">
              Get Started
            </Action>
          </div>
        </div>

        <div className="flex min-h-[70svh] flex-col justify-between gap-12 bg-surface-2 p-6 sm:p-10 md:col-span-5 md:min-h-[min(90svh,860px)]">
          <div className="flex flex-col gap-5">
            <h3 data-rise className="text-[clamp(44px,4vw,72px)] font-extrabold leading-[0.92] tracking-[-0.04em]">
              Pro and Enterprise
            </h3>
            <p data-rise style={rise(1)} className="max-w-[26ch] text-xl font-semibold leading-snug">
              For teams, and for organizations at scale
            </p>
            <p data-rise style={rise(2)} className="max-w-[44ch] text-lg leading-relaxed">
              <span className="font-bold">Pro:</span> {sentence(PRO_FEATURES)}.
            </p>
            <p data-rise style={rise(3)} className="max-w-[44ch] text-lg leading-relaxed">
              <span className="font-bold">Enterprise:</span> {sentence(ENTERPRISE_FEATURES)}.
            </p>
          </div>
          <div data-rise style={rise(4)} className="flex flex-col gap-5">
            <p className="text-[clamp(48px,4.4vw,76px)] font-extrabold leading-[0.9] tracking-[-0.04em] text-muted">
              Coming Soon
            </p>
            <TextLink href={GITHUB_URL} className="text-lg font-bold">
              Watch the repository for updates
            </TextLink>
          </div>
        </div>
      </div>
    </section>
  );
}
