# Handoff: Browser New-Tab Page

## Overview
A browser new-tab page that combines **search**, **favicon-based bookmark shortcuts organized into folders**, a **read-later reading list**, and **widget slots** (weather, notes). The defining idea: every bookmark is represented by its real **favicon** on a tile that is softly **tinted with a color derived from that site** — so the page is colorful and identifiable without the colors clashing. Adding a link auto-derives the favicon, display name, and a harmonized color from whatever URL you type. The page targets **desktop and mobile** browsers, so hit targets are generous (≥38–44px) and the layout is intended to reflow responsively.

The interaction/motion layer is a first-class part of this design — content visibly travels to and from the folder it belongs to, so users always know where things live.

## Screenshots
Reference renders are in `screenshots/` (captured at the design's 1200px width; the right widget column is slightly cropped by the capture viewport — see the live HTML for the full frame):
- `01-default-dark.png` — default state, dark theme, "Work" folder open.
- `02-light-theme.png` — light theme (same layout) showing the per-site tints in light mode.
- `03-folder-daily.png` — a different folder ("Daily") open, dark theme.
- `04-add-link-modal.png` — Add-a-link modal, empty (globe + "Preview appears here").
- `05-add-link-filled.png` — Add-a-link modal with `stripe.com` typed: auto-derived name "Stripe", domain, monogram, and a harmonized orange tint.

Note: in these captures the live favicon images are replaced by their colored first-letter monogram fallbacks (the favicon service doesn't load in the capture sandbox). In a browser the real favicons load over the monogram; the monogram is the intended fallback.

## About the Design Files
The file in this bundle (`New Tab.dc.html`) is a **design reference created in HTML** — a working prototype that shows the intended look, copy, and behavior. **It is not production code to copy directly.** It is authored in a bespoke streaming-template runtime (a "Design Component"), which you should ignore as an implementation detail.

Your task is to **recreate this design in the target codebase's existing environment** (e.g. React + your component library, Vue, SwiftUI, etc.) using its established patterns. If no app environment exists yet, pick the most appropriate stack — for this design I'd suggest **React + TypeScript + Vite**, plain CSS or CSS Modules with CSS custom properties for theming, and the **Web Animations API** for the motion (no animation library needed). Persist user data (folders, links, order, theme) to `localStorage`.

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions below are final. Recreate the UI pixel-accurately using your codebase's libraries and patterns. The exact favicon images and live weather are placeholders (see Assets).

---

## Screens / Views

There is **one primary screen** plus **one modal**.

### Screen: New Tab (main)
**Purpose:** Land, search, jump to a saved site, scan the reading list, glance at widgets.

**Page frame**
- Full viewport, `min-height: 100vh`, background `var(--bg)`.
- Content column: `max-width: 1200px`, centered (`margin: 0 auto`).
- Page padding: `48px 32px 64px`.
- Base font: `'Hanken Grotesk', sans-serif`. Display font: `'Bricolage Grotesque'`. Mono font: `'IBM Plex Mono'` (used for domains, tags, the URL input).

**Layout (top → bottom)**
1. **Header row** — `display:flex; justify-content:space-between; align-items:flex-start`.
   - Left: greeting (Bricolage 600, 32px, `--text`) + date (14px, `--muted`, `margin-top:8px`). Greeting text is time-based: "Good morning" (<12h), "Good afternoon" (<18h), else "Good evening". Date format: weekday, month, day (e.g. "Friday, June 27").
   - Right: live clock (Bricolage 600, 42px, `--text`) updating every second, `HH:MM` (locale, 2-digit), + theme-toggle pill button.
2. **Search bar** — full width, `margin-top:26px`. `background:var(--surface)`, `border:1px solid var(--border)`, `border-radius:14px`, `padding:16px 18px`, `box-shadow:0 8px 30px var(--shadow)`. Search SVG (stroke `--muted`) + text input (16px). Placeholder: "Search the web or enter an address". Submitting should run a web search OR navigate if the text parses as a URL (web-search engine of your choice).
3. **Body grid** — `margin-top:28px; display:grid; grid-template-columns:212px 1fr 290px; gap:26px; align-items:start`.
   - **Column 1 — Folder sidebar** (see Components → Folder item)
   - **Column 2 — Main** (folder title, shortcuts grid, reading list)
   - **Column 3 — Widgets** (weather, notes, add-widget)

**Column 2 — Main detail**
- **Folder title row:** active folder name (Bricolage 600, 19px) + "N sites" (13px, `--muted`), `gap:10px`, baseline-aligned.
- **Shortcuts grid:** `margin-top:14px; display:grid; grid-template-columns:repeat(3,1fr); gap:12px`. Renders the active folder's site tiles followed by the **Add-link tile** as the last cell. (A faint background panel sits behind this grid for the folder-switch animation — see Interactions.)
- **Reading list:** `margin-top:28px`. Section label "Reading list" (12px, 600, uppercase, letter-spacing .12em, `--muted`). Cards grid: `grid-template-columns:repeat(2,1fr); gap:12px`.

**Column 3 — Widgets** (each card: `background:var(--surface); border:1px solid var(--border); border-radius:16px; padding:18px`)
- **Weather:** label "Weather" + sun SVG (stroke `--accent`); temp "18°" (Bricolage 600, 38px) + "Partly cloudy" (14px `--muted`); sub-line "San Francisco · H 21° L 12°" (12px `--muted`).
- **Notes:** label "Notes"; three lines (14px), third line in `--muted`. Sample copy: "· Ship new-tab v1", "· Email the design review", "· Add weather location picker".
- **Add widget** button: dashed, full width, `min-height:46px`. Copy: "+ Add widget".

### Modal: Add a link
**Purpose:** Add a new bookmark; auto-derives favicon, name, and color from the typed URL.
- **Backdrop:** `position:fixed; inset:0; background:var(--overlay); backdrop-filter:blur(4px)`; centers the card; `z-index:80`; fades in (`fade` 0.2s). Click on backdrop closes.
- **Card:** `width:440px; background:var(--surface); border:1px solid var(--border); border-radius:20px; padding:26px; box-shadow:0 30px 80px rgba(0,0,0,.5)`; enters with `pop` (0.28s). Click inside does NOT close (stopPropagation).
- **Header:** title "Add a link" (Bricolage 600, 20px) + close ✕ button (`--muted` → `--text` on hover).
- **Live preview tile:** `margin-top:18px; padding:16px; border-radius:14px`, tinted `color-mix(in oklab, <derivedColor> 15%, var(--surface2))`, border `color-mix(in oklab, <derivedColor> 28%, transparent)`, `min-height:66px`. Left: 40px white rounded chip with the favicon (or a globe SVG when empty). Right: derived name (15px, 600) + derived domain (mono, 12px, `--muted`). When the URL is empty/invalid, show a globe icon and "Preview appears here".
- **URL field:** label "Website URL" (12px, 600, uppercase). Input is mono, 15px, `background:var(--surface2)`, `border-radius:11px`, `min-height:46px`, placeholder "figma.com", autofocus. Helper text: "We pull the favicon and a matching color automatically."
- **Folder chips:** label "Add to folder". Row of pill buttons (one per folder), `flex-wrap`, `gap:8px`. Each chip: color dot (9px) + folder name. Selected chip: `background:color-mix(in oklab, <folderColor> 20%, var(--surface))`, border = folder color, text `--text`. Unselected: `background:var(--surface2)`, border `--border`, text `--muted`. Defaults to the currently-open folder.
- **Actions (right-aligned):** "Cancel" (secondary, `--surface2`) and "Add link" (primary, `background:var(--accent)`, white text). Both `min-height:44px`.

---

## Components (shared specs)

### Site shortcut tile (the core element)
- Layout: `display:flex; align-items:center; gap:12px; padding:14px; border-radius:14px; min-height:62px`.
- **Tint:** `background: color-mix(in oklab, <siteColor> 15%, var(--surface))`; `border: 1px solid color-mix(in oklab, <siteColor> 26%, transparent)`. This is the muddle-proofing trick — strong brand colors become quiet, harmonized washes.
- **Favicon chip:** 36px, `border-radius:10px`, `background:#fff`, centered. Contains the favicon image (22px, `object-fit:contain`) layered over a colored fallback monogram (first letter, weight 700, 15px, color = `<siteColor>`). If the favicon fails to load, hide the `<img>` so the monogram shows.
- **Name:** 14px, 500, `--text`, single line with ellipsis.
- The whole tile is a link to `https://<domain>`. (In the prototype navigation is suppressed so you can feel the click-pop; in production let it navigate, but still play the pop.)
- **Hover:** `transform: translateY(-3px)`; background tint deepens to 24%; `box-shadow: 0 12px 28px color-mix(in oklab, <siteColor> 30%, transparent)` (glow in the site's own color); border → 48% mix. Transition `transform .2s cubic-bezier(.2,.8,.2,1), background .18s, box-shadow .2s, border-color .18s`.
- **Active/press:** `transform: translateY(-1px) scale(.985)`.

### Add-link tile
- Same footprint (`min-height:62px`), dashed border, `--muted`, centered "+" SVG over "Add link" (13px). Hover: border + text → `--accent`, faint accent background, lift `-3px`. Opens the Add-a-link modal.

### Folder item (sidebar)
- Layout: `display:flex; align-items:center; gap:12px; padding:9px 11px; border-radius:13px`.
- **2×2 favicon preview:** 36px rounded box (`background:var(--surface2)`, border, `padding:3px`), a `grid-template-columns:1fr 1fr; gap:2px` of up to four white cells, each holding a tiny favicon over a 7px colored monogram. This visually identifies the folder by its contents.
- **Text:** folder name (14px; weight 600 + `--text` when active, else 500 + `--muted`) + "N sites" (12px, `--muted`).
- **Active state:** `background:var(--surface2)`, `border:1px solid var(--border)`. Inactive: transparent bg + transparent border.
- **Hover:** `background:var(--surface2)`. **Press:** `transform:scale(.985)`.
- **New folder** button below: dashed, left-aligned, `min-height:42px`, copy "+ New folder". (Create-folder flow not yet designed — see Open items.)

### Reading-list card
- `display:flex; flex-direction:column; gap:8px; padding:16px; border-radius:14px; background:var(--surface); border:1px solid var(--border)`.
- Tag chip: mono 11px, `color:var(--accent)`, border `color-mix(in oklab, var(--accent) 40%, transparent)`, `border-radius:6px; padding:2px 7px`, self-start.
- Title: Bricolage 500, 16px, `line-height:1.3`.
- Meta: 12px `--muted` — "source · time".
- **Hover:** `translateY(-3px)`, `box-shadow:0 12px 28px var(--shadow)`, border → accent mix.
- Seed content (title / source / time / tag):
  - "The quiet death of the homepage" / The Verge / 6 min / Design
  - "How a browser renders a single pixel" / Smashing / 12 min / Eng
  - "On the design of calm technology" / A List Apart / 8 min / Essay
  - "Why color systems fall apart at scale" / Increment / 9 min / Systems

### Buttons (general)
- **Theme toggle pill:** `--surface2` bg, border, `border-radius:999px`, `padding:9px 17px`, `min-height:40px`. Label is the *opposite* theme ("Light" while dark, "Dark" while light). Hover → `--surface`; press → `scale(.95)`.
- All buttons have a subtle press (`scale(.95–.98)`) and a hover state; primary modal button brightens (`filter:brightness(1.08)`) with an accent glow.

---

## Interactions & Behavior

### Favicon + color derivation (key logic)
When the user types a URL in the Add-link modal, derive on every keystroke:
- **domain:** strip `https?://` and leading `www.`, take everything before the first `/`, lowercase. Require it to contain a "." and be ≥3 chars, else treat as invalid (show empty preview).
- **name:** the first label of the domain (before the first "."), capitalized. e.g. `figma.com` → "Figma".
- **favicon URL:** `https://www.google.com/s2/favicons?domain=<domain>&sz=128` (placeholder service — swap for your own; see Assets).
- **color:** deterministic pick from a fixed palette via a string hash of the domain, so the same site always gets the same color and colors stay within a curated, harmonious set. Hash: `h = 0; for each char: h = (h*31 + charCode) >>> 0; color = palette[h % palette.length]`.
- **Palette:** `['#5E6AD2','#FF4500','#EA4C89','#1DB954','#F48024','#A259FF','#E0479E','#00A8E8','#FF6600','#24A0ED','#7C5CFC','#0FB57B']`.

On **Add link**: append the derived site to the selected folder, switch the active folder to it, close the modal, and play an enter-pop on the new tile (scale .3 → 1.06 → 1, 480ms).

### Click a link → "pop"
On click (no drag), play a scale pop on the tile: keyframes `scale(1) → .9 (35%) → 1.05 (70%) → 1`, 320ms, `cubic-bezier(.2,.8,.2,1)`. Then navigate.

### Drag a link → reorder, neighbors spring aside
Pointer-based drag-and-drop within the active folder's grid (use Pointer Events; `touch-action:none` on tiles so mobile drag works):
1. **pointerdown** on a tile: capture the bounding rects of all tiles ("home rects"). Lift the tile — `scale(1.07)`, `box-shadow:0 20px 44px rgba(0,0,0,.45)`, `z-index:60`; after one frame set its `transition:none` so it tracks the cursor 1:1.
2. **pointermove:** translate the dragged tile by the pointer delta. Compute the **insertion index** = nearest home-rect center to the pointer. When it changes, **shift the other tiles**: each tile between the dragged origin and the insertion point translates into its neighbor's slot (`transform:translate(dx,dy)`) with `transition:transform .28s cubic-bezier(.34,1.45,.5,1)` — a springy "pop around" that opens a gap.
3. **pointerup:**
   - If total movement < 6px → treat as a **click** (reset styles, run the pop, navigate).
   - Else **commit**: animate the dragged tile to its target slot (220ms), then update the order in state and clear all inline transforms (restoring the base transition). Persist the new order.

Implementation notes: render tiles **without React keys reflecting order**, OR (cleaner) key them by a stable id and use a FLIP approach. The prototype intentionally does NOT reorder React state mid-drag — it only moves DOM imperatively and commits the new array once on drop — which avoids reconciliation fighting the drag. Either approach is fine; match what's idiomatic in your stack (e.g. `@dnd-kit/sortable` in React is a reasonable production substitute that yields the same feel).

### Switch folders → content flies to/from the folder
This is the signature transition. When a different folder is clicked:
1. **Exit:** every current tile animates toward the **previously-active folder's sidebar icon** — `translate` toward that icon's center (≈92% of the way) while scaling to `.18` and fading to 0. Duration 300ms, staggered 14ms per tile, `cubic-bezier(.55,0,.85,.4)`, `fill:forwards`. ("Content pops back into the old folder.")
2. After all exits finish, swap the active folder in state and render the new tiles.
3. **Enter:** cancel any leftover animations on the (reused) tile nodes, then animate each new tile **from the newly-selected folder's icon** outward into its grid slot — start at `translate(from icon) scale(.18) opacity 0` → `translate(0) scale(1) opacity 1`. Duration 460ms, delay `70 + 32*index`, `cubic-bezier(.2,.85,.3,1.1)`. ("Content pops out into the area.")
4. Simultaneously: a **faint background panel** behind the grid slides down and fades (`translateY(-26px)→0→` then fades out; 520ms), and the **folder title** does a small `translateY(-10px)→0` fade (360ms).
5. Guard against overlapping switches with an `_switching` flag.

To compute the fly vectors you need live `getBoundingClientRect()` of each folder sidebar element and each tile — keep refs to both.

### Theme toggle
Toggles `dark`/`light`. Implement as CSS custom properties on a root element (see Design Tokens) and swap the set. Default **dark**. Persist choice.

### Live clock
`setInterval` every 1000ms updates clock, date, and greeting. (Update via ref/textContent or state — either is fine.)

### Responsive behavior (to design/build)
The prototype is desktop-first (fixed 3-column grid). For production: below ~900px, collapse to a single column — folders as a horizontal scroll/segmented strip or a sheet, shortcuts grid to 2 columns (or `auto-fill, minmax(150px, 1fr)`), widgets below the reading list. Keep all hit targets ≥44px on touch. This responsive layout is **not yet mocked** — flag with the user before building.

---

## State Management
- `theme`: `'dark' | 'light'` — persist to `localStorage`.
- `folders`: array of `{ id, name, color, sites: Site[] }` where `Site = { id, domain, name, color, faviconUrl }`. Persist.
- `activeFolderId` (prototype uses an index): which folder's tiles are shown.
- `modal`: `{ open: boolean, targetFolderId, urlInput }` — `urlInput` drives the live preview each keystroke.
- Drag transient state (not persisted): dragged index, insertion index, home rects, pointer start.
- Derived (not stored): the live preview object computed from `urlInput`.

Triggers: folder click → animated active swap; tile click → pop + navigate; tile drag → reorder + persist; Add link → append + persist + switch; theme toggle → swap tokens + persist.

## Design Tokens

**Colors — Dark (default)**
| Token | Value |
|---|---|
| `--bg` | `#0C0D11` |
| `--surface` | `#14161E` |
| `--surface2` | `#1B1E29` |
| `--text` | `#ECEEF6` |
| `--muted` | `#828BA3` |
| `--accent` | `#8B8BFF` |
| `--border` | `rgba(255,255,255,.08)` |
| `--shadow` | `rgba(0,0,0,.4)` |
| `--overlay` | `rgba(8,9,12,.62)` |

**Colors — Light**
| Token | Value |
|---|---|
| `--bg` | `#EEF0F5` |
| `--surface` | `#FFFFFF` |
| `--surface2` | `#F5F6FA` |
| `--text` | `#14161E` |
| `--muted` | `#717A92` |
| `--accent` | `#5B5BE6` |
| `--border` | `rgba(20,22,30,.09)` |
| `--shadow` | `rgba(20,22,30,.10)` |
| `--overlay` | `rgba(20,22,30,.35)` |

Per-site tints are computed at render time with `color-mix(in oklab, <siteColor> <pct>%, var(--surface))` — do not hardcode them.

**Site/derivation palette:** `#5E6AD2 #FF4500 #EA4C89 #1DB954 #F48024 #A259FF #E0479E #00A8E8 #FF6600 #24A0ED #7C5CFC #0FB57B`

**Typography**
- Display: **Bricolage Grotesque** (600/700) — greeting, clock, folder & card titles, big numbers.
- Body/UI: **Hanken Grotesk** (400/500/600).
- Mono: **IBM Plex Mono** (400/500) — domains, tags, URL input.
- Scale (px): 42 clock · 38 temp · 32 greeting · 20 modal title · 19 folder title · 16 search/card title · 15 modal name/input · 14 tile/body · 13 buttons/meta · 12 labels/meta · 11 tag chips · 7 micro-monogram.
- Section labels: 12px, weight 600, `text-transform:uppercase`, `letter-spacing:.12em`, `--muted`.

**Spacing / radii / shadows**
- Page padding `48px 32px 64px`; content `max-width:1200px`.
- Grid gaps: body 26px; tiles 12px; cards 12px.
- Radii: tiles/cards 14px; folder item 13px; favicon chip 10px; widgets/modal-preview 16/14px; modal card 20px; pills 999px; small chips 6–7px.
- Shadows: resting search `0 8px 30px var(--shadow)`; hover glow `0 12px 28px color-mix(...siteColor 30%...)`; drag lift `0 20px 44px rgba(0,0,0,.45)`; modal `0 30px 80px rgba(0,0,0,.5)`.

**Motion**
- Standard ease-out: `cubic-bezier(.2,.8,.2,1)`.
- Spring/overshoot (neighbor shift, enter): `cubic-bezier(.34,1.45,.5,1)` / `cubic-bezier(.2,.85,.3,1.1)`.
- Exit (fly to folder): `cubic-bezier(.55,0,.85,.4)`.
- Durations: hover .18–.2s; press .12s; click-pop .32s; drag neighbor shift .28s; drop settle .22s; folder exit .3s (stagger 14ms); folder enter .46s (stagger 32ms, lead 70ms); add-link pop .48s; entrance-on-load .48s (stagger 40ms, lead 150ms).
- Keyframes used: `rise` (translateY 16px + fade, for columns/header on load), `pop` (modal entrance), `fade` (overlay).

## Assets
- **Favicons:** fetched from `https://www.google.com/s2/favicons?domain=<domain>&sz=128` as a placeholder. For production prefer a first-party/proxied favicon service or store icons yourself (privacy + reliability). Always render a **colored first-letter monogram fallback** behind the image and hide the image on load error.
- **Weather data:** static placeholder ("18°, Partly cloudy, San Francisco"). Wire to a real weather API with a location picker (noted in the Notes widget copy).
- **Icons:** all inline SVG (search, plus, close, sun, globe) — recreate or use your icon set.
- **Fonts:** Google Fonts — Bricolage Grotesque, Hanken Grotesk, IBM Plex Mono. Self-host for production.
- No raster image assets.

## Open items (confirm with product before building)
- **Mobile/responsive layout** — not yet mocked.
- **Create-folder** and **edit/remove link/folder** flows — buttons exist ("+ New folder", "+ Add widget") but the flows aren't designed.
- **Widget system** — weather/notes are static; the add-widget flow is a placeholder.
- **Search behavior** — choose engine + URL-vs-query detection.

## Files
- `New Tab.dc.html` — the combined hi-fi prototype (this is the source of truth for look + motion).
- `screenshots/` — reference renders of the key states (see Screenshots section above).
- `New Tab — Directions.dc.html` *(optional, ask if wanted)* — the earlier 3-direction exploration (Atlas / Spectrum / Rail) that this design was distilled from. Not included by default.
