import Image from "next/image";
import Link from "next/link";

import { rise } from "@/components/ui";

type Pinned = {
  slug: string;
  name: string;
  line: string;
  dark: string;
  light: string;
  alt: string;
  place: string;
};

const PINNED: Pinned[] = [
  {
    slug: "map",
    name: "Cluster Map",
    line: "The chart of your namespace: every resource, how it connects, and what is broken",
    dark: "/screens/map-overview-dark.jpg",
    light: "/screens/map-expanded-light.jpg",
    alt: "Cluster Map showing each app and its resources, broken ones in red",
    place: "lg:left-[3%] lg:top-[9%] lg:w-[52%] lg:-rotate-2",
  },
  {
    slug: "doctor",
    name: "Cluster Doctor",
    line: "Finds why workloads fail and hands you the commands to fix them",
    dark: "/screens/doctor-incident-dark.jpg",
    light: "/screens/doctor-incident-light.jpg",
    alt: "Cluster Doctor showing a failing workload with its root cause and fix command",
    place: "lg:right-[3%] lg:top-[5%] lg:w-[38%] lg:rotate-[2.5deg]",
  },
  {
    slug: "manager",
    name: "Cluster Manager",
    line: "Every resource with its YAML, events and logs, read-only by default",
    dark: "/screens/manager-dark.jpg",
    light: "/screens/manager-light.jpg",
    alt: "Cluster Manager listing deployments with one open",
    place: "lg:right-[8%] lg:top-[53%] lg:w-[37%] lg:-rotate-[1.5deg]",
  },
];

/** The three products laid on a chart table: real screenshots pinned over an 1894 Admiralty chart. */
export function ChartTable() {
  return (
    <section data-reveal className="flex flex-col gap-14 pt-[clamp(96px,12vw,200px)]">
      <div className="frame grid gap-6 md:grid-cols-12">
        <h2 data-rise className="text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em] md:col-span-6">
          Three Instruments, One Install
        </h2>
        <p data-rise style={rise(1)} className="max-w-[46ch] text-lg leading-relaxed md:col-span-5 md:col-start-8 md:self-end">
          Every product ships in the same install and shares your clusters, users and AI settings. Each
          one leads to the others: a red node on the map opens Cluster Doctor on that workload
        </p>
      </div>
      <div className="relative overflow-hidden bg-surface lg:h-[min(78vw,1080px)]">
        <Image
          src="/found/admiralty-chart-no-2613-france-n-coast.jpg"
          alt="Admiralty Chart No 2613 of the north coast of France, published in 1894"
          fill
          sizes="100vw"
          className="drift object-cover"
        />
        <div className="relative grid gap-10 px-4 py-12 md:grid-cols-2 md:px-8 lg:static lg:block lg:p-0">
          {PINNED.map((p, i) => (
            <figure
              key={p.slug}
              data-rise
              style={rise(i)}
              className={`relative bg-bg p-2 max-lg:odd:rotate-[-1.2deg] max-lg:even:rotate-[1.2deg] md:first:col-span-2 lg:absolute ${p.place}`}
            >
              <Image src={p.dark} alt={p.alt} width={1600} height={1000} className="show-in-dark h-auto w-full" />
              <Image src={p.light} alt={p.alt} width={1600} height={1000} className="show-in-light h-auto w-full" />
              <figcaption className="flex flex-col gap-1 px-3 pb-2 pt-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
                <span className="flex flex-col gap-1">
                  <Link href={`/products/${p.slug}`} className="text-xl font-extrabold tracking-[-0.02em] hover:text-accent">
                    {p.name}
                  </Link>
                  <span className="text-base leading-snug text-muted">{p.line}</span>
                </span>
                <Link
                  href={`/products/${p.slug}`}
                  className="shrink-0 text-base font-bold text-accent underline decoration-transparent decoration-2 underline-offset-4 hover:decoration-current"
                >
                  Learn more
                </Link>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
