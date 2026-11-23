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

## Page layout
Every page has the same parts, in this order:
1. **Title row:** the page name and one line saying what it holds; the page's buttons on the right, in the colour key's order (see Buttons). A ⋮ button ends the row on every page and opens the menu (below). On a phone the first teal button stays and the rest are reached through ⋮.
2. **Tabs row:** the tabs on the left, **Filter this page** on the right (full width on a phone). A page's own pickers that apply to every tab (Utilities: property, year) go in a `.tabs-extra` block, which sits just before the box. Rows the box should match by something other than their text carry it in `data-find` (a Utilities connection: name, property, provider, account).
3. **Toolbar** for the open tab's list: the picker (whose, which car), Group by and Sort on the left; how many and their total on the right.
4. **The content:** cards, then lists.

Pages only say what goes in each part (`page-head` with `page-actions`, the `tabs` under it, `listTools` for the toolbar); `tabsRow()` and `tidyPageActions()` lay them out the same everywhere.

## Files in lists
Every list of files shows each one with `fileMark(att, key, record)`: a picture gets a small preview over its icon (the
icon stays if the picture can't be shown), anything else its icon. Tapping a picture opens it large in the viewer,
which offers to open what it's on ("Open the task") unless that's already open under it.

## Pop-ups
A pop-up opened from another opens on top of it (the one behind stays in sight, dimmed, in `#modal-under`) and remembers it: ‹ Back, Cancel and Esc go back one level, and saving returns there.
Open them with `openAssetForm`; leave with `closeAssetForm()` (one level) or `closeAssetForm(true)` (all of them).

## Sub-pages
A tab that grows into a page of its own stays under its parent: its tab on the parent opens it (`SUB_PAGES`), the page
starts with **‹ Parent** (`subPageBack`), and the sidebar keeps the parent lit (`PARENT_OF`). It isn't in the sidebar
or the phone's More. Assets › Vehicles and Assets › Property are the first.

## Sheets
Something with a lot in it (a rental agreement, a car or other asset, a utility connection) opens as a wide **sheet**
rather than a small pop-up: `box(…, { sheet, fold, top, side })`. Its fields fold under **Details** once it exists, a
summary row with its main buttons runs across the top, and its sections are cards; on a wide screen the long part
(a ledger, upkeep, bills) sits in a column beside the rest. On a phone the sheet is full screen.

## The Data page and SCHEMA
`SCHEMA` (beside `DATA_KEYS`) describes every store: `kind` (entry: happens on a day; list: added to and picked from; system: bookkeeping, not shown), the pop-up a row opens (`open`), and its fields in order as `[field, heading, type, shown?]`. The Data page draws its tables from it, and every test checks on closing that each field a record has is listed there (`schemaCheck` in tests/helpers.js). A new field goes in SCHEMA in the same change.

## Buttons: the colour key
Each colour means one thing, everywhere:
- **Gold** (`.btn.act`, tokens `--act` / `--act-soft`): an action: Transfer, Select, Paste history, Export, Import.
- **Teal filled** (`.btn.primary`): add an *entry*, something that happens on a day: + Task, + Note, + Rates, + Zakat record, + Payment, + Upkeep, + Bill.
- **Outlined** (plain `.btn`): add to a *list*: + Asset, + Car, + Property, + Agreement, + Connection, + Document, + Folder.
- **Red outline** (`.btn.danger`): delete.
On a page's header they go gold, then teal, then outlined, left to right (so Q W E… press them in that order). An add button says what it adds, with a plus icon and the noun ("+ Asset"), and an `aria-label` in full ("Add an asset"); not "Add …" or "New …". Settings keeps its own rule (one filled button, the data file's). `tests/test-button-colours.js` checks every page.
Tabs may carry `data-kind` (entry, list, action): the active one is underlined in that kind's colour (the Data page's tabs do).

## The ⋮ menu
`ActMenu` draws a panel down the right edge (`#act-panel`): every page's header buttons, collected fresh each time it opens by drawing the pages in `ACT_VIEWS` (`VIEWS`), grouped by the colour key (Actions, Add an entry, Add to a list) with the page each is on, then Butler's own (Data, Guide, Light or dark, Settings). Picking one goes to its page and clicks the real button (matched by `ActMenu.sig`), so it never drifts from the pages. A button repeated on two pages is listed once. Its Butler group has Data, Export (the Data page with its table chooser open), Guide, Light or dark, Settings and Trash; a page's own Export is left out of the colour groups. Esc, × or a click outside closes it; read-only it leaves out edit-only buttons. The keys Q W E… press a page's buttons but never ⋮.

## The top bar and the bell
Each page's title row (`#main > .page-head`) is the top bar: sticky at the top, `--topbar-h` tall on the laptop (down to the Islamic date under Butler in the sidebar), with the page's buttons, then the bell and ⋮ (added by `addActButton`). The bell (`Bell`) carries the unread count (`#notice-count`) and opens a small window under it (`#bell-pop`, not a pop-up): the latest notifications, Mark all read, View all. N opens it; Esc, the bell or a click elsewhere closes it; changing page closes it. The sidebar holds only the pages and Data (and the save status); Notifications, Settings, Trash, Theme and Guide live in the bell and ⋮. The sidebar scrolls on its own (`overflow-y: auto`) so it can never make the page taller than the window.
