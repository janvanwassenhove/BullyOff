# Handoff — Phase 10.1: Jan's second look (intro film, plain language, tempo, rule animations)

**Date:** 2026-08-23 · engine **0.7.0** · sandbox golden `cec18ab670a0562b` · save format **v3**

Jan's feedback on the commercial build: (1) the intro showed a video that never played; (2) "DETERMINISTISCH VELDHOCKEY" and the other engineering words — players, coaches and sportspeople will use this, not IT people; (3) play and ball movement feel slow, hockey is a fast technical sport, especially on a watered pitch; (4) the rulebook wants animations.

## 1 · Intro film = six generated stills

`ui/IntroFilm.vue`: a cross-fading slideshow with a slow push-in (`public/intro/film-{1..6}.webp`, 1600 × 900, 784 kB total, precached). Ambient behind the landing hero (9 s a frame), fullscreen with a caption per still, a progress strip and ESC/click to close on "watch the intro" (7 s a frame ≈ 45 s). Stills: dawn sprinklers · dressing room · warm-up on wet turf · penalty corner · the bench at half-time · full time. Prompts in `docs/design/art-prompts.md`. No `<video>` any more, nothing to download, works offline.

Gotcha: `intro.film` already existed as a string key (the old placeholder label) — the captions live under `intro.reel.f1…f6`. A scoped `.film` rule on the parent also hit the child's root element; the child's root is now `.reel`.

## 2 · Plain language

Every "engine / deterministic / seed / tick / byte-identical log" in NL/EN/FR became hockey language: *een seizoen dat echt gespeeld wordt*, *wereldnummer*, *wedstrijdnummer*, *exact herspeelbaar*, *stappen per seconde*, *spelversie*. Title eyebrow: "VELDHOCKEY ZOALS OP ZATERDAG" / "FIELD HOCKEY, SATURDAY-REAL" / "LE HOCKEY SUR GAZON, COMME LE SAMEDI". The about page no longer mentions PixiJS or utility AI. `deterministicBody` keeps its key name; the text is about replays.

## 3 · Tempo — measured, not guessed

`packages/engine/src/sim/tempo.test.ts` plays four full AI matches and prints pass launch speed, dribble-touch speed, live-ball speed, carrier speed, goals, entries, PCs, shots. Findings:

| | baseline | firmer passes only | + faster dribble (any variant) |
| --- | --- | --- | --- |
| pass launch | 11.8 m/s | **12.4–12.8** | 12.5–13.4 |
| dribble touch | 1.5 m/s | 1.5 | 2.1–4.3 |
| goals / match (6 seeds) | 3.5 | **4.7–5.0** | 1.2–2.8 |
| shots | 30 | **34–38** | 7–18 |
| penalty corners | 3.8 | **4.5–4.8** | 1.7–3 |

The physics were already right (push 14, hit 36, sprint 8.6 m/s); the AI chose to play passes that arrived at 5.5–8.5 m/s. They now arrive at **6.5–10 m/s** (`brain.ts` `vArr`), which reads as hockey and, as a bonus, lifts goals into the men's calibration band (4.9–5.9) and PCs towards the target. Every attempt to run the ball ahead of the carrier (2–6 m/s touches, running-pace prods, carrier threshold 7 m/s) **halved shots and goals** — the rolling ball is trapped by the next defender and is never at the feet to shoot — so the dribble model stayed as it was; the test documents this so it is not retried blindly.

Presentation, the other half of "feel": the coach view and the viewer now open on the **broadcast** camera (closer framing; the full-pitch view made an 8 m/s sprint cross a tenth of the screen per second) and the renderer draws a short fading **trail behind any ball faster than 5 m/s** (`MatchView.ts`, cleared on seek).

Engine **0.7.0**: the AI change alters every scenario hash; sandbox log is version-only. `pnpm calibrate:run` was not re-run on 96 matches — the four-match tempo guard (goals 2.5–8, shots ≥ 18, PCs ≥ 2) is the regression net; a 96-match re-baseline is due before v1.0 (calibration.md).

## 4 · Rule animations

`lib/ruleClips.ts` authors one scene per rule as keyframes in metres and seconds (attackers +x, first player of each team = keeper) and compiles it into a replay log; `RulebookView.vue` plays the selected rule on the real pitch renderer in a stage at the top (looping via `play()` at `lastTick`), cards below select a rule, deep links from the report still land on the card. Six spatial scenes stayed here after the second pass (§5): five metres · self-pass in the 23 · PC breach · circle rule · penalty corner · rolling subs. Events in the scene drive the renderer's own banners/whistles (PENALTY CORNER, GOAL). No hand-drawn diagrams, consistent with the key-moment thumbnails.

## 5 · After Jan's second pass (same day)

- **The rule scenes froze.** `PitchCanvas` reused one `<canvas>` across scenes; a WebGL context cannot be recreated on an element whose context was destroyed, so the second scene rendered one frame and stopped. Each scene now mounts on a fresh keyed canvas, and the loop moved into the renderer as a `loop` option on `MatchView` instead of a frame-callback rewind. Browser test: the play head wraps at the last frame and a second view runs on a new canvas.
- **A top-down pitch cannot show a backstick.** Rules about the face of the stick, the height of the ball or a card in the umpire's hand are now drawn as a **side elevation** with figures: `lib/ruleFigures.ts` (keyframes in metres and seconds; `sampleScene` and `poseOf` are pure, with 12 tests that hold the hockey claims — the ball above the knee and inside five metres, the rounded side on the ball, the shot crossing above the backboard, the stroke under the crossbar) and `ui/RuleFigure.vue` (SVG, metres → pixels here and nowhere else, a cross-section badge that flips when the stick is turned over, knee line, backboard, a five-metre dimension, a verdict band). Nine rules use it: feet, dangerous play, back-stick, obstruction, stick tackle, the first hit at a corner, the stroke, cards, the aerial. The six spatial rules (five metres, self-pass in the 23, breaking early, the circle rule, the penalty corner, rolling subs) stay on the pitch renderer. Each rule gets the view that shows it.
- **The hub was a dead end without a career.** The nav offered Season / Squad / Tactics / Club with nothing behind them. Those four are disabled without a club now, the club bar becomes a start bar (continue your save · pick your club · new career), and the screen itself says what to start — with the rulebook and the academy called out as open to everyone.
- **Title footer**: the save format, "offline ready" and the language list carried no information. It is the game version plus clickable NL / EN / FR now, and the continue line follows the language.

## Next

- Re-baseline calibration on 96 matches (`pnpm calibrate:run`) and publish calibration.md § 0.7.0.
- The rule scenes use the `half` camera; a dedicated "teaching" camera (D-centred, ~35 m wide, 48°) would frame them better — add to `CAMERAS` when the phone pass happens.
- Phone pass on intro film + rulebook stage.
