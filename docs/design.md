# Design System

Mood: **technical, calm, human.** The app is styled as a **Console**: an operations screen read in
long sessions. True neutral darks, quiet 1px lines, crisp Manrope type and one cyan accent taken
from the logo. Confident and minimal, never "AI-generated looking".

The one move: **every selection is the same 1px cyan line** (the active rail item, a tab, the
selected row, the open incident, the active settings area). Colour otherwise goes on data
(workload health, severity), never on chrome. Filled buttons are the inverted primary (white on
dark, near-black on light), one per screen.

## Brand

- Logo: `frontend/public/logo.png` (helm wheel + cube, silver and cyan). Transparent background,
  works on dark and light. Favicons: `frontend/src/app/icon.png`, `apple-icon.png`.
- Accent: logo cyan.

## Themes

Dark is the default; light follows the system or the header toggle (stored in `localStorage`
as `kubeiq-theme`, applied before paint by `src/lib/theme.ts`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg` | `#000000` | `#ffffff` | page and panel background |
| `--surface` | `#0b0c0d` | `#f6f8f9` | hover rows |
| `--surface-2` | `#15171a` | `#eceff1` | selected items, skeletons |
| `--border` | `#1f2326` | `#e3e7ea` | panel edges and row rules (a whisper) |
| `--control` | `#353b40` | `#cdd4da` | input, select and outlined button borders |
| `--text` | `#f5f7f8` | `#0b1115` | primary text |
| `--text-muted` | `#b3b9be` | `#4b5661` | secondary text |
| `--text-subtle` | `#8b939a` | `#66707a` | captions, metadata (still 4.5:1) |
| `--accent` | `#39c1db` | `#0e8fa8` | the 1px selection line, healthy data |
| `--primary` | `#f5f7f8` | `#0b1115` | the one filled button (label in `--primary-ink`) |
| `--warning` | `#fbbf24` | `#b45309` | warnings |
| `--danger` | `#f2667a` | `#c4242a` | critical issues, failures |
| `--terminal` | `#0b0e11` | `#0f1418` | command blocks (dark in both themes) |

Never hard-code colors; use the Tailwind tokens (`bg-surface`, `text-muted`, `bg-accent`, ...).

## Typography

- **Manrope for everything users read**: headings, labels, lists, progress, history.
- Labels are normal case (`text-sm font-medium text-muted`), never mono uppercase.
- **Mono (JetBrains Mono) only for things users copy or match exactly**: commands and resource refs.

## Layout patterns

- **App shell**: a 56px icon rail on the left (logo, Overview, the products, then Docs, Settings,
  theme and account at the bottom). Icons carry a tooltip and an accessible name; the active one
  brightens and gets the 1px cyan line on the rail's edge. On phones the rail becomes a slim top
  bar (logo, theme, account) and a bottom bar of the five destinations with short labels.
- **Overview** (`/`): answers "is anything broken right now?". A noun title with the finding
  under it ("9 of 25 workloads need attention in kind-kubeiq-dev") and Investigate Cluster.
  Workload Health shows a divided figure strip and one row per namespace with **one square per
  workload** coloured by health (the product's signature element); a square opens the workload in
  Cluster Manager. Failing Now lists the broken workloads with their reason and Investigate.
  Recent Investigations and Clusters sit below. Panels: 1px border, 8px radius, no shadow.
- **Panels**: `Panel` in `ui.tsx`, a 48px title row (14px semibold title, a text action on the
  right). Loading shows flat `Skeleton` bars at the size of the value; errors stay in the block.
- **Resizable sidebar** (Cluster Doctor): drag the divider; width remembered per browser.
- **Incident list**: one row per issue — severity dot, workload name, "Kind in namespace",
  short root cause, confidence number, chevron. Click to expand: How to fix → commands →
  Check that it worked → Why it happens → Prevent it next time → Impact → Affected resources.
- **Terminal block**: dark box with no window chrome, `# Design System

Mood: **technical, calm, human.** The app is styled as a **Console**: an operations screen read in
long sessions. True neutral darks, quiet 1px lines, crisp Manrope type and one cyan accent taken
from the logo. Confident and minimal, never "AI-generated looking".

The one move: **every selection is the same 1px cyan line** (the active rail item, a tab, the
selected row, the open incident, the active settings area). Colour otherwise goes on data
(workload health, severity), never on chrome. Filled buttons are the inverted primary (white on
dark, near-black on light), one per screen.

## Brand

- Logo: `frontend/public/logo.png` (helm wheel + cube, silver and cyan). Transparent background,
  works on dark and light. Favicons: `frontend/src/app/icon.png`, `apple-icon.png`.
- Accent: logo cyan.

## Themes

Dark is the default; light follows the system or the header toggle (stored in `localStorage`
as `kubeiq-theme`, applied before paint by `src/lib/theme.ts`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg` | `#000000` | `#ffffff` | page and panel background |
| `--surface` | `#0b0c0d` | `#f6f8f9` | hover rows |
| `--surface-2` | `#15171a` | `#eceff1` | selected items, skeletons |
| `--border` | `#1f2326` | `#e3e7ea` | panel edges and row rules (a whisper) |
| `--control` | `#353b40` | `#cdd4da` | input, select and outlined button borders |
| `--text` | `#f5f7f8` | `#0b1115` | primary text |
| `--text-muted` | `#b3b9be` | `#4b5661` | secondary text |
| `--text-subtle` | `#8b939a` | `#66707a` | captions, metadata (still 4.5:1) |
| `--accent` | `#39c1db` | `#0e8fa8` | the 1px selection line, healthy data |
| `--primary` | `#f5f7f8` | `#0b1115` | the one filled button (label in `--primary-ink`) |
| `--warning` | `#fbbf24` | `#b45309` | warnings |
| `--danger` | `#f2667a` | `#c4242a` | critical issues, failures |
| `--terminal` | `#0b0e11` | `#0f1418` | command blocks (dark in both themes) |

Never hard-code colors; use the Tailwind tokens (`bg-surface`, `text-muted`, `bg-accent`, ...).

## Typography

- **Manrope for everything users read**: headings, labels, lists, progress, history.
- Labels are normal case (`text-sm font-medium text-muted`), never mono uppercase.
- **Mono (JetBrains Mono) only for things users copy or match exactly**: commands and resource refs.

## Layout patterns

- **App shell**: a 56px icon rail on the left (logo, Overview, the products, then Docs, Settings,
  theme and account at the bottom). Icons carry a tooltip and an accessible name; the active one
  brightens and gets the 1px cyan line on the rail's edge. On phones the rail becomes a slim top
  bar (logo, theme, account) and a bottom bar of the five destinations with short labels.
- **Overview** (`/`): answers "is anything broken right now?". A noun title with the finding
  under it ("9 of 25 workloads need attention in kind-kubeiq-dev") and Investigate Cluster.
  Workload Health shows a divided figure strip and one row per namespace with **one square per
  workload** coloured by health (the product's signature element); a square opens the workload in
  Cluster Manager. Failing Now lists the broken workloads with their reason and Investigate.
  Recent Investigations and Clusters sit below. Panels: 1px border, 8px radius, no shadow.
- **Panels**: `Panel` in `ui.tsx`, a 48px title row (14px semibold title, a text action on the
  right). Loading shows flat `Skeleton` bars at the size of the value; errors stay in the block.
- **Resizable sidebar** (Cluster Doctor): drag the divider; width remembered per browser.
- **Incident list**: one row per issue — severity dot, workload name, "Kind in namespace",
  short root cause, confidence number, chevron. Click to expand: How to fix → commands →
  Check that it worked → Why it happens → Prevent it next time → Impact → Affected resources.
 prompt, one command per line, copy icon per line.
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
- Landing page feature grid: bento cells with outlined mono tags and dot pills.

- **Cluster Manager**: toolbar (cluster, namespace), kind sidebar grouped by category with a
  filter, a table from the server's own columns, and an object panel with Overview / YAML / Events /
  Logs tabs. Actions sit in the panel header next to Investigate and Show on map, only when the
  user may change things. Text that is not a command (YAML, logs) uses the code block, not the
  `$` terminal.
- **Dialogs** for changes: title as a question ("Restart checkout?"), one sentence on the effect,
  Cancel and the action. Deleting requires typing the name; the delete button uses `bg-danger`.
- **Settings**: one view per area (`/settings#ai`, `#clusters`, ...), the area's name as the h1.
  A side nav on desktop, a scrolling tab row on phones.
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
scan bar while investigating. No bouncing.

The website may have one playful element: **Kube**, the pixel mascot (`website/src/components/kube-mascot.tsx`),
a logo-cyan cube with a doctor's head mirror that walks on the landing page's install terminal,
hops on hover and says a short Kubernetes line when clicked. It stays still with reduced motion.
Keep it to the website; the app stays calm.
