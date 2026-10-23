import Image from "next/image";
import type { ReactNode } from "react";

import { rise } from "@/components/ui";

const h2 = "text-[clamp(34px,4vw,60px)] font-extrabold leading-[0.98] tracking-[-0.035em]";

/** A product screenshot in both themes (dark and light captures of the real app). */
export function Screen({
  dark,
  light,
  alt,
  priority = false,
  sizes = "(min-width: 768px) 50vw, 100vw",
}: {
  dark: string;
  light?: string;
  alt: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!light) return <Image src={dark} alt={alt} width={1600} height={1000} priority={priority} sizes={sizes} className="h-auto w-full" />;
  return (
    <>
      <Image src={dark} alt={alt} width={1600} height={1000} priority={priority} sizes={sizes} className="show-in-dark h-auto w-full" />
      <Image src={light} alt={alt} width={1600} height={1000} sizes={sizes} className="show-in-light h-auto w-full" />
    </>
  );
}

/** Features as rows of type: a large name on the left, what it does on the right. */
export function FeatureRows({ title, intro, rows }: { title: string; intro: string; rows: { title: string; text: string }[] }) {
  return (
    <section data-reveal className="frame flex flex-col gap-14 pt-[clamp(96px,12vw,200px)]">
      <div className="grid gap-5 md:grid-cols-12">
        <h2 data-rise className={`${h2} md:col-span-6`}>
          {title}
        </h2>
        <p data-rise style={rise(1)} className="max-w-[46ch] text-lg leading-relaxed md:col-span-5 md:col-start-8 md:self-end">
          {intro}
        </p>
      </div>
      <dl className="flex flex-col">
        {rows.map((row, i) => (
          <div
            key={row.title}
            data-rise
            style={rise(i + 2)}
            className={`bleed grid gap-3 py-8 md:grid-cols-12 md:gap-6 md:py-10 ${i % 2 === 0 ? "bg-surface" : ""}`}
          >
            <dt className="text-[clamp(26px,2.4vw,38px)] font-extrabold leading-[1.05] tracking-[-0.03em] md:col-span-6">
              {row.title}
            </dt>
            <dd className="max-w-[46ch] text-lg leading-relaxed md:col-span-5 md:col-start-8">{row.text}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** A heading and its text on one side, a large picture on the other. */
export function Split({
  title,
  children,
  picture,
  flip = false,
}: {
  title: string;
  children: ReactNode;
  picture: ReactNode;
  flip?: boolean;
}) {
  return (
    <section data-reveal className="frame grid items-center gap-10 pt-[clamp(96px,12vw,200px)] md:grid-cols-12 md:gap-6">
      <div className={`flex flex-col gap-5 md:col-span-4 ${flip ? "md:order-2 md:col-start-9" : ""}`}>
        <h2 data-rise className={h2}>
          {title}
        </h2>
        <div data-rise style={rise(1)} className="flex max-w-[44ch] flex-col gap-4 text-lg leading-relaxed">
          {children}
        </div>
      </div>
      <div data-rise style={rise(2)} className={`md:col-span-8 ${flip ? "md:order-1 md:col-start-1" : "md:col-start-5"}`}>
        {picture}
      </div>
    </section>
  );
}
