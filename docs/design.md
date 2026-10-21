# Design System

Mood: **dark, technical, calm.** Pure black canvas, a faint engineering grid, one mint-green accent,
crisp sans-serif type. Think "terminal meets blueprint" — confident and minimal, never flashy.

## Colors

| Token | Value | Use |
|-------|-------|-----|
| `--bg` | `#000000` | page background |
| `--surface` | `#0a0a0a` | cards, panels |
| `--surface-2` | `#141414` | hover, inputs |
| `--border` | `#262626` | card borders, dividers |
| `--grid` | `rgba(255,255,255,0.05)` | background grid lines |
| `--text` | `#fafafa` | primary text |
| `--text-muted` | `#a3a3a3` | secondary text, nav |
| `--text-subtle` | `#737373` | captions, hints |
| `--accent` | `#6ee7b7` | brand mint: primary buttons, highlights, headline accent |
| `--accent-strong` | `#34d399` | accent hover |
| `--accent-ink` | `#04150e` | text on accent buttons |
| `--warning` | `#fbbf24` | degraded / warnings |
| `--danger` | `#f87171` | failures, critical findings |

Status mapping: healthy → accent, warning → warning, critical/failed → danger, unknown → text-subtle.

## Typography

- **Sans:** [Manrope](https://fonts.google.com/specimen/Manrope) — headings and UI. Headings weight 500–600, tight tracking.
- **Mono:** [JetBrains Mono](https://fonts.google.com/specimen/JetBrains+Mono) — kubectl commands, logs, resource names, small uppercase labels.
- Hero headline: two lines, first line in `--accent`, second in `--text`.

## Surfaces & shapes

- Background: black with a 48px grid of `--grid` lines, framed content column with 1px `--border` side rails.
- Cards: `--surface`, 1px `--border`, radius 8px, no heavy shadows.
- Primary button: `--accent` fill, `--accent-ink` text, radius 6px.
- Secondary button: transparent, 1px `--text` / `--border` outline.
- Pills/badges: small, rounded-full, subtle tinted background of the status color.
- Segmented toggles (e.g. HUMAN / AGENT): pill track with accent-filled active segment, uppercase mono labels.

## Motion

Subtle only: 150ms color/opacity transitions, a gentle pulse on "investigating" states. No bouncing.

## Implementation

Tokens live as CSS variables in `frontend/src/app/globals.css` and are exposed to Tailwind as
`bg-bg`, `text-muted`, `border-border`, `bg-accent`, etc. Use tokens — never hard-code colors.
