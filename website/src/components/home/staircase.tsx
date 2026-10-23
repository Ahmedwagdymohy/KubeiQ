const STAGES = [
  {
    line: "First it reads the cluster.",
    note: "Pods, events, logs, services and nodes, with read-only access. Secret values are never read",
    start: "md:col-start-1",
  },
  {
    line: "Then it names what broke.",
    note: "Crash loops, OOM kills, bad probes and missing config are recognized in seconds",
    start: "md:col-start-3",
  },
  {
    line: "An agent digs into the rest.",
    note: "For unclear cases, an AI agent with read-only tools checks logs, configs and neighbours",
    start: "md:col-start-4",
  },
  {
    line: "You get the fix, and the check.",
    note: "Exact commands with your real names, plus the commands that prove it worked",
    start: "md:col-start-5",
  },
];

/** How it works, written rather than counted: each stage starts further right. */
export function Staircase() {
  return (
    <section className="frame bg-surface py-32 sm:py-44" aria-labelledby="how-it-works">
      <div data-reveal="stair" className="flex flex-col gap-14 md:gap-16">
        {STAGES.map((stage, i) => (
          <div key={stage.line} className="md:grid md:grid-cols-12 md:gap-6">
            <div className={`flex flex-col gap-3 md:col-span-8 ${stage.start}`}>
              {i === 0 ? (
                <h2 id="how-it-works" className="t-title">
                  {stage.line}
                </h2>
              ) : (
                <p className={`t-title ${i === STAGES.length - 1 ? "text-accent" : ""}`}>
                  {stage.line}
                </p>
              )}
              <p className="max-w-[40ch] text-[17px] text-muted">{stage.note}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
