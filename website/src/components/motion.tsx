"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/**
 * One small motion runtime for the whole site:
 * - `[data-reveal]` sections get `.is-in` once they enter the screen, which lets their `[data-rise]`
 *   parts rise in and their `.shutter` picture open (CSS in globals.css);
 * - `[data-turn]` elements rotate with the scroll, by `data-turn` degrees per screen scrolled.
 * Content is only hidden while `.js` is set, and reduced motion skips the travel entirely.
 */
export function Motion() {
  const pathname = usePathname();

  useEffect(() => {
    const targets = document.querySelectorAll<HTMLElement>("[data-reveal]");
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-in");
            io.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px", threshold: 0.08 },
    );
    targets.forEach((el) => io.observe(el));

    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turners = Array.from(document.querySelectorAll<HTMLElement>("[data-turn]"));
    let frame = 0;
    const turn = () => {
      frame = 0;
      const screens = window.scrollY / window.innerHeight;
      for (const el of turners) {
        const perScreen = Number(el.dataset.turn) || 90;
        el.style.transform = `rotate(${screens * perScreen}deg)`;
      }
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(turn);
    };
    if (!reduce && turners.length) {
      turn();
      window.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [pathname]);

  return null;
}
