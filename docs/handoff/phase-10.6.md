# Handoff — Phase 10.6: the review pass (academy corrected, cards animated, goals reviewable, restarts that look like hockey)

Jan's review of v1.0.0, five findings in one session; all shipped.

## 1 · The academy taught the press wrong

The single "four systems" step showed a full-court press while its caption described all four systems — and claimed the zone press sits "behind the 23" where the engine engages at 35.75 m. Now **one step per system**, each diagram placed where `pressLineM` actually puts the engage line (full 71.5 m from own backline, half 52.25, zone 35.75), with the shared principles (channels, free man + rest-break) kept as steps five and six. Six steps, i18n renamed `fullCourt`/`halfCourt`/`zone` (old `systems` keys deleted) in NL/EN/FR.

**Animation integrity, tested**: Jan saw teleporting balls. Root causes: arrows whose `from` didn't match any marker (the run yanked the wrong player) and pass chains that jumped between alternatives. Every step now keeps one continuous ball path anchored at the ball marker, and `academy.test.ts` pins both invariants (ball-chain continuity < 1 cm, every run/carry starts < 1.5 m from a player) so a future scene cannot regress. Also fixed en route: the PC castle in the corner steps is five including the keeper (matches the corrected rulebook), the wear-out step plays the held-back variant as one sequence, `shape`/`upBackThrough`/`overTheTop` got their missing ball markers, and the baseline pull-back meets its runner on the spot.

## 2 · The cards scene: green, yellow, red — with their shapes

`rules.cards` is now a 7.2 s escalation: green (the player steps aside), yellow (further), red (off the pitch), the arm dipping between showings. `FigureScene.card` became a stepped `cards: {t, card}[]` timeline with `cardShownAt()` sampled into the frame. The view draws each card in its real FIH shape — **green triangular, yellow rectangular, red round** — and the rulebook text in all three languages now says why: the shapes exist so a colour-blind player still knows which card went up.

## 3 · Every goal is reviewable, with the system answer (Jan: "13 goals — I want to rewatch them and know how to adjust")

The report capped key moments at six, so a 0–13 showed one goal. Goals now have their own uncapped **DOELPUNTEN** list (the analysis already names each goal's cause — own free hit, lost tackle, corner, open play). Every moment row (goals and the rest) is a **playable clip**: a modal `PitchCanvas` seeked 8 s before the moment, playing to 4 s after, looping — the ten seconds before a goal are where the lesson lives. Conceded-goal rows link the counter: a foul-caused goal opens its rule, a lost-tackle or open-play goal opens the pressing topic, a corner goal the PC topic (`fixTopic` in ReportView). Also fixed: `report.didWellNone` claimed "an even match" under any scoreline.

## 4 · Restarts after a goal, and the halfway five at a corner

- **Centre pass**: placements only nudged offenders 2 m over the line and play resumed in 3 s with half the team stranded upfield. Now both teams walk to their kickoff shape in their own half first (AI: slot positions clamped to own half, effort 0.8) and the setup window is 12 s (6 s in the FAST laws) — the clock is stopped, so it costs no playing time.
- **Defending a PC**: the five at halfway were decoration. After the injection the recoverers now sprint to the second-phase zone at the top of the D while two stay wide around halfway as counter outlets — exactly where the D-clearance is aimed.

Engine **0.8.1**, sandbox golden `645cdbc6a3a1d81f`, all scenario hashes re-baselined. Calibration re-run: men 14/15, women 11/15, **all measured rows pass both profiles** (the shots/entries/restart residuals are the same estimated-band family as 0.8.0; women's PC conversion dipped to 0.09 because the recoverers clear rebounds better — watch it next pass).

## 5 · Competitions of Europe — recorded, not started

Jan asked for Dutch/English/French/German leagues, national playoffs, a European club competition and a Pro League-style nations format. That is a phase of its own (world-gen per country, formats as data, save bump) — scoped in `KICKOFF.md` § After v1.0 with the open questions.

## Open question back to Jan

The 0–13 screenshot showed the user club with **zero** of everything (0 shots, 0 entries, 1 tackle won) across a full match — that is not a weak team, that is something broken, and it did not reproduce here (a fresh career's first sim day produced a 6–1 with normal mirror stats). If it happens again: **HERHALING EXPORTEREN** on that report and send the file — the replay is enough to diagnose it exactly.

## Files

Engine: `ai/brain.ts` (centre-pass shape, PC halfway five, shoot-base note), `ai/tactics.ts` (slotToPitch reuse), `sim/golden.ts`, `sim/scenarios.golden.json`, `constants.ts` (0.8.1). Rules: `laws.ts` (centre-pass setup 12 s / 6 s fast). Manager: `lib/academy.ts` + `academy.test.ts`, `lib/ruleFigures.ts` + `ruleFigures.test.ts`, `ui/RuleFigure.vue` (shaped cards), `ReportView.vue` (goals list + clip player), `i18n/{nl,en,fr}.json`. Docs: this file, `KICKOFF.md`.
