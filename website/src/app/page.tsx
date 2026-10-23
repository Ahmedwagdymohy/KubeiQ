import Image from "next/image";

import { BearingFinder } from "@/components/bearing-finder";
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
        lines={["Take the", "Helm"]}
        sentence="KubeiQ is open source AI for Kubernetes. It finds why your workloads fail and hands you the commands to fix them"
        figure={
          <Image
            src="/found/smalls-lighthouse-engraving.jpg"
            alt="Engraving of Smalls Lighthouse struck by a wave in a storm, 1870"
            width={1007}
            height={1600}
            priority
            sizes="(min-width: 768px) 30vw, 58vw"
            className="h-auto w-full"
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
