# Phase 11c handoff — penalty-corner defence systems and circle-entry patterns

**Shipped 2026-10-10.** Engine **0.10.0**, sandbox golden `6820f5faef893ae8`, save format **v6**. Jan's brief: *"realisme hockey game play moet verbeterd worden / correctheid plays en pc's moet naar omhoog, ook de coach academy."* This is the other half of `docs/design/hockey-systems.md` (§5 and §7), shipped together as the Phase 11 handoff insisted — the defence got four ways to run out, the attack got five ways into the circle, and neither alone would have stayed in band.

## What was built

### The running-out (§5) — `PC_DEFENCES` in `ai/tactics.ts`, `pcDefend` in `ai/brain.ts`

Four systems as data, never a branch: **runnerLeads** (the flyer charges the trap spot, upright, stick up), **keeperLeads** (the keeper comes out low to the striking point; the flyer takes the goal line), **doubleCharge** (two chargers, the second on the slip side the system guesses; the free defender is the body it spends), **block** (nobody charges; posts inside the frame lying low, two upright blockers in front of the keeper). Each is `lead / runnerLine / chargeCommit / runnerProfile / posts / freeDefender / gkSet`.

- **The castle has names** and is fixed once per corner like the battery: flyer (the man who can actually fly — pace, acceleration, aggression over discipline), second, near post, far post. Posts stand *on* the posts (2.3 m), not inside the goal — a body inside the frame caught balls with its hip and gave strokes.
- **Nobody leaves before the injection**, and the halfway five now really stand beyond the centre line (the old sign put them in their own half, which no umpire allows). Pinned by test.
- **The coach picks the system** (`pcDefence`) on the tactics board and from the bench, and may pin the flyer's height (`pcRunnerProfile`). **AI clubs pick theirs from the squad** (`pcDefenceFor`: a flyer → runnerLeads, two → doubleCharge, a reading keeper → keeperLeads, nothing → block), resolved per match day in `season/matchday.ts` (`pcDefenceOf`) so the scouting report and the match agree.
- **The flyer's height is a real engine quantity.** `Posture` on the move command (`match/commands.ts`): a `low` body is a wide, low barrier (1.1 m radius, 0.4 m high, stick along the turf — 60 % of what reaches it meets the stick) that a lifted ball clears; a `high` body is a narrow upright man (0.3 m) with the stick up to 1.3 m whose stick is off the floor for the ball along the turf. The advancing keeper comes out `low` and is lifted over (`gkSetFactor`).
- **A stick in the air is a guess** (`STICK_IN_AIR_*` in `match.ts`): a lifted ball above 0.5 m at pace is touched 45 % of the time and only within 0.6 of the reach. That is what makes *arriving early* a thing — near the striker the two corners are a stride apart, near the goal a metre either side of the man.

### The battery (§5, attack) — `pcAttack`

- **The injection is a firm slap arriving at ~12 m/s and the stop is drilled** (a trap bonus for the trapper at a corner in `match.ts`). The whole sequence takes ~1.5 s instead of 3. This single change was the root of every runner problem: at 3 s the flyer stood on the striker's toes and every flick hit his shin.
- **Runners per pocket, assigned to the man nearest each pocket** so no route crosses the shooting lane; the far-post runner stands off the far-corner lane unless the ball is for him; the "clearest lane" aim counts teammates as blockers.
- **The deflection is a pass that gets touched**: the deflector meets it on its line and lifts it over the keeper from 5.5 m. Before, "deflection" was a straight strike with a different name.
- **The slip is a weighted push to a hitter inside the circle** who stops it and strikes; slip-right converted 0.03 until the battery's stopped-ball strikes were exempted from the reverse-stick penalty like every other set piece.
- **The rebound is a phase**: once the first strike has gone the rebounder and trailer arrive on the second ball; the striker stands off the trapper, not off a chalk mark.
- **`aimFrom`**: a strike is aimed from where the stick will meet the ball (the ball if it is in front of the body, else half a stride ahead — the engine brings it round). From 5 m, a metre of launch point is a metre at the post; this took the deflection from never scoring to 0.20.

### The way into the circle (§7) — `ENTRY_PATTERNS`, `entryPattern`, `pursuitWins` in `ai/brain.ts`

- **Five patterns as data** — baseline (pull-back to the spot), switchAndSlip (far post behind the collapsing block), deepDiagonal (early ball to the far-post pocket), drawTheFoot (the ball at the defender's feet, runner at the rebound), overload (the weak side after the block has slid) — each a runner role, a pocket (`entryPocket`), a trigger scored against the picture, and whether the entry ball is a pass to the pocket. The AI scores all five by trigger × pocket value × space, commits for three seconds, and **the runner leaves before the pass** (adaptive-play.md layer D4). The coach's `entry` is a thumb on the scale (×1.4), not an order.
- **Passing into space**: pass candidates to a *point* — the pattern's pocket, or ahead of any teammate already sprinting forward — kept only if the runner wins the pursuit against the nearest defender given both their pace and the ball's arrival. The pull-back from the baseline pocket to the spot gets its own term, because an entry-ball term cannot see a ball from inside the D to inside the D.
- **Up-back-through** as two windows: a man who received under pressure in the last 0.6 s gets a lay-back bonus to an open man behind; the man he lays it to gets a through-ball bonus for 1.5 s on anything past where the pressed man stood.

### The coach academy and the report

- Academy **penalty corner**: four new steps (runner leads, keeper leads, double charge, the block), each a behind-goal diagram with the real geometry. Academy **circle entry**: deep diagonal, weak-side overload, passing into space. NL/EN/FR, continuity test green.
- Tactics board: **UITLOOPSYSTEEM** chips with a one-line "why" per system, **UITLOPER** low/high/as-the-system, **WEG NAAR DE CIRKEL** pattern chips (auto = read the picture). Bench: the running-out system is a touchline call too.
- Scouting report: *"Bij een strafcorner tegen lopen ze uit met … — het gat zit bij …"* (`counterTo`). Post-match finding **pcDefenceLeaks** (two or more corners conceded) with a hint into the academy.

## Calibration

`docs/rules/calibration.md` §"Penalty-corner systems and entry patterns (engine 0.10.0)". Headline: men 5.68 / 6.00 / 5.29 goals over three seed sets (two of three measured-all-pass), women 3.69 / 3.65 (both pass); PC conversion 0.20–0.24 (men) / 0.14–0.15 (women); PC share 0.33; Poisson shape green. `gkSaveScale` 1.84 → **1.70** (men), 1.88 → **1.69** (women) — the provisional knob shrinking again as a real mechanism lands. PCs per match fell 9.5 → 7.8 because the old late runner was hit every other corner and each re-award counted as a corner; the new flyer is a narrow body and the count is honest.

**The counter matrix measured** (30 sequences per cell, re-awards included): flick 0.30/0.30/0.37/0.40 vs runnerLeads/keeperLeads/doubleCharge/block; low hit 0.20/0.10/0.07/0.17; slip-left 0.27/0.40/0.53/0.33; deflection 0.20/0.13/0.00/0.03; flyer low → flick 0.43, hit 0.10; flyer high → flick 0.30, hit 0.20. No column is the best answer to every row.

## What surprised me

1. **Everything was downstream of the injection speed.** Three seconds from injection to strike made a flyer with ordinary legs arrive on the striker's toes; the "runner problem" was a battery problem.
2. **A late runner still blocks.** With the whole castle slowed to a walk, runnerLeads conceded *less* than with quick flyers over 40 sequences — the late man stands where lifted balls are at a trappable height near his own goal, and the quick man's shin gives re-awards. The spec's row "slow flyer is worse than block" is therefore **not asserted as an outcome**; what is asserted is who gets to play what (`pcDefenceFor`). Worth a look in the reads phase: a reaction-time model for the stick in the air would make earliness bite harder.
3. **Seed chaos masquerades as response.** Between `gkSaveScale` 1.72 and 1.70 the seed-42 men's goals moved by 0.4; across three seeds at 1.70 they span 5.29–6.00. Never tune the scale against one seed set.
4. **Pocket passes count as shots.** `isShot` is "struck inside the D aimed within ±4.8 m of the goal", so a pass into the far-post pocket reads as a shot. Shots now sit at the top of their (estimated) band for that reason, not because the AI shoots more.
5. **The umpire's placement lands a tick after the roles are set.** Pocket assignment from the pre-placement picture sent a midfielder standing outside the D to the far post; it is now re-resolved every waiting tick and frozen at the injection.

## Open questions for Jan

- **A lifted ball into a defender on the goal line.** A flick at a PC is exempt from the dangerous-play call, so a post man hit on the chest at 1.7 m simply blocks the shot — the ball bounces off and play goes on. In the real game a body block of a goal-bound ball on the line is a stroke whatever the height. Is that the reading you want? (Kept as is; it would raise strokes, which already sit at 0.33–0.53 per match.)
- **How often should a corner be re-awarded?** The old sim re-awarded every other corner; the new one far less. Real club hockey is somewhere around one in six or seven.

## What the next phase should watch

- The **reads phase** (§9: layer B) now has its objects: `pcRunnerProfile` and `pcDefence` are what `ScoutMemory` should decide for the defence, and the variant against the system (`counterTo`) for the attack. Reusing one variant every time is still not punished mechanically — only the scouting report names the hole.
- The flyer's **posture is not in the frame log**, so the viewer draws him upright. A frame-stride change (replay format) is the cost; worth it when the renderer gets poses.
- `tmp-*.ts` harnesses in the repo root were deleted; the batched-corner harness is reproduced in `ai/pcDefence.test.ts` (`corner`, `conversion`). Run it with `-t` to re-measure a single claim.

## Files

Engine: `ai/tactics.ts` (PC_DEFENCES, pcDefenceFor, ENTRY_PATTERNS, entryPocket, TeamTactics fields), `ai/brain.ts` (pcAttack/pcDefend/pcKeeper rewrite, AttackState, entryPattern, pursuitWins, aimFrom, lay-back/through windows, moveTo posture), `ai/pcDefence.test.ts` (new), `match/commands.ts` (Posture), `player/player.ts` (posture), `match/match.ts` (posture colliders and reach, stick in the air, drilled stop, PC first-strike spray, gkSetFactor, battery forehand), `profile.ts` (gkSaveScale), `constants.ts` (0.10.0), `sim/golden.ts`, `sim/scenarios.golden.json`. Season: `save.ts` (v6), `matchday.ts` (pcDefenceOf), `index.ts`. Insight: `scout.ts` (pcDefence line, counterTo), `analyse.ts` (pcDefenceLeaks), `index.ts`. Manager: `components/TacticsView.vue`, `components/CoachView.vue`, `lib/academy.ts`, `i18n/{nl,en,fr}.json`. Docs: this file, `docs/rules/calibration.md`, `docs/design/hockey-systems.md`, `KICKOFF.md`.
