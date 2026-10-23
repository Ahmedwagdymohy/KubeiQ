# Design System

Theme: **Helm.** "Kubernetes" is Greek for helmsman and the logo is a helm wheel around a cube, so
KubeiQ is drawn as the instrument that steers you through a storm in your cluster: bearings, charts and a
log. The nautical world is art direction only; the words stay plain and concrete.

Mood: **technical, calm, human.** One cyan accent taken from the logo, crisp Manrope type, true neutral
darks and a chart-paper light theme. Confident and minimal, never "AI-generated looking".

## Brand

- Logo: `frontend/public/logo.png` (helm wheel + cube, silver and cyan). Transparent background,
  works on dark and light. Favicons: `frontend/src/app/icon.png`, `apple-icon.png`.
- Mark in the UI: `HelmWheel` (`components/helm-wheel.tsx` in both apps), the logo's wheel drawn flat in
  the current ink with a cyan cube at the hub. Used for the rail, sign-in and the website wordmark.
- Accent: logo cyan.

## Themes

Dark is the default; light follows the system or the header toggle (stored in `localStorage`
as `kubeiq-theme`, applied before paint by `src/lib/theme.ts`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg` | `#000000` | `#f2f3f0` | page ground (light is chart paper, a cool grey, never cream) |
| `--panel` | `#0d0e0f` | `#ffffff` | cards on the ground (Overview), inputs |
| `--surface` | `#0d0e0f` | `#e8eae6` | hover rows, quiet fills |
| `--surface-2` | `#17191a` | `#dfe2dd` | selected items, the rail's active item |
| `--border` | `#2a2d30` | `#dfe2dc` | dividers, card edges |
| `--text` | `#f5f7f8` | `#0b1115` | primary text |
| `--text-muted` | `#b0b6ba` | `#3f4a52` | secondary text |
| `--text-subtle` | `#8c9398` | `#56616a` | captions, metadata (4.5:1 on the ground) |
| `--accent` | `#39c1db` | `#0a7488` | data: healthy marks, the one chart hue, links, focus |
| `--primary` | `#f5f7f8` | `#0b1115` | the one primary action per screen (ink, never the brand colour) |
| `--field` | `#39c1db` | `#39c1db` | the website's cyan colour fields; `$` prompts |
| `--inverse` | `#e9ebe7` | `#0b0d0e` | the website's opposite ground (pricing, failures band, footer) |
| `--warning` | `#fbbf24` | `#b45309` | warnings |
| `--danger` | `#f87171` | `#c62828` | critical issues, failures |
| `--terminal` | `#0c0d0e` | `#0f1213` | command blocks (dark in both themes) |

The app follows the **achromatic ledger** rule: the chrome holds no colour. Selections are ink (a
neutral pill, an ink underline), the primary button is `bg-primary`, and the cyan accent is spent on
data: healthy marks, the bearing, focus. Red and amber mean failing and warning, nothing else.

Never hard-code colors; use the Tailwind tokens (`bg-surface`, `text-muted`, `bg-accent`, ...).

## Typography

- **Manrope for everything users read**: headings, labels, lists, progress, history.
- Labels are normal case (`text-sm font-medium text-muted`), never mono uppercase.
- **Mono (JetBrains Mono) only for things users copy or match exactly**: commands and resource refs.

## Layout patterns

- **App shell, the helm rail** (`components/app-header.tsx`): a fixed 56px icon rail on the left with
  the HelmWheel mark, Overview, Cluster Doctor, Cluster Map, Cluster Manager, then Docs, GitHub, theme,
  Settings and the account at the bottom. Icons are 18px outline, labels appear as tooltips, the active
  item is a neutral pill. On a phone the rail folds into a 48px top bar. Each screen names itself in
  its own h1 (Overview, Cluster Doctor, Cluster Map, Cluster Manager, Settings).
- **Overview** (`/`) answers "is anything broken right now and what do I do?": a one-line finding under
  the title ("9 of 25 workloads are failing in kind-kubeiq-dev. Start with analytics"), the **bearing**
  (every workload as a mark on a compass ring, grouped by namespace, failing ones long and red, the count
  in the middle; each red mark links to an investigation), namespace bars, **Needs Attention** (failing
  workloads with Open and Investigate), Recent Investigations and the **Log** (latest Activity entries,
  time, who, what). Health comes from `api.map(cluster, null)` through `lib/fleet.ts`.
- **Resizable sidebar** (Cluster Doctor): drag the divider; width remembered per browser.
- **Incident list**: one row per issue — severity dot, workload name, "Kind in namespace",
  short root cause, confidence number, chevron. Click to expand: How to fix → commands →
  Check that it worked → Why it happens → Prevent it next time → Impact → Affected resources.
- **Terminal block**: dark box, `$` prompt, one command per line, copy icon per line.
  `<placeholders>` are highlighted (`text-terminal-warn`) with a "Replace the highlighted values" note.
- **Progress**: live step list while running, paced so fast scans still read as a scan; collapses
  to one line afterwards (no durations shown).
- **Healthy state**: always state what was checked ("Checked 8 pods, 3 workloads…") so the
  result is clearly real work, not a placeholder.
- **Cluster Map**: full-height canvas under a toolbar (cluster, namespace, search, Problems only,
  Expand all, counts, Live). Overview shows each app as stacked cards; clicking one focuses it.
  Kind icons are coloured by health (cyan healthy, amber warning, red broken) with no tile behind
  them; broken nodes get a red border and a badge. Details panel on the right: status, the one-line
  reason, **Investigate with Cluster Doctor**, facts, connected resources, labels.
- **Website (Helm)**: dressed as a chart room. Every page opens on a cyan poster field with a large
  Manrope 800 shout, the helm wheel turning with the scroll behind one picture stuck across the seam
  (an archival engraving on the home page, the product's screenshot on product pages). Home: the
  **bearing finder** (steer the wheel to one of nine broken workloads from a real scan and read its log
  entry: position, observed root cause, action, check), how a scan runs as a dark-to-light accordion,
  one incident as a plate with margin notes, the three products pinned on an 1894 Admiralty chart, the
  failures band, two-field pricing, the one-word Install band and a footer with the name cropped by the
  edge. Archival pictures are public domain, live in `website/public/found/` (credits in
  `credits.json`) and are credited in the footer; they show the helmsman's world, never the product.
  No eyebrows, gradients, glows, mono outside commands, or thin rules outside interface fragments.

- **Cluster Manager**: toolbar (cluster, namespace), kind sidebar grouped by category with a
  filter, a table from the server's own columns, and an object panel with Overview / YAML / Events /
  Logs tabs. Actions sit in the panel header next to Investigate and Show on map, only when the
  user may change things. Text that is not a command (YAML, logs) uses the code block, not the
  `$` terminal.
- **Dialogs** for changes: title as a question ("Restart checkout?"), one sentence on the effect,
  Cancel and the action. Deleting requires typing the name; the delete button uses `bg-danger`.
- **Sign-in**: one centered card with the logo; the hint says the admin uses the master key.
  Generated passwords are shown once in a box with a copy button and "It will not be shown again".

## Copy voice

Write like a person, not a brochure.

- Headings in Title Case, no numbering or prefixes.
- Descriptions are one short, plain sentence with no trailing period.
- No em dashes, no buzzwords, no "not X but Y" phrasing.
- Prefer concrete nouns users recognize: pods, logs, kubeconfig, commands.
- **Do not expose internals**: no "rules vs AI", no model names in results, no tool-call syntax.

## Diagnosis content

The goal: a DevOps engineer can fix the issue without asking another tool.

- **Root cause**: one short line naming the exact resource and setting
  (`ConfigMap queue-worker-config: queue.concurrency is 0 (allowed 1-64)`). No "because".
- **Fix**: short imperative steps plus exact, runnable commands with real names. Fill values from
  the cluster (an image tag already running, a request that fits a node). Placeholders only for
  values KubeiQ cannot know, named for what they hold: `<database-url>`, never `<value>`.
- **Check that it worked**: commands against the workload (`rollout status`, `get pods -l`),
  never a pod name: the fix replaces pods, and the old pod still shows the old state.
- **Confidence**: a small number, no bars.

## Motion

Subtle only in the app: 150ms color/opacity transitions, a gentle pulse on running states, the
scan bar while investigating. No entrances, no bouncing.

The website moves more, always with a `prefers-reduced-motion` fallback: section parts rise in
(`data-reveal` / `data-rise`, `components/motion.tsx`), the hero picture opens like a shutter, the helm
wheel turns with the scroll (`data-turn`), found pictures drift slowly, and the failures line runs off
both edges.

The website may have one playful element: **Kube**, the pixel mascot (`website/src/components/kube-mascot.tsx`),
a logo-cyan cube in a helmsman's cap that walks along the top of the failures band,
hops on hover and says a short Kubernetes line when clicked. It stays still with reduced motion.
Keep it to the website; the app stays calm.
