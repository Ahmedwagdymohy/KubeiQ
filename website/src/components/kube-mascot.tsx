"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Kube: a pixel cube (logo cyan) wearing a doctor's head mirror. It walks along the top edge of
 * its parent, stops, blinks, hops on hover and talks when clicked. Still when the user prefers
 * reduced motion. Place it inside a `relative` element; it stands on that element's top edge.
 */

const PX = 6; // screen pixels per sprite pixel
const COLS = 14;
const SPRITE_W = COLS * PX;
const SPEED = 34; // px per second

const COLORS: Record<string, string> = {
  M: "#c9d1d6", // head mirror
  W: "#ffffff", // mirror shine
  S: "#8d989f", // head band
  L: "#7fdcec", // top face
  C: "#39c1db", // front face
  D: "#1f8ea3", // side and feet
  E: "#03161b", // eyes and mouth
};

const HEAD = [
  "...MM.........",
  "..MWMM........",
  "..MMMM........",
  ".SSSSSSSSSSSS.",
  ".LLLLLLLLLLDD.",
  ".CCCCCCCCCCDD.",
  ".CCCEECCEECDD.", // eyes (row 6 closes on blink)
  ".CCCEECCEECDD.",
  ".CCCCCCCCCCDD.",
  ".CCCCCCCCCCDD.", // mouth row when talking
  ".CCCCCCCCCCDD.",
];

const LEGS = {
  stand: ["...DD...DD....", "...DD...DD...."],
  left: ["...DD...DD....", "........DD...."],
  right: ["...DD...DD....", "...DD........."],
};

const LINES = [
  "All pods healthy",
  "0 restarts today",
  "Who touched the ConfigMap?",
  "kubectl get pods",
  "I read logs for fun",
  "CrashLoopBackOff? Not today",
  "Read-only by default",
];

type Legs = keyof typeof LEGS;

function rows(legs: Legs, blink: boolean, talking: boolean): string[] {
  const head = HEAD.map((row, y) => {
    if (y === 6 && blink) return row.replaceAll("E", "C");
    if (y === 9 && talking) return ".CCCCCEECCCDD.";
    return row;
  });
  return [...head, ...LEGS[legs]];
}

function Sprite({ legs, blink, talking }: { legs: Legs; blink: boolean; talking: boolean }) {
  const grid = rows(legs, blink, talking);
  return (
    <svg
      width={SPRITE_W}
      height={grid.length * PX}
      viewBox={`0 0 ${COLS} ${grid.length}`}
      shapeRendering="crispEdges"
      aria-hidden
    >
      {grid.flatMap((row, y) =>
        [...row].map((cell, x) =>
          cell === "." ? null : (
            <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill={COLORS[cell]} />
          ),
        ),
      )}
    </svg>
  );
}

export function KubeMascot() {
  const track = useRef<HTMLDivElement>(null);
  const body = useRef<HTMLButtonElement>(null);
  const talkingRef = useRef(false);
  const [legs, setLegs] = useState<Legs>("stand");
  const [dir, setDir] = useState<1 | -1>(1);
  const [blink, setBlink] = useState(false);
  const [line, setLine] = useState<string | null>(null);
  const [hop, setHop] = useState(0);
  const next = useRef(0);

  useEffect(() => {
    const el = track.current;
    const sprite = body.current;
    if (!el || !sprite) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let width = el.clientWidth;
    const resize = new ResizeObserver(() => (width = el.clientWidth));
    resize.observe(el);

    let x = Math.max(0, (width - SPRITE_W) / 2);
    let facing: 1 | -1 = 1;
    let walking = false;
    let until = performance.now() + 1200;
    let last = performance.now();
    let lastStep = 0;
    let step = false;
    let frame = 0;
    const place = () => (sprite.style.transform = `translateX(${x}px)`);
    place();
    sprite.style.visibility = "visible";
    if (reduce) return () => resize.disconnect();

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (talkingRef.current && walking) {
        walking = false;
        setLegs("stand");
      } else if (!talkingRef.current && now > until) {
        walking = !walking;
        until = now + (walking ? 2500 + Math.random() * 4000 : 1200 + Math.random() * 2600);
        if (walking && Math.random() < 0.4) {
          facing = facing === 1 ? -1 : 1;
          setDir(facing);
        }
        if (!walking) setLegs("stand");
      }
      if (walking) {
        const max = Math.max(0, width - SPRITE_W);
        x += facing * SPEED * dt;
        if (x <= 0 || x >= max) {
          x = Math.min(max, Math.max(0, x));
          facing = facing === 1 ? -1 : 1;
          setDir(facing);
        }
        if (now - lastStep > 170) {
          lastStep = now;
          step = !step;
          setLegs(step ? "left" : "right");
        }
        place();
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    let blinkTimer: ReturnType<typeof setTimeout>;
    const scheduleBlink = () => {
      blinkTimer = setTimeout(() => {
        setBlink(true);
        setTimeout(() => setBlink(false), 140);
        scheduleBlink();
      }, 2500 + Math.random() * 3000);
    };
    scheduleBlink();

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(blinkTimer);
      resize.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!line) return;
    const timer = setTimeout(() => {
      setLine(null);
      talkingRef.current = false;
    }, 2600);
    return () => clearTimeout(timer);
  }, [line]);

  const talk = () => {
    talkingRef.current = true;
    setLine(LINES[next.current % LINES.length]);
    next.current += 1;
    setHop((h) => h + 1);
  };

  return (
    <div ref={track} className="pointer-events-none absolute inset-x-0 bottom-full h-0">
      <button
        ref={body}
        type="button"
        onClick={talk}
        onMouseEnter={() => setHop((h) => h + 1)}
        aria-label="Say hi to Kube"
        className="pointer-events-auto invisible absolute bottom-0 left-0 cursor-pointer outline-none"
      >
        {line && (
          <span
            role="status"
            className="absolute bottom-full left-1/2 mb-2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-surface px-2.5 py-1 text-xs text-fg shadow-lg shadow-black/20"
          >
            {line}
          </span>
        )}
        <span key={hop} className={`block ${hop ? "kube-hop" : ""}`}>
          <span className="block" style={{ transform: `scaleX(${dir})` }}>
            <Sprite legs={legs} blink={blink} talking={line !== null} />
          </span>
        </span>
      </button>
    </div>
  );
}
