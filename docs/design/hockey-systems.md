# Hockey systems — the tactical model the AI is missing

> Companion to **ADR-014** and `adaptive-play.md`. This document comes **first**, and the reason is structural: *an AI can only learn over the actions it has*. Today the defensive action space is `{run at the ball, mark the nearest runner inside our own 23, stand in your formation slot}`. No optimiser, no opponent model and no amount of self-play produces a zonal block out of that vocabulary, because "hold your channel and let the ball go past you" is not an action the engine can express. Systems first, reads second, fitting third.
>
> Everything below is data + one generic resolver — never `if (press === 'full')`. Same discipline as `Profile` (CLAUDE.md rule 5): a system is a record of values, not a branch.

---

## 1. What the engine does today, in hockey terms

`packages/engine/src/ai/brain.ts` · `defend()`:

```ts
const byDist = [...outfield].sort((a, b) => dist(a.pos, ball) - dist(b.pos, ball));
const first = byDist[0], second = byDist[1], third = byDist[2];
```

**The two players nearest the ball press it, always, in every system.** Everyone else either marks (only once the ball is inside our own 23 — `assignMarks` returns empty otherwise) or walks back to a formation slot that has already been shifted towards the ball. Four consequences, all of them visible on the pitch:

1. **The presser is chosen by distance, not by role or channel.** A right half sprints across the pitch to press a ball on the far left because he happens to be a metre closer than the left half. In hockey the presser is the player whose *channel* the ball is in; the far-side half holds the inside slot and the far post. This is the "everyone runs to the ball" you are seeing.
2. **The four press systems differ only in one number.** `PRESS_HEIGHT = { full: 0.9, half: 0.55, split: 0.6, zone: 0.25 }`, plus a small first-defender-angle tweak for `split`. So all four play *identical hockey at four heights*. A zone block is not a low full press — in a zone block **nobody chases**, and that is the entire point of it.
3. **There is no marking outside our own 23**, so a full-court press — which *is* man-to-man over the whole pitch — cannot be expressed at all.
4. **There is no free man and no rest-break**, so a full press has no downside and a deep block has no upside. The risk/reward that makes choosing a system a decision is absent: today "full" is strictly better because it presses higher for free.

`pcDefend()` is thinner still: the defenders standing behind the backline are ordered by id, `i === 0` runs at the top of the D, `i === 1,2` hold the posts, `i === 3` stands wide, and everyone else drifts to `x = -end * 5` and does nothing for the rest of the corner. There is exactly one running-out system, it is chosen for you, and it never changes with what the attack is doing.

The attack has the same shape problem in reverse: `bestOption()` scores passes **to teammates' bodies** (`mate.pos + mate.vel · 0.6`) and never to space; there are no patterns, only staging positions.

**The rules layer is not the problem.** `packages/rules` already enforces the five-defenders-behind-the-backline limit, the rest beyond the centre line, the 460 mm first-hit height, and the whole PC restart placement (`laws.ts`, `placements.ts`, `rules.ts`). Everything below is AI work.

---

## 2. The vocabulary to add

Four concepts a hockey coach uses that the engine has no word for:

- **Lines and channels.** The pitch is three lines (front / mid / back) × five channels (left, left-centre, centre, right-centre, right). A press is a statement about *which line steps and which channel is closed*, not about a distance to the ball.
- **The assignment.** Each defender has exactly one job per phase. Distance to the ball is an *input* to choosing jobs, not the job itself.
- **The free man.** The spare defender with no direct opponent. His presence or absence is what separates a press from a gamble.
- **The rest-break.** The one or two forwards deliberately left high who do not defend. In a deep block they are the reason for the block.

### The assignment type

```ts
/** One defender's job this phase. Recomputed at a decision boundary (~0.4 s), then held (see §4 stickiness). */
type Assignment =
  /** Engage the carrier; `shepherd` says which way we force them. */
  | { kind: 'pressBall'; shepherd: Shepherd }
  /** The safety behind the presser — covers the beaten presser and the pass inside. */
  | { kind: 'cover'; of: PlayerId }
  /** Man-mark; `side` is where we stand relative to the man. */
  | { kind: 'markMan'; target: PlayerId; side: 'goalSide' | 'ballSide' | 'stickSide' }
  /** Hold a zone box (channel × line) and pick up whoever enters it. */
  | { kind: 'markZone'; channel: Channel; line: Line }
  /** Sit in a passing lane rather than on a player — the hockey interception job. */
  | { kind: 'markLane'; from: PlayerId; to: PlayerId }
  /** The spare. No direct opponent; covers behind the line. */
  | { kind: 'free' }
  /** Deliberately not defending — left high for the counter. */
  | { kind: 'restBreak' };

/** Which way the first defender shows the carrier. */
type Shepherd = 'toLine' | 'toInside' | 'toReverse';
```

`toReverse` deserves its own note, because it is the most hockey-specific defensive idea there is and the engine currently has no handedness at all — see §6.

---

## 3. Press systems as data

Replace the bare `PRESS_HEIGHT` scalar with a record per system, in `tactics.ts` next to `FORMATIONS`:

```ts
interface PressSystem {
  /** Which line initiates the press. */
  initiator: Line;
  /** Where the first defender engages, metres from OUR goal (replaces the 0..1 pressHeight). */
  engageXp: Scalar;
  /** What makes the press go. An empty list means "always on". */
  triggers: PressTrigger[];
  /** Which way the first defender shows the carrier. */
  shepherd: Shepherd;
  /** How many players go to the ball (presser included). */
  commit: 1 | 2 | 3;
  /** Marking scheme for everyone who is not on the ball. */
  scheme: 'manToMan' | 'zonal' | 'hybrid';
  /** Is there a spare defender behind the line? */
  freeMan: boolean;
  /** Forwards left high, not defending. */
  restBreak: 0 | 1 | 2;
  /** Metres between our front line and our back line — how compact we are. */
  blockDepth: Scalar;
  /** 0 = hold width, 1 = slide the whole block to the ball's channel. */
  lateralShift: Scalar;
  /** Where we try to win it. */
  trap: 'touchline' | 'centre' | 'none';
  /** What we do when the first press is beaten. */
  recovery: 'sprintBack' | 'dropAndReset' | 'tacticalFoul';
}

type PressTrigger =
  | 'always' | 'backPass' | 'looseTouch' | 'slowOutlet'
  | 'ballToChannel'      // the ball arrives in the channel we want to trap in
  | 'aerialInAir'        // the overhead is up: press the landing zone
  | 'restartInTheir23';  // their free hit out — the classic club press trigger
```

### The four systems, written out

| | **full** | **half** | **split** | **zone** |
|---|---|---|---|---|
| initiator | front | mid | front | back |
| engageXp | ~78 m (their 23) | ~50 m (halfway) | ~62 m | ~26 m (our 23) |
| triggers | `always`, `restartInTheir23` | `ballToChannel`, `slowOutlet`, `backPass` | `always` | `ballToChannel` |
| shepherd | `toLine` | `toReverse` | `toLine` | `toReverse` |
| commit | 2 | 2 | 2 | **1** |
| scheme | `manToMan` | `hybrid` | `hybrid` | `zonal` |
| freeMan | **false** | true | true | true |
| restBreak | 0 | 1 | 1 | **2** |
| blockDepth | ~35 m | ~25 m | ~28 m | ~18 m |
| lateralShift | 0.4 | 0.5 | **0.85** | 0.6 |
| trap | `centre` | `touchline` | `touchline` | `none` |
| recovery | `sprintBack` | `dropAndReset` | `sprintBack` | `dropAndReset` |

**full — full-court press.** Man-to-man from their backline. No spare, nobody rests. *Hockey reason:* you press their outlet to win the ball inside their 23, where a turnover is a circle entry. The price is real and must be modelled: with `freeMan: false`, one overhead over the top (the standard answer, and the engine already has `aerial`) leaves you numerically short goal-side. Today that price does not exist, which is why nothing else is ever worth choosing.

**half — half-court press.** The block sets around halfway; the front line channels, the two nearest options are picked up man-to-man, everyone behind holds zone. One forward rests. The default, and it should be the default.

**split — splitting press.** The first defender closes from the **inside shoulder** so the carrier's only way forward is wide; the whole block then slides across (`lateralShift: 0.85`) and the far side is **abandoned on purpose**. You win it in the traffic on the touchline; you lose it to a clean switch. The current code has the first-defender angle right and the block slide missing — the shift is what makes it a system rather than a stance.

**zone — deep block.** Everyone behind the 23. `commit: 1` is the defining value: only the defender in the ball's channel engages, and **nobody else moves towards the ball**. Two forwards stay high. *Hockey reason:* you concede possession and territory to deny circle entries, and you live off the counter into the space those two forwards occupy. Without `commit: 1` and `restBreak: 2` this system cannot be told from a low half press.

### Variants worth having (your "en varianten")

Each is the same record with different values — no new code:

- **Press with a sweeper** — `full` but `commit: 2, freeMan: true, restBreak: 1`: press high, keep a spare. Less turnover, far less catastrophe.
- **Three-quarter press** — `half` with `engageXp ≈ 62`.
- **Trigger press** — `zone` values plus `triggers: ['restartInTheir23']`: sit deep, but jump their free hit out of the 23. Extremely common at club level and currently inexpressible.
- **Channel press** — `split` with the trapped channel *chosen* rather than fixed: force everything down their weak side. **This is the hook for `ScoutMemory.buildUpSide` from ADR-014 layer B** — the read picks the channel; the system does the rest.
- **Counter-press** — a time-boxed overlay: for `N` seconds after losing the ball above our 23, `commit: 3, scheme: manToMan`, then revert. One timer, and it is what makes a turnover in midfield feel dangerous.
- **Man-to-man in the 23 vs zonal in the 23** — the choice a coach actually makes for defending circle entries. Today `assignMarks` hard-codes greedy man-marking there.

### The resolver

One function, no branches per system:

```
assign(view, rules, system, tactics, scout) -> Map<PlayerId, Assignment>
```

1. Find the carrier and their channel/line.
2. If the system's triggers are not satisfied, nobody presses: every player takes `markZone` for their slot's channel/line, or `restBreak` for the forwards the system leaves high.
3. Otherwise the **channel-owner** of the ball's channel on the initiating line takes `pressBall` (not the nearest player — the owner; nearest is the tiebreak inside the channel).
4. `commit - 1` further players take `cover`, chosen from the adjacent channels on the same or the next line back.
5. The rest are assigned by `scheme`: `manToMan` → nearest-free-first over opponents *sorted by threat* (distance to our goal, then to the ball); `zonal` → their slot's box, shifted by `lateralShift`; `hybrid` → man-mark the two most dangerous, zone the rest.
6. If `freeMan`, the deepest unassigned defender takes `free`.
7. `markLane` is assigned instead of `markMan` when the marker is already inside the lane between the carrier and their man — the interception job, and the reason a good defensive midfielder looks like they read passes.

---

## 4. Marking that stays marked

Two defects to fix at the same time as §3:

**Stickiness.** `assignMarks` is greedy-nearest, recomputed every decision tick, so two defenders swap the same runner back and forth as the geometry wobbles. Real marking hands over only on a **switch condition**: the runner crosses a zone boundary *and* a teammate has been closer by more than ~2 m for more than ~0.5 s. Model it as an explicit hand-off with hysteresis, and log it — a mis-communicated switch is a goal, and it should be a *visible* mistake, not a jitter.

**Where you stand.** `markRunner` puts the defender 1.4 m goal-side and slightly ball-side, always. Three positions are needed, and the system picks:
- `goalSide` — in the D and in the last 23: never let them turn.
- `ballSide` — pressing high: take away the pass, accept being beaten in behind (that is the full press's bet).
- `stickSide` — stand on the receiver's open-stick side so the ball has to come to their reverse. §6.

---

## 5. Penalty corners — the running out

### Defence: four systems, chosen by the coach and by the read

The five behind the line have named jobs: **GK**, **first runner** (uitloper), **left post**, **right post**, **free defender** (trailer). The players beyond the centre line are the second wave and today do nothing — they should be sprinting back for the rebound and the counter the moment the ball is injected.

```ts
type PcDefenceId = 'runnerLeads' | 'keeperLeads' | 'doubleCharge' | 'block';

interface PcDefenceSystem {
  /** Who attacks the striking point. */
  lead: 'runner' | 'gk' | 'both' | 'none';
  /** The runner's LINE — one of the two things he guesses. */
  runnerLine: 'trap' | 'striker' | 'split';
  /** Metres the runner covers before the strike leaves — how early they commit. */
  chargeCommit: Scalar;
  /** Runner's body/stick profile — the other thing he guesses: low blocks the hit, high blocks the flick. Cannot do both. */
  runnerProfile: 'low' | 'high';
  /** Posts hold to the strike, or step on a hit. */
  posts: 'hold' | 'stepOnHit';
  /** The free defender's job: cover a slip side, or the deflector at the top of the D. */
  freeDefender: 'slipLeft' | 'slipRight' | 'topOfD';
  /** Keeper's set. */
  gkSet: 'line' | 'advanced';
}
```

- **runnerLeads** (`lead: 'runner'`, `runnerLine: 'trap'`, `chargeCommit` high, `runnerProfile: 'high'`, GK `line`). The flyer charges the trap spot to arrive as the strike leaves. Beats the straight drag flick by pressure. **Beaten by the slip** (he is committed to a line the ball no longer travels) and by a trap moved a metre sideways.
- **keeperLeads** (`lead: 'gk'`, GK `advanced`, first runner drops onto the line to take the goal). For a quick, confident keeper. Beats the low hit and the close deflection. Beaten by the lift over and by any rebound, because the goal is guarded by an outfielder.
- **doubleCharge** (`lead: 'both'`, `runnerLine: 'split'`). Two runners: one at the trapper, one at the striker or the slip side. Kills slips and hits. **Beaten by the straight flick over the top** — two bodies committed low is two bodies not in the goal.
- **block** (`lead: 'none'`, posts `hold`, GK `line`). Nobody charges; five bodies fill the goal and the near angles. Concedes the clean strike but nothing catastrophic: no beaten runner, no gaps. What you play against an elite flicker with slow runners, or to protect a lead.

**The read/counter-read is the whole point.** Confirmed 2026-08-22: the uitloper guesses **both** his line and his body height, and they are independent. A runner set low is beaten over the top by a flick; set high he is beaten under by the low hit; and whichever height he picks, a slip beats the line he committed to. What he guesses is exactly what `ScoutMemory.pcVariant` and `goalkeeper.pcReading` should decide (ADR-014 layer B), and the attacking coach's counter is to run a variant the defence is not set for. That closes the loop BRIEF §5.5 asks for — *"reusing one variant every time must be punished"* — with a mechanism instead of a modifier.

### The counter matrix — confirmed 2026-08-22: all four systems get played

Jan confirms all four are in use at Belgian club level, so all four ship as data and **the coach picks one**: a `pcDefence: PcDefenceId` knob in `TeamTactics`, next to `pcVariant` and `pcBattery`, and a second control in the Phase 7 PC designer (you already design the battery there; you should be able to set up the defence of one too).

Four systems that all get played only stays interesting if none of them dominates. This is the mechanism the engine has to produce — not a table of modifiers, but the *outcome* of the geometry above. Written out as what the engine should therefore make happen, so that §8 can assert it:

| | **runnerLeads** | **keeperLeads** | **doubleCharge** | **block** |
|---|---|---|---|---|
| **dragFlick** | defence, *if the runner is set high* | **attack** — lift over an advancing keeper into the corner | **attack** — two bodies committed forward are two bodies not in the goal | even; the elite flicker wins, the average one does not |
| **lowHit** | the profile bet: runner low → defence, runner high → **attack** under him | defence — an advanced keeper covers low well | **defence** — two low runners smother it | defence, but the rebound is live |
| **slipLeft / slipRight** | **attack** — the runner is committed to a line the ball no longer travels | attack — the keeper is committed centrally, the slip opens the angle | side-dependent: covered if the second runner guessed the right side, beaten if not | even — no one is committed, but the slip has the angle |
| **deflection** | attack — the charge is at the striking point, the ball never goes there | **attack** — the goal behind an advanced keeper is empty | attack — the posts are thin | **defence** — held posts are exactly what a deflection runs into |

Read down the columns and each system has a hole: `runnerLeads` dies to slips and deflections, `keeperLeads` dies to anything lifted or wide, `doubleCharge` dies to the straight flick over the top, and `block` wins nothing — it concedes the clean strike in exchange for never being caught out. That last one matters: a safe passive option that is *not* dominated is what makes the choice a coaching decision rather than a solved one.

**The magnitudes are calibration's job, not mine.** This matrix is a set of *signs*, and §8 asserts the signs. The actual conversion numbers come out of `pnpm calibrate:run` against the PC targets and must stay inside the band whichever system the AI is playing.

**Not every club can play every system.** The choice should be gated on whether the players exist, the way it is on a real touchline:

- `runnerLeads` needs a genuine flyer — `physical.pace` + `physical.acceleration`, and `mental.aggression` over `mental.discipline` to actually go. A slow first runner playing this is worse than a block.
- `keeperLeads` needs `goalkeeper.oneOnOne` and `goalkeeper.pcReading`; a hesitant keeper caught halfway is the worst outcome on the list.
- `doubleCharge` needs two runners, so it costs a body somewhere else.
- `block` needs nothing — which is why it is the right default for a weak side and the honest fallback when the AI has nobody for the other three.

The AI's default choice per club is therefore attribute-driven, and the *switch* mid-match is `ScoutMemory`-driven (ADR-014 layer B): a side that has conceded twice to slips stops charging.

Also required, and missing today:
- The runner must **not leave before the ball is played** (the rules layer holds the restart; the AI must not walk out early).
- The **posts hold until the strike, then close** on the rebound. A post who steps early is why slips score.
- The **second wave** (players beyond the centre line) sprints back on the injection.
- The **GK sets differently for a PC** than in open play — `goalkeeper()` is currently the generic angle-line positioner. `gkSet`, `pcReading` and `gkSaveScale` belong here.

### Attack: the battery is a sequence, the rest is a pattern

`pcAttack` already does the hard part well — roles fixed per corner, injection speed computed for a stoppable trap, five variants, slip handling, the scripted-moment guard against open-play logic stealing the ball. Three gaps:

1. **The runners are four fixed spots** (`spots[i % 4]`). They should be a pattern per variant: near-post deflector, far-post runner, top-of-D rebounder, trailer — and for `deflection` there is currently *no deflector making contact*, which means the variant is a straight strike with a different name.
2. **No read of the defence.** The attack should see `lead`, `runnerLine` and the runner's height in the same way the defence reads the variant: charge coming down the middle → slip; runner set low → flick over; posts stepping → flick over; block → take the extra half-second and pick a corner.
3. **The rebound is not a phase.** Most PC goals at club level are second-phase. The trailer and the top-of-D rebounder need to be arriving, not standing.

---

## 6. Handedness — confirmed 2026-08-22: its own phase, full scope

Every stick is right-handed. The engine knows no difference between left and right anywhere: `grep -n "reverse\|openStick\|handed"` over `packages/engine` and `packages/rules` returns only array reversals. Jan has chosen the full version, so this is a phase of its own (11b — phase 10 is the commercial redesign that landed on main) rather than a note.

**The one idea:** a player's **open stick side is their right**, their **reverse is their left**. Everything below follows from that, and every one of them is an *input* to physics, never a change to physics (Phase 3's rule: attributes scale physics inputs).

### What it touches

1. **The pressing angle.** `shepherd: 'toReverse'` becomes real: the first defender closes the carrier's open-stick channel so the only way forward is on the reverse. This is why hockey pressing angles are not football pressing angles, and it is what §3 gives `half` and `zone`.
2. **The tackle side.** A tackle from the carrier's open-stick side is the clean one; coming across the body from the reverse side is where `obstruction` and stick offences come from. The rules layer **already has the vocabulary** — `FoulKind` carries `obstruction` and `backStick` (`packages/rules/src/types.ts`) — and the AI has never been able to trigger them from a wrong-side tackle, because there is no side. Wiring the side in gives `mental.discipline` and `mental.aggression` a genuine hockey consequence, and it is the *right cause* for the PC shortfall in open question 18 (6.4 awarded vs ≈ 9 real): club-level corners come from stick tackles and feet in the D, not from an abstract foul rate.
3. **Receiving.** A ball arriving on the reverse costs a touch: `firstTouch` and `trapping` are scaled by which side it comes from. A good player opens up onto their forehand; a weak one lets it run. This is where the turnover rate of the amateur game actually lives.
4. **Carrying and eliminating.** `technical.elimination` and `skills3d` on the reverse are harder than on the open stick — so shepherding a carrier onto their reverse pays off in the value function, not just in the picture.
5. **Striking.** The reverse hit is weaker and less accurate than the forehand: `strikeSpeedFactor` gains a side term, and the AI prefers to take the extra step to get the ball onto its forehand when it has time.

### What it does not touch

- **Physics.** No new forces, no stick model. Sides scale attribute-derived inputs.
- **Left-handed players.** They do not exist in hockey; there is no attribute for it and there must not be one.
- **The keeper.** A keeper's stick-side/pad-side asymmetry is real but small next to `gkSaveScale` (open question 19) and would muddy that already-provisional knob. Left out of this phase deliberately; revisit when defensive organisation is modelled.

### Why it is worth a phase even though it is invisible

It will not show up on screen — capsules do not have hands. It shows up in the **numbers and in the shapes**: where defenders stand, which way attacks are funnelled, how many corners are won and why. That is the half of "does this look like hockey" that a coach judges from the pattern of play rather than from the sprites.

---

## 7. Attacking play

**Build-up and outlet.** `shapeTarget` already gets the important one right (backs out of their own D, the 23 m outlet shape). Missing:
- **Up-back-through** — the defining hockey combination: play into a pressed forward, he lays it back first-time to the free man, who plays through the line the press has just vacated. Needs a two-pass intention, which means the carrier must be able to plan one pass ahead. This single pattern is what makes a build-up look coached.
- **The switch** — through the free man / centre back, to the channel the opponent's `lateralShift` has abandoned. The direct counter to a split press, and it should be the AI's answer once `ScoutMemory` sees a trap side.
- **The overhead as a system**, not an exception: the standing answer to a full press.

**Passing into space.** `bestOption` only ever passes to a teammate's projected body position at 0.6 s. Add candidate targets that are *points in a channel ahead of a runner*, scored by a pursuit test — can our runner reach it before the nearest defender, given both players' `maxSpeed` and the ball's arrival time. This is the difference between passing to feet and playing someone in.

**Circle entry patterns.** The attacking twin of press systems, as data:

```ts
type EntryPatternId = 'baseline' | 'switchAndSlip' | 'deepDiagonal' | 'drawTheFoot' | 'overload';
```

- **baseline** — beat the back on the outside, get to the backline, **pull back** to the spot where runners arrive. The largest goal source in the modern game, and the engine has no explicit mechanism for it; the value grid's 0.62 floor for the deep-wide pocket is a hint, not a pattern.
- **switchAndSlip** — circulate across the top of the D to drag the block, then slip in behind the collapsing defenders to the far post.
- **deepDiagonal** — early ball into the far-post pocket for a deflection.
- **drawTheFoot** — implemented, and correctly (`uFeet = 0.85 - 0.55 * q`).
- **overload** — take the free side after the opponent's split press has slid across.

Each pattern names a carrier role, one or two runners and a trigger; the AI picks by expected value from the value grid, and the runners leave **before** the pass (layer D4 in `adaptive-play.md`). Patterns are also the natural unit for the coach's build-up instruction and for what an opponent scouts.

---

## 8. Tests — hockey assertions, not magic numbers

Relational, because absolute numbers are calibration's job (CLAUDE.md rule 8):

| Claim | Test |
|---|---|
| A zone block does not chase | ball at their 23, system `zone`: at most **one** of our outfielders within 5 m of the ball; back four inside an 18 m band |
| A full press is man-to-man | system `full`: every opponent outfielder in our half has a marker within 3 m |
| A full press is a gamble | a completed overhead over a `full` press produces a measurable goal-side overload; the same aerial vs `zone` does not |
| A split press abandons a side | system `split`: the weak-side winger is > 15 m from the ball's channel; recoveries concentrate in the strong-side channel |
| Marks stay marked | mark changes per attacker per possession below a stated bound; no two defenders on the same runner for more than one decision tick |
| Shepherding works | vs `toReverse`, the carrier's forward progress on their open stick falls |
| The reverse costs you | a pass arriving on the receiver's reverse yields a worse first touch and more turnovers than the same pass on the forehand, at equal `firstTouch` |
| Tackle side matters | tackles from the carrier's open-stick side succeed more and concede fewer `obstruction` / stick fouls than tackles across the body |
| Handedness moves PCs at the right cause | with tackle sides wired in, awarded PCs per match rises towards the calibration target without touching an abstract foul rate |
| The PC counter matrix holds | every sign in the §5 matrix, as a relational test over batched corners: e.g. `slipLeft` converts better vs `runnerLeads` than vs `block`; `deflection` converts better vs `keeperLeads` than vs `block`; `lowHit` converts better vs a `high` runner than a `low` one |
| No PC defence system dominates | over the five variants at equal quality, no system has the best conversion conceded against all five — each has at least one variant it loses to |
| A system needs its players | `runnerLeads` with a slow first runner concedes more than `block` with the same squad |
| The runner is legal | no defender crosses the backline before the injection, in any system |
| The baseline pattern is real | shot quality from a completed pull-back exceeds a shot from the same distance at the top of the D |

And the situational deck gains scenarios named for what they test: `press-full-beaten-by-overhead`, `press-split-switch`, `zone-block-counter`, `pc-defence-block-vs-flick`, `pc-slip-vs-charge`, `entry-baseline-pullback`, `up-back-through`.

---

## 9. Where this sits in the plan

`adaptive-play.md` ordered the work D → B → A → C. This document inserts itself as the new first item, and it changes what layer B is *for*:

| Phase | Content | Why in this order |
|---|---|---|
| **11 — Systems** | §2–§4 assignments + press systems as data; §5 PC defence systems; §7 entry patterns | the action space. Nothing can read or learn without it |
| **11b — Handedness** | §6, full scope: pressing angle, tackle side, receiving, carrying, striking | confirmed as its own phase. It makes every pressing angle read correctly and is the right cause for the PC shortfall (question 18) |
| **12 — Naturalness** | `adaptive-play.md` layer D | commitment, softmax, anticipation, timed runs — now applied to real assignments |
| **13 — Reads** | layer B (`ScoutMemory`) | reads *choose between systems and variants*: trap channel, PC runner line and height, entry pattern |
| **14 — Fitting** | layer A (`PolicyWeights`, `pnpm fit`) | fit the utility weights **and** the system parameters against calibration |
| **15 — Season** | layer C | familiarity is now per *system* (§3), which is exactly what a squad drills |

Two things fall out of this ordering that are worth stating plainly. **Familiarity becomes meaningful**: a squad that has drilled the split press for two seasons executes the slide tightly, and switching them to a full press in July costs them for months — that is only expressible once systems exist as objects. And **calibration gets a new lever at the right cause**: open questions 18 (too few PCs — the AI under-fouls in the D) and 20 (quality spread) are both defensive-behaviour problems, and §4's marking positions and §6's tackle sides are where a coach would actually look for them.

## 10. For Jan — answered

Per CLAUDE.md rule 9, three modelling readings were put to Jan rather than invented. All three are now closed.

1. ~~**The four press systems in §3**~~ — **confirmed 2026-08-22.** The names and shapes stand as written, `split` included (first defender from the inside shoulder, block slides, far side conceded). The variants listed under §3 stay my proposal; they cost nothing but values, so they can be added or dropped when the systems are built.
2. ~~**PC defence systems in §5**~~ — **confirmed 2026-08-22: all four are played**, and **the uitloper guesses both his line and his body height.** `runnerLine` and `runnerProfile` are therefore two independent choices, which is what keeps each of the four systems holding its own weakness. All four ship as data and the coach picks one (`pcDefence` in `TeamTactics`, a control in the PC designer), gated on having the players for it. The counter matrix in §5 stands as written.
3. ~~**Handedness in §6**~~ — **confirmed 2026-08-22: its own phase, full scope.** Pressing angle, tackle side, receiving, carrying and striking; keeper asymmetry deliberately excluded. See §6.

**Nothing in this document is now waiting on a hockey answer.** What it is waiting on is ADR-014's acceptance and a decision on order and timing — see `adaptive-play.md` and the phase table in §9.
