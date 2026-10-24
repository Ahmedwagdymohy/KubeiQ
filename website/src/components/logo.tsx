import { HelmWheel } from "@/components/helm-wheel";

/** The wordmark: the helm wheel from the logo, drawn in the current ink, and the name. */
export function Logo({ cubeColor = "var(--field)" }: { cubeColor?: string }) {
  return (
    <span className="flex items-center gap-2.5 text-[22px] font-extrabold tracking-[-0.03em]">
      <HelmWheel className="h-8 w-8" cubeColor={cubeColor} />
      KubeiQ
    </span>
  );
}
