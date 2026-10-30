# Design System

Mood: technical, calm, human. One cyan accent taken from the logo, crisp Manrope type. Confident
and minimal, never "AI-generated looking".

- **The app is "Sheet"**: the chrome is one tinted frame (sidebar and top bar) and every page sits
  on a white sheet inside it.
- **The website is "Helm"**: "Kubernetes" is Greek for helmsman and the logo is a helm wheel around
  a cube, so the marketing site is dressed as a chart room. The nautical world is art direction
  only; the words stay plain and concrete.

The two share the brand: the logo cyan (`#39c1db`, darker in light text), the ink colours,
Manrope, the copy voice and the diagnosis content. Their grounds differ on purpose: the app is a
light-first working tool, the website a dark-first poster with cyan fields and a chart-paper light
theme. When the brand accent, ink or status colours change, change both `globals.css` files.

## Brand

- Logo: `frontend/public/logo.png` (helm wheel + cube, silver and cyan). Transparent background,
  works on dark and light. Favicons: `frontend/src/app/icon.png`, `apple-icon.png`.
- Website mark: `HelmWheel` (`website/src/components/helm-wheel.tsx`), the logo's wheel drawn
  flat in the current ink with a cyan cube at the hub, used in the website wordmark.
- Accent: logo cyan.

## App Themes

Light is the default; dark follows the system or the top bar toggle (stored in `localStorage`
as `kubeiq-theme`, applied before paint by `src/lib/theme.ts`). Dark is true black and neutral
greys, never navy or slate.

| Token | Light | Dark | Use |
|-------|-------|------|-----|
| `--frame` | `#edf2f4` | `#0b0c0d` | sidebar and top bar ground (blue-grey from the logo) |
| `--frame-hover` | `#e2e9ec` | `#17191b` | active nav item, hover in the frame |
| `--bg` | `#ffffff` | `#000000` | the sheet (page background) |
| `--surface` | `#f6f8f9` | `#0c0d0e` | settings panels, hover rows, notices |
| `--surface-2` | `#edf1f3` | `#17191b` | selected rows, skeleton bars |
| `--border` | `#e1e7ea` | `#212427` | sheet edge, card edges, row rules |
| `--control` | `#ccd4d9` | `#3a3f44` | input, select and outlined button borders |
| `--text` | `#0b1115` | `#f5f7f8` | primary text |
| `--text-muted` | `#47525c` | `#b4b9be` | secondary text |
| `--text-subtle` | `#5f6a75` | `#8b9298` | captions, metadata (4.5:1 on white and on the frame) |
| `--accent` | `#0b7f96` | `#39c1db` | the one filled primary button, tab underline, links |
| `--healthy` | `#0e8fa8` | `#39c1db` | healthy status (dots, the ledger bar) |
| `--warning` / `--warning-soft` | `#a8590a` / `#fdf3e2` | `#f0b43c` / `#241b0b` | degraded |
| `--danger` / `--danger-soft` | `#c4242a` / `#fdecea` | `#f2706d` / `#2a1414` | failing, destructive |
| `--terminal` | `#0f1418` | `#0b0e11` | command blocks (dark in both themes) |

Never hard-code colors; use the Tailwind tokens (`bg-frame`, `bg-surface`, `text-muted`,
`bg-accent`, `border-control`, ...).

## Typography

- **Manrope for everything users read**: headings, labels, lists, progress, history.
- Labels are normal case (`text-sm font-medium text-muted`), never mono uppercase.
- Side menus (the app sidebar, the Settings areas, Cluster Manager's kinds) use medium (500) for
  items and semibold (600) for the active one, so they read clearly on the tinted frame.
- **Mono (JetBrains Mono) only for things users copy or match exactly**: commands and resource refs.

## Layout patterns

- **App shell (framed sheet)**: one tinted frame holds a 228px labelled sidebar (logo + KubeiQ,
  Overview, Cluster Doctor, Cluster Map, Cluster Manager; Settings, Docs and the user row at the
  bottom) and a 48px top bar (breadcrumb, Search, theme toggle), with no
  rule between them. The page sits on a white sheet inset 8px from the right and bottom, 1px edge,
  16px radius, no shadow. Active nav item: a neutral grey pill. On a phone the frame disappears: a
  48px top bar with a menu button that opens the navigation as a full-screen sheet.
- **Sidebar** (`components/shell/sidebar.tsx`, groups in `lib/navigation.ts`): Pinned (up to 5),
  Products, Resources (collapsible groups with kind icons, one open at a time; a closed group holding
  the current page shows a cyan dot), then Settings, Activity, Docs and the user row. Pins show on
  hover. The collapse button beside the logo folds it to a 60px icon rail with tooltips. Pins and the
  rail are saved per user (`use-preferences`). Cluster Manager's own kind list shows when the rail is
  on, or with its "All kinds" button.
- **Cluster status bar**: a 40px row at the top of the sheet (not on Settings): the cluster switcher
  (dot, mono name; a menu with every cluster, working first, broken ones with their reason, Ctrl+N
  hints, Add a cluster), health as coloured text that links to its fix, version, nodes, namespaces,
  pods, then CPU and memory bars on the right (60% amber, 80% red). Narrow screens keep the switcher
  and health; usage hides without metrics-server, never shows zero.
- **Cluster in scope**: the switcher (`lib/scope.ts`) is the cluster every product opens on;
  picking one switches the page you are on, and is remembered per user. A `?cluster=` link still
  wins on the page it opens. Ctrl+1..9 switch with a short toast.
- **Command palette** (Ctrl+K or Search in the top bar): a centred 640px card, groups Recent,
  Objects (server search in the cluster in scope, mono names, Investigate on the row), Pages,
  Resources, Settings, Actions; arrow keys, Enter opens, Shift+Enter investigates.
- **Buttons**: one filled primary per screen, in the cyan accent. Everything else is outlined
  (`border-control`) or a text action. Tabs are 2px underlines. Cards are 8px radius, 1px edge.
- **Overview**: answers "is anything broken and what do I do?". Title row with the finding as the
  subline ("9 failing of 25 workloads in kind-kubeiq-dev") and the primary Investigate action; the
  AI-off notice; the **cluster ledger** (one row per cluster, workload health as a 100% stacked bar
  of healthy / degraded / failing with the figures, then its namespaces as thinner rows); Failing
  Workloads with their reason and an Investigate action; Recent Investigations.
- **Overview fleet**: a Cards / Ledger switch (saved per user). Cards come in four sizes as a
  segmented control (Glance, Standard, Detailed, Full), a sort select and label chips that dim the
  cards that do not match. A card: status dot, mono name (opens the large view), version and method,
  labels, health as coloured text; stats in a 4-column row; usage meters (60px label, 6px bar coloured
  by the cluster's thresholds, percent, absolute values from Detailed); trend sparklines (one 2px
  accent line on a 0-100 scale, crosshair and value on hover, "Since 03:56" while history is young,
  breaks where nothing was recorded); failing workloads with Investigate; latest warnings. Offline or
  unreadable cards show the reason and Fix in Settings, never empty numbers.
- **Settings**: one view per area (`/settings#ai`, `#clusters`, ...), an area list beside it. Each
  area is a label column (title, description, a summary such as the model in use or seats used)
  beside a grey panel with the controls.
- **Clusters** (Settings › Clusters): "Connected Clusters N" with Test All and the primary Add
  Cluster. One bordered list, a row per cluster: status dot (pulses while testing), mono name, label
  chips, "Not in a project" in amber when no project holds it; the line under it says Connected ·
  version, the method, namespace and when it was added; the reason wraps under broken rows. Row
  actions are text: Test, Fix (login contexts), Edit, Remove (token and added files) or Hide. Each row
  tests itself, so a slow cluster never holds the page. Sources (server kubeconfig, files, GKE
  projects) fold under "Where clusters come from". **Edit** is a dialog with tabs General, Connection,
  Usage; **Add** is a dialog with method cards (Command recommended, Kubeconfig, Token, Google Cloud,
  Agent planned). Labels are pills in `--label-*` colours (soft background, coloured text).
- **Add a cluster** (Welcome, and the Command card): two choices, Kubeconfig and Google Cloud.
  Kubeconfig is three steps: where it runs (GKE, EKS, AKS, minikube, kind, Other; clouds show their
  login command and what to replace), one command with the one-time code (Options: name, context,
  project, allow changes), then a live line that waits, shows why it failed, or turns into
  "<name> is connected" with Done. "Add a kubeconfig file instead" is the quiet fallback. Google
  Cloud fills in the VM's project, then Check Access lists each cluster with its state and the exact
  commands for what is missing. Connected clusters that KubeiQ reaches but cannot read are amber,
  with their fix underneath; errors wrap, never overflow. Each row ends with "In <project>" (a
  checkbox; with several projects, a link to Projects). Server kubeconfig rows add Hide, and Fix
  for contexts that log in through gcloud, aws or az (the connect command for that context, with a
  live result). Hidden clusters fold into one "2 hidden clusters · Show" line.
- **Resizable sidebar** (Cluster Doctor): drag the divider; width remembered per browser.
- **Incident list**: one row per issue — severity dot, workload name, "Kind in namespace",
  short root cause, confidence number, chevron. Click to expand: How to fix → commands →
  Check that it worked → Why it happens → Prevent it next time → Impact → Affected resources.
- **Ask KubeiQ** (Cluster Doctor results): a round cyan button with a flat sparkle at the bottom
  right opens a 460px chat card above it (full screen on a phone). The card has a header, an issue
  picker (severity dot, name; follows the issue opened last) and one thread per issue: question,
  author and time, then the answer. Empty threads offer three suggested questions. While answering,
  one live line names the check in progress ("Reading logs of pod web-1"); answers keep running
  when the card is closed, and the button pulses until they land. Commands in answers use the
  terminal block, other code the code block. Each expanded issue ends with "Ask about this issue".
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

- **Cluster Manager**: toolbar (cluster, namespace), kind sidebar grouped by category with a
  filter and an icon per kind (`manager/kind-icons.tsx`, drawn in our stroke style; the active
  kind's icon is cyan), a table from the server's own columns, and an object panel with Overview / YAML / Events /
  Logs tabs. Actions sit in the panel header next to Investigate and Show on map, only when the
  user may change things. Text that is not a command (YAML, logs) uses the code block, not the
  `$` terminal.
- **Resource tables**: the header row has the kind, "N" (or "N of M" while filtering), a Live dot
  when the watch is connected, then Columns (show, hide, reorder, compact rows, Reset) and the name
  filter. Headers sort (click again for descending, a third time to clear). Status is a pill with soft
  background (healthy, warning, danger; grey for Completed); containers are 10px squares; restarts
  amber above 0 and bold red above 10; usage is a 48px bar plus the value, or the value alone when no
  limit is set. Failing rows show Investigate on hover. Namespace cells filter on click.
- **Object panel tabs**: Overview, YAML, Events, Logs, and for pods (when changes are allowed)
  Terminal and Files. YAML is highlighted in the terminal palette (`--terminal-key`, `-string`,
  `-number`) with Edit, Copy, Download; Edit is a dark textarea, then "Review changes" shows the dry
  run as a diff (green added, red removed, unchanged runs folded to ⋯), then Apply. Logs have a
  controls row (container, lines, before last restart, Live / Resume · N new) and a tools row
  (search with "1 of 4" and arrows, Wrap, Timestamps, Copy, Download); error lines use
  `--terminal-error`, warnings `--terminal-warn`. The terminal opens on request (sessions are
  audited) in xterm with the terminal tokens.
- **Assistant**: "Assistant" with a cyan sparkle in the top bar opens a 460px panel on the right
  (full screen on a phone) for the cluster in scope: header with History and New, suggested questions
  as outlined rows when empty, the user's questions as grey bubbles on the right, answers as text
  with "Looked at: ..." above them and commands in the terminal block, one live line ("Looking for
  failing pods") while it works. `openAssistant(question)` opens it with a question (Explain).
- **Log analysis**: Analyze (sparkle, outlined) at the end of the log controls opens a bordered card
  above the logs: status pill, summary, "Lines that matter" (mono line, meaning in severity colour;
  clicking jumps to and highlights the line), root cause, numbered fix steps, the terminal block,
  watch next, Investigate this workload, and an "Ask about these logs" field.
- **Timeline** (`/timeline`): title with the warnings count in amber and Live; a filter row
  (Type and Source as segmented controls, namespace picker, search); rows with a dot (amber warning,
  cyan KubeiQ, grey normal), the reason (amber for warnings), the object in mono with its kind icon,
  ×count, a two-line message and the source; Explain and Open on hover; a 400px details panel.
- **Pod Distribution** (`/distribution`): three cards (Balance score with its verdict, Average,
  Issues), "Pods per node" bars against the largest allocatable with a 1px average marker, rows that
  expand into pod squares coloured by state, Pending pods with Investigate, node cards (a ring of pods
  against allocatable, counts, CPU and memory bars, taints in mono), Scale-down candidates with why.
- **Dialogs** for changes: title as a question ("Restart checkout?"), one sentence on the effect,
  Cancel and the action. Deleting requires typing the name; the delete button uses `bg-danger`.
- **Sign-in**: one centered white card on the frame tint with the logo; the hint says the admin uses the master key.
  Generated passwords are shown once in a box with a copy button and "It will not be shown again".

## Website

The marketing site (`website/`, theme "Helm"). Dark is its default; light is chart paper, a cool
grey, never cream.

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

Dressed as a chart room. Every page opens on a cyan poster field with a large
  Manrope 800 shout, the helm wheel turning with the scroll behind one picture stuck across the seam
  (an archival engraving on the home page, the product's screenshot on product pages). Home: the
  **bearing finder** (steer the wheel to one of nine broken workloads from a real scan and read its log
  entry: position, observed root cause, action, check), how a scan runs as a dark-to-light accordion,
  one incident as a plate with margin notes, the three products pinned on an 1894 Admiralty chart, the
  failures band, two-field pricing, the one-word Install band and a footer with the name cropped by the
  edge. Archival pictures are public domain, live in `website/public/found/` (credits in
  `credits.json`) and are credited in the footer; they show the helmsman's world, never the product.
  No eyebrows, gradients, glows, mono outside commands, or thin rules outside interface fragments.

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
