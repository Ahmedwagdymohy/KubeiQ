/** What Cluster Doctor recognizes, with the line it writes for each broken workload in the demo. */

const RECOGNIZES: [failure: string, workload: string, says: string][] = [
  ["CrashLoopBackOff", "payment", "Environment variable DATABASE_URL is missing"],
  ["Missing config and secrets", "billing", "Secret billing-db is missing key 'password'"],
  ["Failed init containers", "orders", "A hostname the app needs cannot be resolved (DNS)"],
  ["Pending pods", "analytics", "Pod requests 64 cpu; no node has that free"],
  ["OOMKilled", "report-worker", "Memory limit 64Mi is too low (container OOMKilled)"],
  ["Probe failures", "inventory", "Readiness probe uses port 8081; container listens on 80"],
  ["Service selectors", "checkout", "Service selector app=checkut matches no pods (pods use app=checkout)"],
  ["ImagePullBackOff", "frontend", "Image tag nginx:1.99.99-does-not-exist does not exist"],
  ["Failed jobs", "db-migrate", "Container 'migrate' is Error (exit code 3)"],
  ["Anything else", "queue-worker", "Read by the AI model you chose, then written the same way"],
];

export function RecognizeTable() {
  return (
    <table className="w-full border-collapse text-left text-base">
      <thead className="sr-only">
        <tr>
          <th>Failure</th>
          <th>Example in kubeiq-demo</th>
          <th>What Cluster Doctor says</th>
        </tr>
      </thead>
      <tbody>
        {RECOGNIZES.map(([failure, workload, says], i) => (
          <tr
            key={failure}
            className={`flex flex-col gap-1 rounded-lg px-4 py-4 sm:table-row sm:px-0 ${
              i % 2 === 0 ? "bg-surface" : ""
            }`}
          >
            <td className="font-medium sm:w-[26%] sm:rounded-l-lg sm:py-3.5 sm:pl-5">{failure}</td>
            <td className="sm:w-[18%] sm:py-3.5">
              <code className="font-mono text-[14px] text-muted">{workload}</code>
            </td>
            <td className="sm:rounded-r-lg sm:py-3.5 sm:pr-5">{says}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
