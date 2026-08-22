# Handoff: BULLY OFF — commercial game UI

## Overview

A commercial-grade redesign of the BULLY OFF field-hockey coach/manager PWA
(`github.com/janvanwassenhove/BullyOff`, branch `main`, app at `apps/manager`).

The redesign covers the whole player journey — intro landing with film, title/main menu,
first-run onboarding, world generation, club selection, season hub, squad & player detail,
match simulation (engine view), three in-match HUD directions, and a post-match report —
plus a reusable, geometrically correct **pitch renderer** with a seven-angle camera system.

The product thesis the design serves: *realistic simulation that also teaches*. Every screen
carries a learning layer (coach reads, "why it worked", rule-of-the-match) aimed at players,
coaches and trainers, not just at winning.

## About the design files

The files in this bundle are **design references authored in HTML** — prototypes showing the
intended look, structure and behaviour. They are **not production code to copy**.

The task is to **recreate these designs inside the existing codebase**: a pnpm monorepo with
`apps/manager` on **Vue 3 + Pinia + vite-plugin-pwa + vue-i18n**, a headless deterministic
engine in `packages/engine`, FIH rules as data in `packages/rules`, season/career model in
`packages/season`, world generation in `packages/worldgen`, and a **PixiJS** view layer in
`packages/render`. Use those existing patterns — hand-rolled CSS with design tokens (no CSS
framework, per BRIEF §4.1), SFC `<style scoped>`, Pinia stores, i18n keys for every string
(NL/EN/FR), and the engine/worker boundary from ADR-008.

Hard constraints that already exist in the repo and must not be broken:
- Engine purity: no `Math.random`, `Date.now`, DOM, timers or transcendentals in the engine
  (ESLint enforces it). Same seed + same inputs ⇒ byte-identical event log.
- No real clubs, no real people, ever (ADR-006).
- SI units everywhere except `packages/render`.
- `pnpm check` (typecheck + lint + test) green before any handoff.

## Fidelity

**High fidelity.** Colours, typography, spacing, radii and copy are final. Recreate pixel-
perfectly using the repo's token file and Vue components. The only deliberately unfinished
elements are image/film placeholders (striped panels with monospace labels) — see **Assets**.

---

## Design tokens

Extend `apps/manager/src/styles/tokens.css`. Keep every existing token (other code depends on
them); add the new layer. Existing values kept as-is: `--color-turf-900 #0b3d2e`,
`--color-turf-700 #146b4a`, `--color-turf-500 #1f9a63`, `--color-turf-100 #d7f5e6`,
`--color-water-700 #0f4c81`, `--color-water-500 #1e78c8`, `--color-ball #f4f1e8`,
`--color-card-green #2ecc71`, `--color-card-yellow #f1c40f`, `--color-card-red #e74c3c`.

New / overriding surface + line tokens (dark theme):

| Token | Hex | Use |
| --- | --- | --- |
| `--ink` | `#06080a` | page background, outside frames |
| `--bg` | `#0a0d10` | screen frame background |
| `--panel` | `#0b0f13` | panels, rails, cards |
| `--panel-2` | `#0d1216` | header bars, elevated strips |
| `--hairline` | `#232a31` | 1px borders, dividers |
| `--hairline-soft` | `#171d23` | internal section dividers |
| `--row-line` | `#141a20` | table row separators |
| `--line-strong` | `#2f3a44` | secondary button borders |
| `--fg` | `#e6edf3` | primary text |
| `--fg-2` | `#c8d2db` | table body text |
| `--fg-3` | `#a6b2bd` | paragraph / supporting text |
| `--fg-muted` | `#8b949e` | labels |
| `--fg-dim` | `#5c6b78` | eyebrow / mono labels |
| `--fg-faint` | `#3f4b56` | placeholder captions |
| `--accent` | `#1f9a63` | primary action, positive |
| `--accent-soft` | `#7fe3b0` | accent text on dark, links |
| `--accent-pale` | `#d7f5e6` | active pill fill, wordmark |
| `--signal` | `#f1c40f` | attention / learning layer |
| `--danger` | `#e74c3c` | relegation, injury, error |
| `--turf` | `#0f2b23` | pitch base |
| `--turf-alt` | `#123227` | pitch mow stripe |

Typography — two Google faces plus the existing mono role:
- `--font-display: "Barlow Condensed", "Barlow", system-ui, sans-serif` — weights 600/700.
  Wordmark, screen titles, scores, numerics, buttons. Always with letter-spacing
  0.02–0.16em; buttons use 0.08–0.10em and uppercase.
- `--font-sans: "Barlow", system-ui, -apple-system, "Segoe UI", Roboto, sans-serif` — 400/500.
  Body copy, paragraphs, table text.
- `--font-mono: "IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace` — 400/500.
  Eyebrow labels (10px / letter-spacing 0.18em / uppercase), clocks, ticks, stat readouts,
  status chips.

Self-host both webfonts as subsetted woff2 in `apps/manager/public/fonts` and declare
`@font-face` with `font-display: swap`. ADR-012 §6 currently says "no webfont weight in the
perf budget" — this design overrides that with two faces (~30 kB subset); record it as an ADR
amendment rather than silently diverging.

Type scale actually used: 10, 11, 12.5, 13, 13.5, 14, 14.5, 15, 16, 17, 18, 19, 21, 23, 24,
26, 28, 30, 34, 38, 44, 66, 76, 92, 112, 132 px. Body line-height 1.45–1.6; display 0.9–1.15.

Spacing: 4px grid (existing `--space-*` tokens). Radii: 3 (chips), 4–5 (small buttons),
6–8 (buttons, cards), 9–10 (panels), 12–14 (screen frames), 999 (pill), 50% (dots).
Shadows: `0 1px 3px rgba(0,0,0,0.5)` on player markers; `0 0 10px rgba(244,241,232,0.5)` ball
glow. Panels use borders, not shadows.

Motion (all restrained, 1 accent at a time):
- `bo-rise` — 500ms ease, opacity 0→1 + translateY(10px)→0. Coach-read card entering.
- `bo-pulse` — 1.6s ease-in-out infinite, opacity 0.35↔1. Live/attention dot.
- `bo-sweep` — 1.8s linear infinite, translateX(-100%)→320%. World-generation progress sheen.
- Screen transitions: 180ms ease-out cross-fade; the score bug never animates during play.

---

## The pitch renderer (`Pitch.dc.html`) — implement first

The single highest-value artefact. It draws a **real FIH pitch from metre coordinates**, which
is exactly what ADR-012 §4 asks the Pixi renderer to do ("pitch is procedural, not a bitmap …
vector-drawn from the same metre coordinates the engine uses").

Geometry constants (metres): pitch `91.4 × 55`; 23 m lines at `22.9` and `68.5`; centre line
`45.7`; shooting-circle radius `14.63` struck from each goalpost, giving a D of depth 14.63 and
span `3.66 + 2 × 14.63`; dashed line 5 m outside the circle; penalty spot at `6.4` from the
backline; goal `3.66` wide, drawn `1.2` deep; sideline hash marks every 5.5 m.

Rendering rules:
- Turf: 5 m mow stripes, `#0f2b23` / `#123227`.
- Lines: `rgba(240,255,248,0.55)` boundary, `0.5` interior, `0.62` circle, `0.26` dashed.
- Players: 1.9 m diameter markers, kit colour fill; home ring `rgba(240,255,248,0.85)`,
  away ring `rgba(10,13,16,0.6)`; offset elliptical ground shadow (matches the ADR-012
  requirement that shadows are a separate layer driven by ball height and light direction).
- Ball: 0.9 m, `#f4f1e8`, soft glow.
- Overlays: `press` (shaded half beyond the 45.7 m line with a dashed leading edge),
  `channels` (three 18.33 m lanes), `circle` (attacking D highlighted in signal yellow).
- Scene presets used by the design: `open`, `press`, `pc`, `goal` — each is a set of 11 home
  and 11 away coordinates plus the ball. In production these come from engine frames, not
  from the preset table; the presets exist only so the static design can show real shapes.

**Camera system** — a crop region in metres `[x0, y0, x1, y1]` plus optional `tilt` (rotateX)
and `yaw` (rotateZ), fitted to the viewport (contain by default, cover when the pitch must
fill the frame):

| Camera | Region (m) | Tilt | Yaw | Used for |
| --- | --- | --- | --- | --- |
| `full` | 0,0,91.4,55 | 0° | 0° | tactical / analysis default |
| `half` | 42,0,91.4,55 | 0° | 0° | half-court press work |
| `circle` | 64,6,91.4,49 | 0° | 0° | attacking-23 coaching crop |
| `goalmouth` | 78,14,91.4,41 | 0° | 0° | goals and saves |
| `broadcast` | 8,−2,91.4,57 | 52° | 0° | the default match camera |
| `lowAngle` | 58,2,91.4,53 | 64° | 0° | the 8 s before a set piece |
| `behindGoal` | 72,10,93.4,45 | 56° | −90° | keeper's read of a corner |
| `cornerCam` | 66,26,93.4,55 | 60° | −34° | long corners, baseline entries |

In the HTML these are CSS 3D transforms with `transform-origin` set to the crop-region centre
and a compensating scale of `min(1.45, 1 / (0.34 + 0.66·cos(tilt)))`. **In PixiJS, do not port
the CSS transform** — implement the same camera as a projection: a pinhole/homography mapping
from pitch metres to screen, so player sprites scale with depth and shadows lengthen away from
the light. The camera table above (regions, tilt, yaw) is the spec; the CSS is the reference
render. A tilted camera also darkens the far half — see the `sheen` gradients in the file.

Camera choice is a presentation concern only: it must never touch the event log or the engine
(ADR-013).

---

## Screens

All frames are designed at 1440 px wide (desktop) unless stated; the phone HUD is 390 × 780.
The app is a PWA targeting **desktop + phone**; density is "balanced".

### 00 · Intro landing (1440 × 860)

Purpose: a cinematic way in with exactly one obvious next action.

- Hero film area: full width, 560 px tall, bottom edge `1px solid #1b2530`. Muted autoplay
  45 s loop, `object-fit: cover`, poster frame required for first paint. Centred play affordance:
  64 px circle, `1px solid rgba(215,245,230,0.4)`, background `rgba(6,9,12,0.5)`, CSS triangle
  16 px in `rgba(215,245,230,0.85)`.
- Scrim over the film: `linear-gradient(180deg, transparent, rgba(6,8,10,0.86) 70%, #06080a)`
  from y=300 to y=600, so the headline always has contrast regardless of the frame.
- Top-left: 28 px accent roundel with a 3 px ink bar across it (the wordmark mark) + "BULLY OFF"
  in display 18/700/0.16em.
- Top-right controls: `EN`, `🔇 SOUND`, `SKIP INTRO →` — mono 11 px, `1px solid #2f3a44`,
  radius 5, padding 7/12. Skip must also fire on any keypress or scroll.
- Headline block at y=388: eyebrow mono 11/0.22em `#7fe3b0` "FIELD HOCKEY, MODELLED HONESTLY";
  display 76/700/0.03em, line-height 0.95, "TAKE THE BENCH ON SATURDAY."; body 17 `#a6b2bd`,
  max 52ch.
- Primary CTA "START COACHING": display 21/700/0.10em, ink text on `--accent`, radius 8,
  padding 17/34. Secondary "▶ WATCH THE 60-SECOND INTRO": `rgba(6,9,12,0.6)` on
  `1px solid #2f3a44`, radius 8, padding 16/24. Support text 13 `#5c6b78`:
  "No account. Works offline. 90 seconds to your first match."
- Right column — Continue card: `rgba(11,15,19,0.9)`, `1px solid #232a31`, **left border 3 px
  `--accent`**, radius 8; 30 × 36 crest, club name display 19/600, mono 11 meta
  "SEASON 2026 · DAY 7 · 2ND · SAVED 16:38", trailing "CONTINUE →" in `#7fe3b0`. Only rendered
  when a save exists. Below it two equal secondary tiles: `QUICK MATCH`, `LEARN THE RULES`.
- Bottom strip: three numbered steps (1 Generate a world / 2 Pick your club / 3 Coach Saturday),
  each a `rgba(11,15,19,0.86)` card with a display 26/700 numeral coloured accent → accent-soft
  → signal; plus a right-hand trust column in mono 10 `#3f4b56`: "OFFLINE · NO ACCOUNTS",
  "NO REAL CLUBS OR PEOPLE", "NL · EN · FR".

### 00b · Camera gallery

Not a product screen — a spec sheet showing the six cinematic cameras at 440 × 248 with a
title and one-line purpose each. Use it to check the Pixi camera port.

### 01 · Title / main menu (1440 × 810)

Left column (absolute, `left:80 top:80 bottom:52`, width 520, flex column): mark + eyebrow
mono 11/0.22em "DETERMINISTIC FIELD HOCKEY"; wordmark display **92**/700/0.06em, line-height
0.9, two lines; 190 × 2 accent rule; body 16 `#a6b2bd` max 44ch; flex spacer; menu.

Menu rows (400 px wide, gap 10): background `#0b0f13`, `1px solid #232a31`, **left rail 3 px**,
radius 6, padding 10/18; mono 11 index, display 23/600/0.08em label, right-aligned 13 px meta.
The active row (`01 CONTINUE`) uses background `#0f1a16`, rail and border `--accent`.
Rows: 01 CONTINUE · 02 NEW CAREER · 03 MATCH VIEWER · 04 THE RULEBOOK · 05 SETTINGS.

Right 58 % of the frame: key-art panel 640 × 590 at `right:70 top:90` (see Assets), over a
`linear-gradient(200deg, rgba(31,154,99,0.22), rgba(30,120,200,0.10) 55%, transparent)` wash.
Version strip bottom-right, mono 11 `#5c6b78`: ENGINE · SAVE · OFFLINE READY · NL · EN · FR.

### 02 · Onboarding (3 cards, 453 × 400)

Replaces `Onboarding.vue`, same once-only localStorage behaviour (`bullyoff.onboarded`).
Each card: `#0b0f13`, `1px solid #232a31`, radius 12, padding 26. Progress = three 22 × 3
bars (active `--accent`, rest `--hairline`). 126 px illustration panel, display 30/600 title,
15 px body `#a6b2bd`, footer row with mono "SKIP" and a filled primary (accent-pale on cards
1–2, `--accent` on card 3 = "LET'S GO"). Copy is a warmer rewrite of the existing
`onboarding.*` i18n keys — keep the key names, replace the strings in all three locales.

### 03 · New career / world generation (1440 × 760)

Two columns: 430 px setup rail (`#0b0f13`, right hairline) + generation preview.

Rail: display 34/600 hero line "Two tiers, twenty years of history, no real clubs."; then four
labelled chip groups — COMPETITION (men's / women's), REGION FLAVOUR (mixed / Vlaanderen /
Wallonie / Bruxelles), HISTORY (none / 10 / 20 seasons), TURF (watered / dry / wet). Chips:
display 15/600/0.06em, padding 8/14, radius 5; selected = ink on `--accent`; unselected =
`#c8d2db` on transparent with `1px solid #2f3a44`. Seed field: mono 22 in a `#0a0d10` box with
`1px solid #2f3a44`, radius 6, plus a `RE-ROLL` pill and the line "same seed, same world —
always". Footer button GENERATE WORLD, display 19/700/0.10em, full width.

Preview: progress header ("Writing 20 seasons of history…" + percentage in `#7fe3b0`), a 3 px
track with the `bo-sweep` sheen, four KPI tiles (24 CLUBS / 432 PLAYERS / 20 SEASONS /
**0 REAL NAMES** — the last one is a deliberate trust signal), and a scrolling history ledger:
rows of `year (mono, accent-soft) · champion line · final score`, separated by `#141a20`.

Bind to the existing `season.newWorld(seed, profile, flavour, historyYears)` action and the
worker progress events already emitted by `season.worker.ts`.

### 04 · Club selection (1440 × 820)

Left: 3-column card grid. Card = `#0b0f13`, `1px solid #232a31` (selected: `--accent`),
radius 10, padding 14; 38 × 44 crest, club name display 19/600, 12.5 px meta
"Town · est. YEAR · nickname", then two mono 10 chips — tier (accent-soft on
`rgba(31,154,99,0.18)` for tier 1, signal on `rgba(241,196,15,0.14)` for tier 2) and level.

Right 430 px detail rail: a 200 px kit-coloured banner with diagonal 6 % white stripes, a
56 × 66 crest and the club name in display 30/700 on the club's secondary colour; then three
KPI numerals (TITLES / SQUAD LEVEL / FACILITIES), a 14.5 px prose paragraph in coach voice,
a KIT row of three 34 px swatches with the note "applied as sprite tint in match", and the
primary "TAKE THE JOB".

**Crests**: shield = 38 × 44 box, radius `4px 4px 16px 16px`, primary colour fill, 1 px light
border, with a horizontal secondary band at 38 %/22 % height. Generated from
`packages/worldgen` `badge.shape/motif/split` — implement `shape` (shield/roundel/crest/
diamond/pennant) and `split` (halves/quarters/band/plain) as CSS/SVG primitives; do **not**
hand-draw per-club art.

### 05 · Season hub (1440 × 860)

Rows: 58 px app bar / 96 px club bar / content.

App bar: wordmark, hairline divider, nav items (SEASON · SQUAD · TACTICS · CLUB · RULEBOOK) as
display 15/600/0.10em with a 2 px accent underline when active, right-side mono status
("SAVED 16:38", locale).

Club bar: 34 × 40 crest; club name display 22/600 + mono 11 "TIER 1 · SEASON 2026 · DAY 7 / 26
· 2ND"; hairline; a next-fixture block with a signal-yellow mono label
"NEXT — SATURDAY, AWAY" and a 15 px scouting line; then the actions —
**COACH THE MATCH** (primary, display 17/700/0.10em), SIM DAY, SIM TO END (secondary outline).

Content: left column with tab pills (TABLE / FIXTURES / RESULTS / HISTORY — active is ink on
`--accent-pale`) and the league table; right 400 px rail.

Table: grid `44px minmax(0,1fr) repeat(7,52px)`, header mono 10/0.14em `#5c6b78`, rows 9 px
padding, separator `#141a20`, numbers in mono 13 `#8b949e` with points in 14 `#e6edf3`, a 9 px
kit swatch before each club name, and the user's row tinted `rgba(31,154,99,0.10)`. Position
number is coloured by zone: 1–4 `--accent`, second-last `--signal`, last `--danger`. Legend
row underneath plus the winter-break note.

Rail (three stacked blocks, hairline-separated): FORM · LAST FIVE as five 36 px squares (W
accent / D `#3d4852` / L danger); **FROM THE COACHING STAFF** — the learning layer: three
advisories, each a left-railed block with a display 17/600 title and 13.5 px body;
TREATMENT ROOM — dot + name + role + days out.

### 06 · Squad & player detail (1440 × 800)

Left: table, grid `34px minmax(0,1fr) 58px 44px 52px 74px 62px 92px` — #, NAME (with a mono 10
accent-soft `YOUTH`/`(C)` badge), ROLE, AGE, OVR, MINUTES, GOALS, STATUS (mono 11, coloured
accent-soft / signal / danger). Selected row tinted like the table.

Right 470 px: header with a 96 × 112 portrait placeholder, mono eyebrow
"FORWARD · 25 · RIGHT-HANDED", name display 38/700, and three chips (OVR pill in ink on
`#7fe3b0`, goals in signal outline, contract in muted outline). Body: ATTRIBUTES as
`110px | bar | 34px` rows, 5 px bars coloured ≥75 accent / ≥60 accent-soft / ≥50 signal /
else danger; then **HOW TO USE HIM** — the per-player coaching read, 14.5 px, followed by two
suggestion chips ("SUGGEST: BUILD-UP → FLANKS", "DRILL: 2v1 BASELINE").

### 07 · Match simulation, engine view (1440 × 960)

Rows: 64 px score bar / pitch / 208 px transport.

Score bar: kit colour rails 4 px either side of the score block; club names display 17/600/0.10em,
score display 34/700; then a hairline-separated clock group (mono 16 clock, mono 10 "Q3 · PLAY")
and an engine group (mono 12 `TICK 49 600` in accent-soft, mono 10 "SEED 2026 · WATERED").
Right: DIRECTOR / TACTICAL / COACH mode pills.

Body columns 264 / flexible / 300:
- Left: PHASE OF PLAY (display 26/600 + 13.5 px explanation with the engine's actual numbers,
  e.g. "2.4 s before your first presser arrives"), ENGINE INPUTS (8 key/value rows in mono),
  and a DETERMINISTIC note.
- Centre: the pitch at `camera: full`, `overlay: press`, with in-pitch tags (mono 10 on
  `rgba(6,9,12,0.72)`) marking the press line, the ball and the cover shadow; overlay toggles
  top-left; camera chips top-right (FULL / BROADCAST / CIRCLE / GOAL / BEHIND).
- Right: LIVE stats as symmetric bars (ours accent from the left, theirs danger from the
  right) and the EVENT LOG, mono timestamp + coloured line.

Transport: play/pause, speed pills 1× / 2× / 4× / SIM TO FT, quarter markers, then a scrub bar
— 4 px track, accent fill to the play head, a 2 px white play head, and event markers (2 px
stalk + 8 px square) coloured accent (our goal) / danger (theirs) / signal (PC) / muted
(card, sub). Legend beneath. Right 340 px: **LEARN THIS PHASE**, a signal-labelled explanation
of why the current tactic works, ending in "OPEN THE RULEBOOK →".

### The touchline — three HUD directions (pick one)

All three read the same live state; only the presentation differs.

**1a Broadcast bench (900 × 506)** — pitch fills the frame (`camera: press`, cover fit),
chrome floats. Score bug top-left: kit rails, short codes display 19/600/0.08em, scores
display 30/700, hairline, mono clock 16 + mono 10 quarter. Turf/mode chips top-right.
Bottom-left **COACH READ** card (330 px, `rgba(6,9,12,0.9)`, left border 2 px signal,
`bo-rise` in): pulsing dot + mono 10 "COACH READ", display 20/600 headline, 13.5 px body,
two actions (GO WIDE / HOLD SHAPE). Bottom-right LEGS card with four stamina bars and a
"ROTATE 3" button. Centre-bottom transport pill.

**1b Instrument panel (900 × 506)** — rows 52 / pitch / 118. Top bar carries kit chips, names,
score, clock and a match-progress bar. Left 172 px rail: SHAPE (display 30/700 formation) and
four dial rows (press height, mentality, tempo, rotate-below) as label + mono value + 3 px bar.
Centre: pitch with `channels` overlay. Right 172 px: LIVE stat list. Bottom: MATCH LOG plus a
260 px **DECISION · 8s** panel with two choices — the timed set-piece call.

**1c Thumb touchline (390 × 780)** — rows 44 status / 64 score / 300 pitch / controls. Pitch
is framed on the attacking 23 at 7 px per metre so the goal, injector and ball are all visible.
Below: pulsing "YOUR CALL", display 24/600 scouting insight, 14 px supporting line, then two
full-width 15 px-padding buttons (≥ 48 px hit targets) and a four-item mono utility row
(TACTICS / ROTATE / SPEED / LOG).

### 08 · Post-match report (1440 × 880) — the teaching screen

Header 150 px with a kit-gradient wash
(`linear-gradient(105deg, rgba(29,53,87,0.55), rgba(10,13,16,0.2) 60%, rgba(230,57,70,0.18))`):
crests, club names display 26/600, score display 66/700, mono context lines
("FULL TIME · DAY 7 · WATERED", "TIER 1 · 2ND → 1ST"), and three actions —
WATCH HIGHLIGHTS · EXPORT REPLAY · BACK TO SEASON (primary).

Columns 400 / flexible / 420:
- MATCH SHEET: eight symmetric stat rows (`44px | label+bars | 44px`), ours accent, theirs
  danger, our figure in accent-soft when leading.
- MOMENTUM: 16 five-minute buckets, ours above the baseline in accent, theirs below in
  `#3a2226`; then KEY MOMENTS — cards with a 100 px replay thumbnail (mono clock), display
  18/600 title and a 13.5 px explanation, left rail coloured by verdict (danger = mistake,
  signal = decision, accent = good).
- Right rail, the learning layer proper: **WHAT YOU DID WELL** (signal eyebrow, display 24/600
  claim, 14 px evidence with before/after numbers), **TO WORK ON** (three railed items), and
  **RULE OF THE MATCH** — a `#0d1216` card explaining the FIH rule the match turned on, with
  "READ THE RULE →".

---

## Interactions & behaviour

- Intro: film autoplays muted and loops; `prefers-reduced-motion` shows the poster frame only.
  Skip on click, key or scroll. Continue card appears only when `season.slots` is non-empty.
- Onboarding: three steps, dots reflect progress, skip and next; persists to localStorage
  exactly as today.
- World generation: the rail is disabled while `season.busy`; progress text comes from the
  worker; the ledger fills in as history is written.
- Club selection: hovering a card raises its border to `--accent`; selecting swaps the detail
  rail; TAKE THE JOB calls `season.pickClub(id)`.
- Season hub: COACH THE MATCH only when `season.todaysUserFixture`; SIM DAY / SIM TO END
  disabled when busy or the season is finished; SIM TO END shows `label · %` progress.
- Match sim / HUD: play, pause, 1×/2×/4×, seek, camera and mode switches are all presentation-
  only. Quarter ends auto-pause and open the briefing. Timed decision prompts (1b/1c) must
  degrade safely — if the clock runs out the AI's own choice stands, and the instruction is
  still tick-stamped so the log stays deterministic.
- Post-match: entered automatically at full time; every claim in the learning layer must be
  derived from the log, never authored prose. If the analyser finds no confident finding,
  render fewer items rather than filler.
- Responsive: below 900 px the three-column screens collapse to a single scrolling column with
  the rails moving under the primary content; the HUD becomes 1c. Hit targets ≥ 44 px on phone.

## State management

Reuse the existing Pinia stores (`stores/season.ts`, `stores/match.ts`, `stores/app.ts`) and the
`EngineClient` worker wrapper. New state needed:

- `ui.intro`: `{ seen: boolean, filmPlaying: boolean, muted: boolean }` (localStorage-backed).
- `ui.camera`: `'full' | 'half' | 'circle' | 'goalmouth' | 'broadcast' | 'lowAngle' | 'behindGoal' | 'cornerCam'`,
  plus `overlay: 'none' | 'press' | 'channels' | 'circle'`. Presentation only.
- `insight`: derived findings for the learning layer, keyed by match id.

**New package suggested: `packages/insight`.** A pure, deterministic analyser
`analyse(log: MatchLog, instructions: CoachInstruction[]): Finding[]`, where a `Finding` is a
typed object (`{ kind, severity, tickRange, metrics, i18nKey, params }`) — never a rendered
string, so NL/EN/FR all work and the UI stays dumb. It feeds the coach read (in-match), the
season-hub advisories, the player "how to use him" note and the whole post-match right rail.
Unit-test it like the rest of the engine: same log ⇒ same findings.

## Assets

Everything in the design that is not CSS is a **placeholder** — striped panels with monospace
captions. Nothing here is final art, and no illustration was hand-drawn.

| Placeholder | Size | What it needs |
| --- | --- | --- |
| Intro film | 1440 × 560, 45 s loop | floodlit warm-up, ball on watered turf; muted, poster frame required |
| Title key art | 640 × 590 (design) / 1280 × 1260 @2× | goalkeeper, floodlit, watered turf |
| Onboarding art | 453 × 126 ×3 | world map of invented towns; season calendar; bench under floodlights |
| Player portrait | 96 × 112 | neutral, generated, non-photographic |
| Key-moment thumbnails | 100 × 56 | frames grabbed from the replay at the moment's tick |

Note on generating these: image generation is not available inside this design tool, so the
film stills, key art and onboarding illustrations must be produced externally (the user has a
ChatGPT account they intend to use for this) or rendered from the Blender→sprite pipeline that
ADR-012 already specifies. Key-moment thumbnails should **not** be authored art at all — render
them from the replay at the relevant tick, which the deterministic log makes trivial.

Crests, kit swatches and all pitch markings are CSS/geometry, not images — keep them that way.

## Suggested build order

1. Tokens + fonts (`tokens.css`, `public/fonts`, ADR-012 amendment).
2. `Pitch` in `packages/render` — geometry, then the camera projection, then overlays.
3. App shell: the new header/nav and club bar in `App.vue` (every screen inherits it).
4. Season hub (`SeasonView.vue`) — the biggest daily surface.
5. `packages/insight` + the post-match report (new component). No engine change needed:
   it reads `quarterStats(log)`, the event log and the coach instructions you already have.
6. Club selection, world generation, title, onboarding, intro landing.
7. The touchline HUD (`CoachView.vue`) last — it depends on the chosen direction (1a/1b/1c).

Keep `pnpm check` green at each step, and add i18n keys for every new string in `en.json`,
`nl.json` and `fr.json` together.

## Files in this bundle

| File | What it is |
| --- | --- |
| `BULLY OFF — Commercial.dc.html` | All redesigned screens: intro, camera gallery, title, onboarding, world gen, club select, season hub, squad/player, match simulation, post-match, and the three HUD directions |
| `Pitch.dc.html` | The pitch renderer + camera system; read this for exact geometry and camera regions |
| `Current UI.dc.html` | Faithful recreation of today's UI, for before/after comparison |
| `github.md` | Source repo association and screen → source-file map |

Open the HTML files directly in a browser. They are self-contained apart from the two Google
fonts; `Pitch.dc.html` is imported by the main file and must sit next to it.
