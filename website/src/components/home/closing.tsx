import Image from "next/image";
import Link from "next/link";

import { CommandBlock } from "@/components/command-block";
import { KubeMascot } from "@/components/kube-mascot";
import { INSTALL_COMMAND } from "@/lib/site";

const STRIP = [
  {
    src: "/screens/overview-dark.png",
    alt: "KubeiQ Overview with workload health for every namespace",
  },
  { src: "/screens/doctor-light.png", alt: "Cluster Doctor in the light theme" },
  { src: "/screens/map-dark.png", alt: "Cluster Map of the demo cluster" },
];

/** Three screens butted edge to edge, then the install band where Kube walks on the command. */
export function Closing() {
  return (
    <section aria-labelledby="install" className="flex flex-col">
      <div className="grid grid-cols-2 md:grid-cols-3">
        {STRIP.map((shot, i) => (
          <div
            key={shot.src}
            className={`relative h-[30svh] overflow-hidden md:h-[40svh] ${i === 0 ? "col-span-2 md:col-span-1" : ""}`}
          >
            <Image
              src={shot.src}
              alt={shot.alt}
              width={1440}
              height={900}
              className="drift h-full w-full object-cover object-left-top"
              style={{ animationDelay: `${i * -6}s` }}
            />
          </div>
        ))}
      </div>
      <div className="frame bg-terminal py-24 text-terminal-fg sm:py-32">
        <div className="grid gap-16 lg:grid-cols-12 lg:items-end">
          <div className="flex min-w-0 flex-col gap-8 lg:col-span-5">
            <h2 id="install" className="t-title">
              Running in Minutes
            </h2>
            <p className="t-statement max-w-[28ch]">
              One command installs every tool on your own servers.{" "}
              <Link
                href="/install"
                className="underline decoration-4 underline-offset-[6px] transition-colors hover:text-field"
              >
                Read the install guide
              </Link>
            </p>
            <p className="text-[16px] text-terminal-fg/65">
              You need Docker and a kubeconfig. KubeiQ is read-only by default and never reads
              secret values
            </p>
          </div>
          <div className="relative mt-16 min-w-0 lg:col-span-7 lg:mt-0">
            <KubeMascot />
            <CommandBlock commands={[INSTALL_COMMAND]} />
          </div>
        </div>
      </div>
    </section>
  );
}
