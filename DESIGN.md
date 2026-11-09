# Butler — design system

Direction: **calm and warm**, a quiet personal notebook (chosen 10 Nov 2026 over "crisp and premium" and "bold and
personal"). Every value below is a token on `:root` in `PA App.html`; nothing outside the token block uses a literal
colour or font.

## Colour
| Token | Light | Dark | Use |
|---|---|---|---|
| `--bg` | `#f7f3ec` paper | `#1b1a17` | page |
| `--panel` | `#fdfbf7` | `#23211d` | raised surfaces: sidebar, cards, drawer |
| `--panel-2` | `#efe9de` | `#2c2a25` | sunken: columns, hovers, tabs track |
| `--text` | `#26231e` ink | `#ece6da` | text |
| `--muted` | `#6b6457` | `#a39c8e` | secondary text, idle icons (≥4.5:1 on `--panel-2`) |
| `--border` | `#e2dbcd` | `#37342e` | hairlines |
| `--accent` | `#0f5c57` deep teal | `#6cc3ba` | the one accent: primary action, selection, today |
| `--accent-ink` | `#fbf8f2` | `#12211f` | text and icons on `--accent` |
| `--danger` | `#b3452f` | `#e8866f` | late, delete |
| `--ok` / `--warn` | `#3f6f3a` / `#9a6a12` | `#8fc38a` / `#e0b45e` | done, warnings |

One accent per screen; neutrals are warm, never blue-grey.

## Type
- Text: **Instrument Sans** (variable 400–700). Page titles: **Newsreader** 500. Both built in (OFL).
- Scale: `--t-xs` 12 · `--t-sm` 13 · `--t-base` 15 · `--t-md` 17 · `--t-lg` 20 · `--t-xl` 26 · `--t-2xl` 34 px.
- Nothing below 12px. Labels and group headings are sentence case, never tracked capitals.
- Counts, dates and times use tabular figures.

## Shape and depth
- Radii: `--r-sm` 6, `--r-md` 10, `--r-lg` 14.
- Surfaces: page → panel (hairline, no shadow) → floating layers (drawer, dialog, toast) are the only things with a
  shadow (`--shadow-float`).

## Icons
Tabler outline icons, built into the file as an SVG sprite: `<svg class="i"><use href="#i-name"/></svg>`, 1.75 stroke,
`currentColor`. No emoji or Unicode symbols as icons. Icons are decorative (`aria-hidden`); the label carries the meaning.

## States
Every control has hover, `:focus-visible` (2px accent ring), active and disabled. Motion is short ease-out and turns off
under `prefers-reduced-motion`.
