"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

/** Marks each [data-reveal] block as shown once it scrolls into view (see globals.css). */
export function RevealObserver() {
  const pathname = usePathname();
  useEffect(() => {
    const blocks = [...document.querySelectorAll<HTMLElement>("[data-reveal]:not(.shown)")];
    const show = (el: Element) => el.classList.add("shown");
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            show(entry.target);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -12% 0px" },
    );
    blocks.forEach((block) => observer.observe(block));
    // A fast jump (a link to the footer, End key) can skip the observer; anything already
    // above the bottom of the window is shown on the next scroll.
    const onScroll = () => {
      for (const block of blocks) {
        if (!block.classList.contains("shown") && block.getBoundingClientRect().top < innerHeight) {
          show(block);
        }
      }
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", onScroll);
    };
  }, [pathname]);
  return null;
}
