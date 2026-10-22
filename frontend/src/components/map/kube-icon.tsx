import type { CSSProperties } from "react";

/** Kubernetes community icons (CC BY 4.0), as used by Headlamp. Coloured with currentColor. */
const ICONS: Record<string, string> = {
  Pod: "pod",
  Deployment: "deploy",
  ReplicaSet: "rs",
  StatefulSet: "sts",
  DaemonSet: "ds",
  Job: "job",
  CronJob: "cronjob",
  Service: "svc",
  Ingress: "ing",
  ConfigMap: "cm",
  Secret: "secret",
  PersistentVolumeClaim: "pvc",
  HorizontalPodAutoscaler: "hpa",
  Namespace: "ns",
};

export function KubeIcon({ kind, size = 32, className = "" }: { kind: string; size?: number; className?: string }) {
  const url = `url(/k8s-icons/${ICONS[kind] ?? "pod"}.svg)`;
  const style: CSSProperties = {
    width: size,
    height: size,
    maskImage: url,
    WebkitMaskImage: url,
    maskSize: "contain",
    WebkitMaskSize: "contain",
    maskRepeat: "no-repeat",
    WebkitMaskRepeat: "no-repeat",
    maskPosition: "center",
    backgroundColor: "currentColor",
  };
  return <span aria-hidden className={`inline-block shrink-0 ${className}`} style={style} />;
}

/** Short, readable kind names for small labels. */
export function kindLabel(kind: string): string {
  return (
    {
      PersistentVolumeClaim: "Volume Claim",
      HorizontalPodAutoscaler: "Autoscaler",
    } as Record<string, string>
  )[kind] ?? kind;
}
