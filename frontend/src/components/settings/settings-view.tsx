import { AboutSection } from "@/components/settings/about-section";
import { AISection } from "@/components/settings/ai-section";
import { ClustersSection } from "@/components/settings/clusters-section";

const NAV = [
  ["ai", "AI Model"],
  ["clusters", "Clusters"],
  ["about", "About"],
] as const;

export function SettingsView() {
  return (
    <main className="mx-auto grid w-full max-w-[1680px] flex-1 grid-cols-[minmax(0,1fr)] gap-px border-x border-border bg-border lg:grid-cols-[240px_minmax(0,1fr)]">
      <nav className="hidden flex-col gap-1 bg-bg p-6 lg:flex">
        <h1 className="mb-3 text-base font-semibold">Settings</h1>
        {NAV.map(([id, label]) => (
          <a
            key={id}
            href={`#${id}`}
            className="rounded-md px-3 py-2 text-sm text-muted transition-colors hover:bg-surface hover:text-fg"
          >
            {label}
          </a>
        ))}
      </nav>
      <div className="flex min-w-0 flex-col gap-px">
        <AISection />
        <ClustersSection />
        <AboutSection />
        <div className="flex-1 bg-bg" />
      </div>
    </main>
  );
}
