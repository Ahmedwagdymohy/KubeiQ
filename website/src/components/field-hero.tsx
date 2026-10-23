import type { ReactNode } from "react";

import { HelmWheel } from "@/components/helm-wheel";
import { Action, rise } from "@/components/ui";

/**
 * The poster hero used on every page: a cyan field over the top of the screen, a band of the page
 * ground under it, and one picture stuck across the seam. The big helm wheel from the logo turns
 * behind the picture as the page scrolls.
 */
export function FieldHero({
  lines,
  sentence,
  action = { href: "/install", label: "Get Started" },
  figure,
  shape = "arch",
  size = "shout",
  stack = false,
  children,
}: {
  lines: string[];
  sentence: ReactNode;
  action?: { href: string; label: string } | null;
  figure: ReactNode;
  shape?: "arch" | "screen";
  size?: "shout" | "title";
  /** Keep the band's parts stacked at every width (for a wide command block). */
  stack?: boolean;
  children?: ReactNode;
}) {
  const arch = shape === "arch";
  return (
    <section data-reveal className="relative overflow-hidden">
      <div className="relative min-h-[calc(78svh_-_64px)] bg-field text-field-ink md:min-h-[calc(82svh_-_64px)]">
        <div
          aria-hidden
          className={`pointer-events-none absolute aspect-square ${
            arch
              ? "-right-[46vw] top-[18svh] w-[118vw] md:-right-[6vw] md:-top-[16svh] md:w-[min(64vw,1060px)]"
              : "-right-[40vw] top-[10svh] w-[110vw] md:-right-[10vw] md:-top-[30svh] md:w-[min(58vw,960px)]"
          }`}
        >
          <div data-turn="70" className="h-full w-full will-change-transform">
            <HelmWheel className="h-full w-full text-field-deep" cubeColor="var(--field)" />
          </div>
        </div>
        <div className="frame relative pt-[11svh] md:pt-[13svh]">
          <h1
            className={`shout ${
              size === "shout"
                ? "text-[19vw] md:text-[clamp(80px,12vw,190px)]"
                : "text-[15vw] md:text-[clamp(64px,9vw,150px)]"
            }`}
          >
            {lines.map((line, i) => (
              <span key={line} data-rise style={rise(i)} className="block">
                {line}
              </span>
            ))}
          </h1>
        </div>
      </div>

      <div
        className={`frame relative flex min-h-[22svh] flex-col justify-center gap-6 bg-bg py-10 md:min-h-[18svh] md:py-8 ${stack ? "" : "lg:flex-row lg:items-center lg:justify-start lg:gap-10"} ${
          arch ? "pt-16 md:pt-8" : "pt-[calc(40px_+_4vw)] md:pt-8"
        }`}
      >
        <div
          className={`absolute z-10 ${
            arch
              ? "-right-[6vw] top-[calc(40px_-_88vw)] w-[58vw] rotate-[5deg] md:right-[7vw] md:top-[calc(9svh_-_57vw)] md:w-[36vw] lg:right-[8vw] lg:top-[calc(9svh_-_46vw)] lg:w-[30vw]"
              : "right-[-12vw] top-[calc(36px_-_52vw)] w-[86vw] -rotate-[3deg] md:right-[7vw] md:top-[calc(9svh_-_27vw)] md:w-[44vw]"
          }`}
        >
          <div className={`shutter bg-surface ${arch ? "rounded-t-full" : ""}`}>{figure}</div>
        </div>
        <p
          data-rise
          style={rise(2)}
          className={`relative max-w-[40ch] text-[19px] font-medium leading-snug md:text-xl ${
            arch ? "md:max-w-[44%] lg:max-w-[34ch] xl:max-w-[40ch]" : "md:max-w-[44%] lg:max-w-[30ch] xl:max-w-[40ch]"
          }`}
        >
          {sentence}
        </p>
        {action && (
          <div data-rise style={rise(3)} className="relative">
            <Action href={action.href} className="w-full lg:w-auto">
              {action.label}
            </Action>
          </div>
        )}
        {children}
      </div>
    </section>
  );
}
