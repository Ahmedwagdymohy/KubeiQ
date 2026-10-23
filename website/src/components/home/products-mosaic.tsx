import Image from "next/image";
import Link from "next/link";

type Shot = { dark: string; light?: string; alt: string };

const TILES: { slug: string; name: string; line: string; shot: Shot; field: string }[] = [
  {
    slug: "doctor",
    name: "Cluster Doctor",
    line: "Finds what is broken and gives you the exact commands to fix it",
    shot: {
      dark: "/screens/doctor-dark.png",
      light: "/screens/doctor-light.png",
      alt: "Cluster Doctor with the payment incident open and its fix command",
    },
    field: "bg-field text-field-ink",
  },
  {
    slug: "map",
    name: "Cluster Map",
    line: "Every resource and how it connects, broken ones in red",
    shot: {
      dark: "/screens/map-dark.png",
      alt: "Cluster Map showing the demo workloads grouped by app",
    },
    field: "bg-inverse text-inverse-ink",
  },
  {
    slug: "manager",
    name: "Cluster Manager",
    line: "Browse any resource, its YAML, events and live logs",
    shot: {
      dark: "/screens/manager-pods-dark.png",
      light: "/screens/manager-object-light.png",
      alt: "Cluster Manager listing pods with their status",
    },
    field: "bg-field text-field-ink",
  },
];

function Screenshot({ shot }: { shot: Shot }) {
  const cls = "drift h-full w-full object-cover object-left-top";
  return shot.light ? (
    <>
      <Image
        src={shot.dark}
        alt={shot.alt}
        width={1440}
        height={900}
        className={`show-in-dark ${cls}`}
      />
      <Image
        src={shot.light}
        alt={shot.alt}
        width={1440}
        height={900}
        className={`show-in-light ${cls}`}
      />
    </>
  ) : (
    <Image src={shot.dark} alt={shot.alt} width={1440} height={900} className={cls} />
  );
}

/** Three products as a gutterless mosaic: each screenshot butted against its own colour field. */
export function ProductsMosaic() {
  return (
    <section id="products" className="flex flex-col">
      <div
        data-reveal
        className="frame flex flex-col gap-6 py-32 sm:py-44 md:flex-row md:items-end md:justify-between"
      >
        <h2 className="t-title md:w-[calc(42vw-var(--m))]">
          Three Tools,
          <br />
          One Install
        </h2>
        <p className="t-statement max-w-[30ch] text-muted md:mr-auto">
          They share your clusters, your users and your AI settings. New tools arrive as updates
        </p>
      </div>
      <div className="grid md:grid-cols-3">
        {TILES.map((tile, i) => (
          <Link key={tile.slug} href={`/products/${tile.slug}`} className="group contents">
            <div
              className={`relative h-[44svh] min-h-72 overflow-hidden md:col-span-2 ${i % 2 ? "md:order-2" : ""}`}
            >
              {tile.slug === "doctor" ? (
                <video
                  src="/video/doctor-tour.mp4"
                  poster="/video/doctor-tour-poster.jpg"
                  autoPlay
                  muted
                  loop
                  playsInline
                  aria-label={tile.shot.alt}
                  className="h-full w-full object-cover object-left-top"
                />
              ) : (
                <Screenshot shot={tile.shot} />
              )}
            </div>
            <div
              className={`flex min-h-56 flex-col justify-between gap-8 p-8 transition-[padding] duration-300 group-hover:pl-11 sm:p-12 group-hover:sm:pl-16 ${tile.field} ${i % 2 ? "md:order-1" : ""}`}
            >
              <h3 className="t-statement font-semibold">{tile.name}</h3>
              <div className="flex flex-col gap-4">
                <p className="max-w-[28ch] text-[17px]">{tile.line}</p>
                <span className="font-semibold underline decoration-2 underline-offset-[6px]">
                  See {tile.name.replace("Cluster ", "")}
                </span>
              </div>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
