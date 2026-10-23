import { BearingFinder } from "@/components/bearing-finder";
import { Screen } from "@/components/blocks";
import { ChartTable } from "@/components/chart-table";
import { FailureBand } from "@/components/failure-band";
import { FieldHero } from "@/components/field-hero";
import { IncidentPlate } from "@/components/incident-plate";
import { InstallBand } from "@/components/install-band";
import { Plans } from "@/components/plans";
import { ScanStages } from "@/components/scan-stages";

export default function Home() {
  return (
    <>
      <FieldHero
        lines={["Know Why", "It Broke"]}
        shape="screen"
        sentence="KubeiQ is open source AI for Kubernetes. It finds why your workloads fail and hands you the commands to fix them"
        figure={
          <Screen
            dark="/screens/hero-overview-dark.jpg"
            light="/screens/hero-overview-light.jpg"
            alt="KubeiQ Overview: 9 failing of 25 workloads, with workload health for every namespace"
            priority
            sizes="(min-width: 768px) 44vw, 86vw"
          />
        }
      />

      <section id="bearing" data-reveal className="frame pt-[clamp(96px,12vw,200px)]">
        <BearingFinder />
      </section>

      <section data-reveal className="frame pt-[clamp(96px,12vw,200px)]">
        <ScanStages />
      </section>

      <section data-reveal className="frame pt-[clamp(96px,12vw,200px)]">
        <IncidentPlate />
      </section>

      <ChartTable />

      <FailureBand />

      <Plans />

      <InstallBand />
    </>
  );
}
