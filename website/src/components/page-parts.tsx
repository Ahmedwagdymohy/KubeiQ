import type { ReactNode } from "react";

import { PrimaryLink, Rise, SectionTitle } from "@/components/ui";

/** First screen of an inner page: a two-line title, one sentence, the actions, then its picture. */
export function PageIntro({
  title,
  lead,
  actions,
  children,
}: {
  title: ReactNode;
  lead: string;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <section className="wrap pb-6 pt-[clamp(48px,10vh,112px)]">
      <div className="grid12 gap-y-8">
        <h1 className="col-span-12 text-[clamp(30px,5.4vw,82px)] font-medium leading-[1.02] tracking-[-0.035em] lg:col-span-11">
          {title}
        </h1>
        <p className="col-span-12 max-w-[46ch] text-lg leading-relaxed lg:col-span-6">{lead}</p>
        {actions && (
          <div className="col-span-12 flex flex-wrap items-center gap-x-6 gap-y-4 lg:col-span-5 lg:col-start-8 lg:justify-end lg:self-end">
            {actions}
          </div>
        )}
      </div>
      {children && <div className="pt-12">{children}</div>}
    </section>
  );
}

/** A section on the page's rhythm, with its title and an optional sentence across from it. */
export function Block({
  title,
  lead,
  children,
  id,
}: {
  title: string;
  lead?: string;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section id={id} className="wrap scroll-mt-6 pt-[clamp(88px,12vw,180px)]">
      <div className="grid12 gap-y-4 pb-12">
        <SectionTitle className="col-span-12 lg:col-span-5">{title}</SectionTitle>
        {lead && (
          <Rise
            as="p"
            delay={80}
            className="col-span-12 max-w-[48ch] text-lg leading-relaxed lg:col-span-6 lg:col-start-7"
          >
            {lead}
          </Rise>
        )}
      </div>
      {children}
    </section>
  );
}

/** Ordered points: the name in the margin, the explanation across from it. Order is the position. */
export function MarginList({ items }: { items: [name: string, text: ReactNode][] }) {
  return (
    <ol className="flex flex-col gap-8">
      {items.map(([name, text], i) => (
        <li
          key={name}
          className="rise grid gap-2 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-8"
          style={{ "--d": `${i * 70}ms` } as React.CSSProperties}
        >
          <p className="text-[22px] font-medium leading-snug">{name}</p>
          <div className="flex min-w-0 flex-col gap-4 text-lg leading-relaxed">{text}</div>
        </li>
      ))}
    </ol>
  );
}

/** The quiet close every page ends on: one sentence and one action. */
export function Close({ sentence }: { sentence: string }) {
  return (
    <section className="wrap pb-[12svh] pt-[14svh] lg:pb-[16svh] lg:pt-[22svh]">
      <h2 className="sr-only">Get Started</h2>
      <Rise as="p" className="max-w-[34ch] text-[22px] leading-snug">
        {sentence}
      </Rise>
      <Rise delay={80} className="pt-6">
        <PrimaryLink href="/install">Get Started</PrimaryLink>
      </Rise>
    </section>
  );
}
