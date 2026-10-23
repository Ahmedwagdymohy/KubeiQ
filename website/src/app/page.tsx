import { CommandBlock } from "@/components/command-block";
import { IncidentStates } from "@/components/incident-states";
import { KubeMascot } from "@/components/kube-mascot";
import { PanelNotes } from "@/components/panel-notes";
import { ProductReel } from "@/components/product-reel";
import { RecognizeTable } from "@/components/recognize-table";
import { Readout } from "@/components/readout";
import { ScanStages } from "@/components/scan-stages";
import { PrimaryLink, Rise, SectionTitle, TextLink } from "@/components/ui";
import { GITHUB_URL, INSTALL_COMMAND } from "@/lib/site";

export default function Home() {
  return (
    <>
      <section className="wrap pb-10 pt-[clamp(48px,11vh,120px)]">
        <div className="grid12 gap-y-10">
          <h1 className="col-span-12 text-[clamp(30px,5.4vw,82px)] font-medium leading-[1.02] tracking-[-0.035em] lg:col-span-11">
            One line on what broke. <br className="hidden sm:block" />
            One command to fix it.
          </h1>
          <div className="col-span-12 flex flex-col gap-7 lg:col-span-5">
            <p className="max-w-[44ch] text-lg leading-relaxed">
              KubeiQ reads your Kubernetes clusters, names the root cause of a failing workload and
              writes the exact command to fix it. Self-hosted, open source and read-only
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
              <PrimaryLink href="/install">Get Started</PrimaryLink>
              <TextLink href={GITHUB_URL}>View on GitHub</TextLink>
            </div>
          </div>
          <div className="col-span-12 flex flex-col gap-3 pt-16 lg:col-span-6 lg:col-start-7 lg:pt-6">
            <div className="relative">
              <KubeMascot />
              <CommandBlock commands={[INSTALL_COMMAND]} />
            </div>
            <p className="text-base text-muted">
              One command installs every product. It needs Docker and a kubeconfig
            </p>
          </div>
        </div>
      </section>

      <section id="readout" aria-label="Live diagnosis" className="wrap scroll-mt-6 pb-10">
        <Readout />
        <p className="pt-4 text-base text-muted">
          These are the real results for the broken workloads in KubeiQ&apos;s demo namespace. Pick
          one to read it again
        </p>
      </section>

      <section className="wrap pt-[clamp(96px,14vw,200px)]">
        <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,7fr)_minmax(0,2fr)]">
          <SectionTitle className="lg:col-start-2">From Red to Running</SectionTitle>
        </div>
        <div className="pt-12 lg:pt-16">
          <IncidentStates />
        </div>
      </section>

      <section className="wrap pt-[clamp(96px,14vw,200px)]">
        <SectionTitle>How a Scan Works</SectionTitle>
        <ScanStages />
      </section>

      <section className="wrap pt-[clamp(72px,10vw,160px)]">
        <div className="grid12 gap-y-4 pb-14">
          <SectionTitle className="col-span-12 lg:col-span-5">Three Tools, One Panel</SectionTitle>
          <Rise
            as="p"
            delay={80}
            className="col-span-12 max-w-[48ch] text-lg leading-relaxed lg:col-span-6 lg:col-start-7"
          >
            Cluster Doctor, Cluster Map and Cluster Manager come in the same install and share your
            clusters, your sign-in and your AI settings. Here is where they meet
          </Rise>
        </div>
        <PanelNotes />
      </section>

      <section className="wrap pt-[clamp(96px,14vw,200px)]">
        <div className="grid12 pb-12">
          <SectionTitle className="col-span-12 lg:col-span-5">The Screens You Get</SectionTitle>
          <Rise
            as="p"
            delay={80}
            className="col-span-12 max-w-[48ch] pt-4 text-lg leading-relaxed lg:col-span-6 lg:col-start-7 lg:pt-0"
          >
            Real screens from a real cluster: the demo namespace above, read by each product. They
            change every few seconds, or pick one
          </Rise>
        </div>
        <ProductReel />
      </section>

      <section className="wrap pt-[clamp(96px,14vw,200px)]">
        <h2 className="rise text-[clamp(40px,5.4vw,82px)] font-medium leading-[1] tracking-[-0.035em]">
          What It
          <span className="block pl-[16.66%]">Recognizes</span>
        </h2>
        <Rise delay={90} className="pt-14">
          <RecognizeTable />
        </Rise>
      </section>

      <section className="wrap pt-[clamp(96px,14vw,200px)]">
        <div className="grid12 gap-y-10">
          <div className="col-span-12 flex flex-col gap-4 lg:col-span-3">
            <SectionTitle>Pricing</SectionTitle>
            <Rise as="p" delay={60} className="text-base text-muted">
              Paid plans switch on with a license key in the same install
            </Rise>
          </div>
          <div className="col-span-12 grid gap-x-16 gap-y-12 md:grid-cols-2 lg:col-span-8 lg:col-start-5">
            <Rise className="flex flex-col gap-5">
              <p className="flex items-baseline justify-between gap-4 text-[22px] font-medium">
                <span>Free</span>
                <span className="tnum">$0</span>
              </p>
              <ul className="flex flex-col gap-4 text-lg">
                <li>
                  Cluster Doctor, Cluster Map and Cluster Manager
                  <span className="block text-base text-muted">Open source under Apache-2.0</span>
                </li>
                <li>
                  Up to 3 users
                  <span className="block text-base text-muted">With access by project</span>
                </li>
                <li>
                  Any AI model
                  <span className="block text-base text-muted">Or rules only, with no model at all</span>
                </li>
              </ul>
              <div className="pt-2">
                <PrimaryLink href="/install">Get Started</PrimaryLink>
              </div>
            </Rise>
            <Rise delay={90} className="flex flex-col gap-8">
              {[
                ["Pro", "For teams: unlimited users, scheduled scans and alerts, PDF reports"],
                ["Enterprise", "SSO with OIDC and LDAP, custom roles, audit log export, managed hosting"],
              ].map(([name, text]) => (
                <div key={name} className="flex flex-col gap-2">
                  <p className="flex items-baseline justify-between gap-4 text-[22px] font-medium">
                    <span>{name}</span>
                    <span className="text-lg text-muted">Coming Soon</span>
                  </p>
                  <p className="max-w-[36ch] text-base text-muted">{text}</p>
                </div>
              ))}
              <TextLink href="/pricing">Compare the plans</TextLink>
            </Rise>
          </div>
        </div>
      </section>

      <section className="wrap pb-[14svh] pt-[14svh] lg:pb-[18svh] lg:pt-[24svh]">
        <h2 className="sr-only">Get Started</h2>
        <Rise as="p" className="max-w-[34ch] text-[22px] leading-snug">
          Install it on your laptop in a few minutes, then point it at a cluster that is misbehaving.
        </Rise>
        <Rise delay={80} className="pt-6">
          <PrimaryLink href="/install">Get Started</PrimaryLink>
        </Rise>
      </section>
    </>
  );
}
