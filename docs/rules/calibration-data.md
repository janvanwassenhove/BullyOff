# Calibration data — real-world aggregates (Phase 4)

Aggregate statistics only (BRIEF §7 — no individual player data). Men's and women's kept separate (§5.0). Every row states its source, season and sample size, and whether it is a **measured** figure or an **estimate** (labelled `EST`) that Jan should replace with a measured one when available. Tolerances follow §6.1: ±10 % on measured frequencies; wider on estimates. Machine-readable twin: `tools/calibrate/src/targets.ts` — keep them in sync.

Transcribed 2026-08-19 by the AI lead engineer from public season pages; **Jan to verify/replace** the `EST` rows from KBHB / FIH match reports (open question #17).

## A. Belgian Hockey League — top division (the domestic reference; sets the absolute values)

| Metric | Men | Women | Source / sample | Status |
|---|---|---|---|---|
| Goals per match (both teams) | **5.4** (2024–25: 753 / 139; recent seasons 4.86–6.03; 5-season mean ≈ 5.5) | **3.6** (2024–25: 430 / 120) | Wikipedia season pages "2024–25 Men's/Women's Belgian Hockey League" (league stats boxes) — n = 139 / 120 matches | measured |
| Draw rate | **≈ 11 %** (29 team-draws in the 12×22 regular season → 14.5 / 132) | **≈ 25 %** (60 team-draws → 30 / ~120) | standings D columns, same pages | measured (derived) |
| Share of goals from PCs (incl. strokes ≈ +3 %) | **≈ 0.33** | **≈ 0.30** | FIH: "one-third of all goals on higher levels"; top-10 scorer FG/PC/PS breakdowns 2024–25 (M: PC-heavy — Hendrickx 50 PC of 52; W: 41 PC / 148) | measured-ish; band 0.25–0.40 |
| Play-off format (Phase 6) | top 4, semi-finals + final; 2 relegated | top 4; two-leg final; relegation play-off vs 2nd tier | same pages | measured |

## B. FIH Pro League (the international reference; validates the response to a quality shift)

| Metric | Men | Women | Source / sample | Status |
|---|---|---|---|---|
| Goals per match | **4.76** (343 / 72) | **4.22** (304 / 72) | Wikipedia "2024–25 Men's/Women's FIH Pro League" | measured |
| Quality spread | tight (national teams) | tight | — | — |

Use: two evenly matched elite squads (level 16–17) in the sim should move goals/match *towards* these values from the Belgian baseline while PC share stays ≈ ⅓. If the model does not respond, it is fitted, not causal (BRIEF §6.1).

## C. Estimates pending measured data (`EST`) — apply to both profiles unless noted

| Metric | Target | Band | Basis |
|---|---|---|---|
| Penalty corners awarded per match (both teams) | **9** | 6–12 | Hockey One 2022 R1: 42 PCs in ~4 matches ≈ 10.5; elite matches typically 4–6 per side |
| PC conversion (goals per PC awarded, incl. rebounds) | **0.20** | 0.14–0.28 | ⅓ of 5.4 goals ≈ 1.8 PC goals over ≈ 9 PCs ≈ 0.20; published elite ranges 15–30 % |
| Circle entries per match (both teams) | **36** | 26–48 | Hockey One 2022 R1: 133 entries in ~4 matches ≈ 33 |
| Shots per match (both teams) | **24** | 16–34 | ≈ 0.65 shots per circle entry (Hockey One: 17 shots on target / 133 entries ≈ 0.13 *on target* per entry) |
| Shots on target share | **0.45** | 0.30–0.60 | general elite reporting |
| Penalty strokes per match | **0.25** | 0.1–0.5 | Belgian top-scorer PS counts (2–3 per top scorer per season) |
| Stroke conversion | **0.75** | 0.6–0.9 | Olympics.com: "roughly 70–80 % at international level" |
| Green cards per match | **3** | 1.5–5 | typical umpiring at top club level |
| Yellow cards per match | **0.7** | 0.2–1.5 | typical |
| Red cards per match | **0.02** | 0–0.1 | rare |
| Free hits / restarts per match | **110** | 70–160 | typical stoppage counts (incl. side-ins, hit-outs, long corners) |
| Scoreline shape | per-team goals ≈ Poisson(mean/2), slight over-dispersion | chi-square p > 0.01 vs Poisson-derived expected frequencies (0…6+) | placeholder shape model until a per-scoreline table is transcribed |

## Sources

- Wikipedia: 2024–25 Men's Belgian Hockey League; 2024–25 Women's Belgian Hockey League; 2018–19 / 2022–23 / 2023–24 / 2025–26 Men's Belgian Hockey League; 2024–25 Men's and Women's FIH Pro League (season statistics boxes and standings).
- FIH, "Penalty corner review – Update July 2023" (context; the PC's share of goals).
- XDlytics, "Conversions and PCs — Hockey One Round 1" (2022) — PCs, circle entries, shots on target.
- Olympics.com, "Hockey rules: know how to play the sport" — penalty stroke conversion.
- FIH match statistics reports (altiusrt) — format of per-match stats: PCs, circle entries, shots, shots on target, possession per quarter (Jan can transcribe a season's worth from here to replace every `EST` row).
