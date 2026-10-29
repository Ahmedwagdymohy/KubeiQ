# 02. Cluster Management

The Clusters screen is where teams first judge KubeiQ. It must be clear what is connected, whether
it works, and how to fix it.

## Today

- Settings › Clusters lists sources (server kubeconfig, added kubeconfigs, GKE projects) with the
  clusters inside each.
- Connecting: the one-command connect with a one-time code, pasting a kubeconfig, GKE identity with
  Check Access, Fix for gcloud/aws/az contexts, Hide, a project switch per cluster
  (feat/one-step-connect, ADR 0014).

## Requirements

### The list: one row per cluster

Group by **cluster**, not by where it came from. Each row:

- **MUST** show: name, connection method (kubeconfig, token, Google Cloud, agent), default namespace,
  labels (below), status (Testing, Connected, No access, Unreachable, Not checked) with the reason on
  hover and under the row when broken, and when it was added.
- **MUST** offer row actions: Test, Edit, Fix (when broken), Hide or Remove. Remove asks first and
  names what goes away.
- **MUST** offer Test All and Add Cluster in the header, with a count ("Connected Clusters 4").
- **MUST** test all clusters when the screen opens, without blocking the page.
- **MUST** have a helpful empty state: "No clusters yet" with the one command to connect the first.

### Labels and environments

- **MUST** let each cluster carry labels with colours. Presets: production (red), staging (amber),
  development (blue), testing, monitoring, internal, external, critical, legacy. Custom labels with a
  small colour palette, up to 10 per cluster.
- Labels appear on the row, in the cluster switcher and on the dashboard (04), and filter both.
- **SHOULD** treat "production" specially: changes on a production cluster ask for the cluster name
  to be typed (extends ADR 0009).

### Add and edit: one dialog with tabs

1. **General:** name, labels, default namespace, project (ADR 0012).
2. **Connection:** method cards.
   - **Command** (recommended): the one-command connect with live result (ADR 0014).
   - **Kubeconfig:** paste or upload, choose the context.
   - **Token:** API server URL, bearer token, CA (no "skip TLS verification" in production
     builds; a CA bundle instead).
   - **Google Cloud:** project, Check Access (exists).
   - **Agent:** install command with a one-time code and live status (docs/agent.md).
   - Every method has **Test connection** before saving, which also checks read access.
   - Editing never shows stored secrets; it says "configured" and offers Replace.
3. **Usage:** metrics-server on or off, CPU and memory warning and critical thresholds (defaults 60%
   and 80%) with a live colour preview. Thresholds colour every usage bar for this cluster.
4. **Alerts:** which notification channels this cluster sends to, and for which events (08).

### The agent

- **MUST** follow docs/agent.md: one-time code, outbound WebSocket, read-only ServiceAccount.
- **MUST** show the agent's live state (connected, last seen, version) and offer **Regenerate
  token**, warning that the running agent disconnects until it is reinstalled with the new one.

## Do better than the reference

- No "skip TLS verification" switch as the easy path; CA bundles instead.
- Health includes read access, not only "the API answered" (a cluster that answers `/version` but
  refuses KubeiQ is not "Connected").
- Errors say what to do (address, cause, fix command), never a raw stack or HTML page.

## Tier

Core: everything here. The plan's cluster limit (ADR 0012) applies; a license raises it.

## Done when

- A cluster can be added by each method, tested, labeled, edited and removed from one screen.
- Every failure mode we have met (unreachable, private endpoint, gcloud login, no RBAC, wrong CA)
  shows a specific reason and a fix.
- Test All on 10 clusters finishes without freezing the page; slow clusters show "Testing".
