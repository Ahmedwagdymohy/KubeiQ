"use client";

import { useQuery } from "@tanstack/react-query";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { AppHeader } from "@/components/app-header";
import { ClusterPanel } from "@/components/dashboard/cluster-panel";
import { DiagnosisCard } from "@/components/dashboard/diagnosis-card";
import { HistoryList } from "@/components/dashboard/history-list";
import { ProgressTimeline } from "@/components/dashboard/progress-timeline";
import { Pill } from "@/components/ui";
import { useInvestigation } from "@/hooks/use-investigation";
import { api, type Investigation } from "@/lib/api";

export function Dashboard() {
  const clusters = useQuery({ queryKey: ["clusters"], queryFn: api.clusters });
  const [chosen, setChosen] = useState<string | null>(null);
  const [namespace, setNamespace] = useState("");
  const investigation = useInvestigation();
  const router = useRouter();
  const params = useSearchParams();
  const linkedId = params.get("id");
  const openedLink = useRef(false);

  // Open an investigation from a shared link (?id=...) once on load.
  useEffect(() => {
    if (linkedId && !openedLink.current) {
      openedLink.current = true;
      investigation.open(linkedId);
    }
  }, [linkedId, investigation]);

  // Keep the URL in sync so the current investigation can be shared.
  useEffect(() => {
    if (investigation.id && investigation.id !== linkedId) {
      router.replace(`/dashboard?id=${investigation.id}`, { scroll: false });
    }
  }, [investigation.id, linkedId, router]);

  const selected =
    chosen ??
    clusters.data?.find((c) => c.is_default)?.id ??
    clusters.data?.[0]?.id ??
    null;

  const choose = (id: string) => {
    setChosen(id);
    setNamespace("");
  };

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
      <main className="mx-auto grid w-full max-w-7xl flex-1 grid-cols-[minmax(0,1fr)] gap-px border-x border-border bg-border lg:grid-cols-[320px_minmax(0,1fr)]">
        <div className="flex min-w-0 flex-col gap-px">
          <ClusterPanel
            selected={selected}
            namespace={namespace}
            running={investigation.running}
            onSelect={choose}
            onNamespace={setNamespace}
            onInvestigate={() => selected && investigation.start(selected, namespace || null)}
          />
          <div className="flex-1 bg-bg">
            <HistoryList activeId={investigation.id} onOpen={investigation.open} />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-px">
          {investigation.error && (
            <div className="bg-bg p-6 text-sm text-danger">{investigation.error}</div>
          )}
          {investigation.id && !investigation.status && !investigation.error ? (
            <div className="bg-bg p-6 text-sm text-muted sm:p-8">Loading investigation</div>
          ) : !investigation.status && !investigation.error ? (
            <EmptyState />
          ) : (
            <>
              {investigation.status && (
                <div className="bg-bg p-6 sm:p-8">
                  <ProgressTimeline events={investigation.events} status={investigation.status} />
                </div>
              )}
              {investigation.investigation && <Results investigation={investigation.investigation} />}
            </>
          )}
        </div>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="bg-grid flex flex-1 flex-col items-center justify-center bg-bg px-6 py-24 text-center">
      <h1 className="text-3xl font-medium tracking-tight">
        <span className="text-accent">Investigate</span> a Cluster
      </h1>
      <p className="mt-4 max-w-md text-muted">
        Pick a cluster and namespace, then run an investigation. KubeiQ checks your workloads and
        explains what is wrong and how to fix it
      </p>
    </div>
  );
}

function Results({ investigation }: { investigation: Investigation }) {
  const report = investigation.report;
  if (investigation.status === "failed") {
    return (
      <div className="bg-bg p-6 sm:p-8">
        <p className="text-danger">{investigation.error}</p>
      </div>
    );
  }
  if (!report) return null;
  if (report.healthy) {
    return (
      <div className="bg-grid flex flex-col items-center bg-bg px-6 py-16 text-center">
        <Pill tone="healthy">healthy</Pill>
        <h2 className="mt-4 text-2xl font-medium">No Problems Found</h2>
        <p className="mt-2 text-muted">Every workload in scope looks healthy</p>
      </div>
    );
  }

  const byAi = report.diagnoses.filter((d) => d.source === "ai").length;
  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 bg-bg px-6 py-4 font-mono text-xs text-muted sm:px-8">
        <span className="text-fg">{report.diagnoses.length} incidents</span>
        <span>{report.diagnoses.length - byAi} by rules</span>
        <span>{byAi} by AI</span>
        <span>{report.duration_seconds}s</span>
        {report.llm_model && <span>{report.llm_model}</span>}
        {report.gaps.length > 0 && (
          <span className="text-warning">
            partial evidence: {report.gaps.map((g) => g.collector).join(", ")}
          </span>
        )}
      </div>
      <div className="grid gap-px xl:grid-cols-[repeat(2,minmax(0,1fr))]">
        {report.diagnoses.map((diagnosis) => (
          <DiagnosisCard key={diagnosis.incident_id} diagnosis={diagnosis} />
        ))}
      </div>
    </>
  );
}
