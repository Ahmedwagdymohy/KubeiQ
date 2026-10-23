import { INCIDENTS } from "@/lib/incidents";

const GROUPS = [
  { title: "Found by the rules, in seconds", foundBy: "rules" as const },
  { title: "Found by the agent, with your model", foundBy: "agent" as const },
];

/** Proof by specifics: every failure in our demo cluster and the line KubeiQ wrote for it. */
export function FindsTable() {
  return (
    <section className="frame py-32 sm:py-44">
      <div data-reveal className="flex flex-col gap-16">
        <h2 className="t-title">
          What It
          <br />
          <span className="md:pl-[16.66%]">Finds</span>
        </h2>
        <div className="flex flex-col gap-14">
          {GROUPS.map((group) => (
            <div key={group.foundBy} className="flex flex-col gap-4">
              <h3 className="t-statement font-medium">{group.title}</h3>
              <table className="w-full border-collapse text-left text-[16px]">
                <thead className="sr-only md:not-sr-only">
                  <tr className="text-sm text-muted">
                    <th className="px-4 pb-3 font-normal md:w-[17%]">Workload</th>
                    <th className="px-4 pb-3 font-normal md:w-[25%]">What you see</th>
                    <th className="px-4 pb-3 font-normal">What KubeiQ tells you</th>
                    <th className="px-4 pb-3 text-right font-normal">Sure</th>
                  </tr>
                </thead>
                <tbody>
                  {INCIDENTS.filter((i) => i.foundBy === group.foundBy).map((incident) => (
                    <tr
                      key={incident.workload}
                      className="flex flex-col gap-1 px-4 py-4 odd:bg-surface md:table-row md:p-0"
                    >
                      <td className="font-semibold md:px-4 md:py-4">{incident.workload}</td>
                      <td className="text-muted md:px-4 md:py-4">{incident.symptom}</td>
                      <td className="md:px-4 md:py-4">{incident.rootCause}</td>
                      <td className="text-muted md:px-4 md:py-4 md:text-right">
                        {incident.confidence}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
