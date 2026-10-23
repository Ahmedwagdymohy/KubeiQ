"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";

/** The signature move: the three products' real screens crossfade slowly, one at a time. */

const SHOTS = [
  {
    slug: "doctor",
    name: "Cluster Doctor",
    line: "The root cause in one line and the commands to fix it",
    light: "/screens/doctor-incident-light.png",
    dark: "/screens/doctor-incident-dark.png",
    alt: "Cluster Doctor with report-worker open: memory limit 64Mi is too low, and the fix command",
    w: 2576,
    h: 1528,
  },
  {
    slug: "map",
    name: "Cluster Map",
    line: "Every app and what is behind it, broken parts in red",
    light: "/screens/map-expanded-light.png",
    dark: "/screens/map-overview-dark.png",
    alt: "Cluster Map of kubeiq-demo with billing, payment and analytics in red",
    w: 1600,
    h: 936,
  },
  {
    slug: "manager",
    name: "Cluster Manager",
    line: "Every resource, its YAML, events and logs",
    light: "/screens/manager-light.png",
    dark: "/screens/manager-dark.png",
    alt: "Cluster Manager listing deployments with one deployment open",
    w: 1600,
    h: 1000,
  },
];

const HOLD_MS = 6000;

export function ProductReel() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || paused) return;
    const timer = setInterval(() => {
      if (!document.hidden) setIndex((i) => (i + 1) % SHOTS.length);
    }, HOLD_MS);
    return () => clearInterval(timer);
  }, [paused, index]);

  return (
    <div className="grid gap-8 lg:grid-cols-12 lg:gap-8">
      <ul className="flex flex-col gap-2 lg:col-span-3">
        {SHOTS.map((s, i) => (
          <li key={s.slug} className="rise" style={{ "--d": `${i * 80}ms` } as React.CSSProperties}>
            <button
              type="button"
              onClick={() => {
                setIndex(i);
                setPaused(true);
              }}
              aria-pressed={i === index}
              className="group flex w-full flex-col gap-1 py-3 text-left"
            >
              <span
                className={`w-fit border-b-2 pb-1 text-lg font-medium transition-colors ${
                  i === index ? "border-accent text-fg" : "border-transparent text-muted group-hover:text-fg"
                }`}
              >
                {s.name}
              </span>
              <span className="text-base text-muted">{s.line}</span>
            </button>
            <Link
              href={`/products/${s.slug}`}
              className="text-base font-medium text-fg transition-colors hover:text-accent"
            >
              About {s.name} →
            </Link>
          </li>
        ))}
      </ul>
      <div className="rise relative overflow-hidden rounded-xl bg-surface lg:col-span-9">
        {SHOTS.map((s, i) => (
          <div
            key={s.slug}
            className={`fade-shot ${i === index ? "on" : ""} ${i === 0 ? "relative" : "absolute inset-0"}`}
            aria-hidden={i !== index}
          >
            <div className="aspect-[16/10] overflow-hidden">
              <Image
                src={s.light}
                alt={s.alt}
                width={s.w}
                height={s.h}
                className="show-in-light h-full w-full object-cover object-left-top"
              />
              <Image
                src={s.dark}
                alt={s.alt}
                width={s.w}
                height={s.h}
                className="show-in-dark h-full w-full object-cover object-left-top"
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
