import { HelmWheel } from "@/components/helm-wheel";

/** The mark (the helm wheel from the logo, in ink with a cyan cube) and the name. */
export function Logo() {
  return (
    <span className="flex items-center gap-2.5 text-xl font-bold tracking-tight">
      <HelmWheel className="h-8 w-8" cubeColor="var(--accent)" />
      KubeiQ
    </span>
  );
}
