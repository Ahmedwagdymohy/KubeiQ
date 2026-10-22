# Design System

Mood: **technical, calm, human.** A faint engineering grid, one cyan accent taken from the logo,
crisp Manrope type. Confident and minimal, never "AI-generated looking".

## Brand

- Logo: `frontend/public/logo.png` (helm wheel + cube, silver and cyan). Transparent background,
  works on dark and light. Favicons: `frontend/src/app/icon.png`, `apple-icon.png`.
- Accent: logo cyan.

## Themes

Dark is the default; light follows the system or the header toggle (stored in `localStorage`
as `kubeiq-theme`, applied before paint by `src/lib/theme.ts`).

| Token | Dark | Light | Use |
|-------|------|-------|-----|
| `--bg` | `#000000` | `#ffffff` | page background |
| `--surface` | `#0a0b0c` | `#f7f9fa` | hover rows, panels |
| `--surface-2` | `#14171a` | `#eef2f4` | selected items, inputs |
| `--border` | `#3a4046` | `#cdd4da` | dividers between sections, columns, cards |
| `--text` | `#f5f7f8` | `#0b1115` | primary text |
| `--text-muted` | `#a1a9b0` | `#4b5661` | secondary text |
| `--text-subtle` | `#6b747c` | `#87929c` | captions, metadata |
| `--accent` | `#39c1db` | `#0e8fa8` | buttons, highlights (darker in light for contrast) |
| `--warning` | `#fbbf24` | `#b45309` | warnings |
| `--danger` | `#f87171` | `#dc2626` | critical issues, failures |
| `--terminal` | `#0b0e11` | `#0f1418` | command blocks (dark in both themes) |

Never hard-code colors; use the Tailwind tokens (`bg-surface`, `text-muted`, `bg-accent`, ...).

## Typography

- **Manrope for everything users read**: headings, labels, lists, progress, history.
- Labels are normal case (`text-sm font-medium text-muted`), never mono uppercase.
- **Mono (JetBrains Mono) only for things users copy or match exactly**: commands and resource refs.

## Layout patterns

- **App shell**: header (logo, Products menu, Docs, GitHub, theme toggle), hairline grid layout.
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
- Landing page feature grid: bento cells with outlined mono tags and dot pills.

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
