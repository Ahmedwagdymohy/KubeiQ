import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

import { CommandBlock } from "@/components/command-block";
import { INSTALL_COMMAND } from "@/lib/site";

export type Shot = { dark: string; light?: string; alt: string };

export function Screenshot({ shot, className = "" }: { shot: Shot; className?: string }) {
  const cls = `h-full w-full object-cover object-left-top ${className}`;
  return shot.light ? (
    <>
      <Image
        src={shot.dark}
        alt={shot.alt}
        width={1440}
        height={900}
        className={`show-in-dark ${cls}`}
        priority
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
    <Image src={shot.dark} alt={shot.alt} width={1440} height={900} className={cls} priority />
  );
}

/**
 * One layout for every product page: the name on the page axis, the product full-bleed, what it
 * does as a column of statements, one detail on a colour field, then the install band.
 */
export function ProductPage({
  name,
  standfirst,
  hero,
  features,
  detail,
  extra,
  sibling,
  video,
  strip,
}: {
  name: string;
  standfirst: string;
  hero: Shot;
  features: { title: string; description: string }[];
  detail: { title: string; text: string; shot: Shot };
  extra?: ReactNode;
  sibling: { href: string; label: string };
  video?: { src: string; poster: string };
  strip: [Shot, Shot];
}) {
  const [first, ...rest] = name.split(" ");
  return (
    <>
      <section className="frame flex flex-col gap-10 pb-16 pt-16 lg:flex-row-reverse lg:items-end lg:justify-between md:pb-20 md:pt-28">
        <div className="flex flex-col gap-8 lg:w-[calc(58vw-var(--m))]">
          <h1 className="t-display">
            <span className="mask-line">
              <span>{first}</span>
            </span>
            <span className="mask-line">
              <span>{rest.join(" ")}</span>
            </span>
          </h1>
          <div className="after-mask flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link
              href="/install"
              className="rounded-md bg-primary px-7 py-4 font-semibold text-primary-ink transition-transform hover:-translate-y-0.5 active:translate-y-0"
            >
              Install KubeiQ
            </Link>
            <Link
              href={sibling.href}
              className="font-medium underline decoration-2 underline-offset-[6px] transition-colors hover:text-accent"
            >
              {sibling.label}
            </Link>
          </div>
        </div>
        <p className="after-mask max-w-[34ch] text-[17px] text-fg">{standfirst}</p>
      </section>

      <div className="relative h-[56svh] min-h-80 overflow-hidden md:h-[78svh]">
        {video ? (
          <video
            src={video.src}
            poster={video.poster}
            autoPlay
            muted
            loop
            playsInline
            aria-label={hero.alt}
            className="h-full w-full object-cover object-left-top"
          />
        ) : (
          <Screenshot shot={hero} className="drift" />
        )}
      </div>

      <section className="frame py-32 sm:py-44" aria-labelledby="what-it-does">
        <div data-reveal className="flex flex-col gap-14 lg:ml-[var(--axis)]">
          <h2 id="what-it-does" className="t-title">
            What It Does
          </h2>
          {features.map((f) => (
            <div key={f.title} className="flex max-w-[52ch] flex-col gap-3">
              <h3 className="t-statement font-medium">{f.title}</h3>
              <p className="text-[17px] text-muted">{f.description}</p>
            </div>
          ))}
        </div>
      </section>

      {extra}

      <section className="grid bg-field text-field-ink lg:grid-cols-12">
        <div
          data-reveal
          className="flex flex-col justify-center gap-6 p-8 py-20 sm:p-12 lg:col-span-5"
        >
          <h2 className="t-title">{detail.title}</h2>
          <p className="max-w-[40ch] text-[17px]">{detail.text}</p>
        </div>
        <div className="relative h-[52svh] min-h-72 overflow-hidden lg:col-span-7 lg:h-[86svh]">
          <Screenshot shot={detail.shot} className="drift" />
        </div>
      </section>

      <div className="grid md:grid-cols-2">
        {strip.map((shot) => (
          <div key={shot.dark} className="relative h-[34svh] overflow-hidden md:h-[48svh]">
            <Screenshot shot={shot} className="drift" />
          </div>
        ))}
      </div>

      <section
        className="frame bg-terminal py-24 text-terminal-fg sm:py-32"
        aria-labelledby="included"
      >
        <div data-reveal className="grid gap-12 lg:grid-cols-12 lg:items-end">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-5">
            <h2 id="included" className="t-title">
              Included in Every Install
            </h2>
            <p className="text-[17px] text-terminal-fg/70">
              Install KubeiQ once and {name} is ready in the app, next to every other tool
            </p>
          </div>
          <div className="min-w-0 lg:col-span-7">
            <CommandBlock commands={[INSTALL_COMMAND]} />
          </div>
        </div>
      </section>
    </>
  );
}
