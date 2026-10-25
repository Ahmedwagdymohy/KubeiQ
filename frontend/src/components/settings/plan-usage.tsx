/** Use of a plan limit, as a bar at the true ratio with both ends labelled. */
export function PlanUsage({
  used,
  max,
  plan,
  noun,
}: {
  used: number;
  max: number;
  plan: string;
  noun: [singular: string, plural: string];
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-fg">
        {used} of {max} {max === 1 ? noun[0] : noun[1]} on the {plan} plan
      </span>
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
        <span
          className={`block h-full rounded-full ${used > max ? "bg-warning" : "bg-fg"}`}
          style={{ width: `${Math.min(100, (used / Math.max(1, max)) * 100)}%` }}
        />
      </span>
      <span className="flex justify-between text-xs tabular-nums text-subtle">
        <span>0</span>
        <span>{max}</span>
      </span>
    </div>
  );
}
