# Ruleset — the FIH outdoor laws as the engine implements them (Phase 2)

Source of truth: `packages/rules`. Every row names the law, how it is detected/applied, where it is tested (positive **and** negative), and whether the implementation is **PROVISIONAL** (a reading Jan must confirm — see the list at the end). Constants live in `laws.ts` (`FIH_OUTDOOR`), never in code.

Coordinates: home (team 0) attacks +x / the east goal (`end = +1`); away attacks −x. All distances metres, all times ticks (20 Hz).

| Law | Implementation | Tests |
|---|---|---|
| **Match structure** — 4 × 15 min quarters; breaks 2 / 10 / 2 min; playing time only advances while the clock runs | `RulesState.phase/quarter/clockTicks/matchClockTicks`; `startQuarter`, `endQuarter`; break is a `waitTicks` countdown (real time, not playing time) | `quarters and clock` ×3 |
| **Centre pass** — starts each quarter (alternating teams) and after every goal (by the conceding team); all players in own half | `award('centrePass')`, `centrePassTeamForQuarter`, `placementsFor` moves violators into their own half; clock stopped until the pass is taken | `quarters and clock`, `circle rule › positive`, engine `match.test` |
| **Clock stoppage** — time stops at PC and PS award and after a goal (40 s set-up windows in real hockey; sim idles `setupTicks`); time runs through ordinary free hits | `award()` sets `clockRunning=false` for centrePass/PC/PS only; `takeRestart` restarts it | `quarters and clock › negative`, `cards › negative` |
| **End of quarter with PC/PS in progress** — completed before the whistle | quarter-end check requires `!pcActive && !psActive && !restart` | `quarters and clock › four quarters` |
| **The circle rule (goal)** — the ball must be played by an attacker inside the circle before crossing the goal line; a defender's deflection afterwards still counts | `attackerTouchInCircle[end]` set on attacker strike/trap with the ball in the circle; cleared on circle exit — but circle exits are applied **after** the goal decision, because crossing the backline is also "leaving the circle" | `the circle rule` ×3 |
| **Goal → restart** — centre pass by the conceding team; score updated; `fromPC/fromPS` flagged | `scoreGoal` | `circle rule › positive`, engine `match.test › goals` |
| **Ball over the sideline** — free hit to the non-touching team on the line where it crossed | `sidelineCrossings` → `award('freeHit', ..., {x, ±(HW−0.3)})` | `ball out of play › sideline` |
| **Ball over the backline** — off an attacker: defence free hit up to 15 m out ("hit-out"); off a defender unintentionally: long corner on the 23 m line, in line; off a defender intentionally: PC | `goalLineCrossings` + `lastTouchTeam`/`lastTouchKind`; intent heuristic PROVISIONAL (defender's own stick from inside their circle = intentional) | `ball out of play › backline` |
| **Feet / body** — outfield player plays the ball with body → offence; goalkeeper may use body inside own circle | `bodyContacts` (physics `BallCollision{player}`) → `feet` foul unless GK in own circle; PROVISIONAL: "advantage" not modelled — every outfield contact is an offence | `fouls › feet` |
| **Where the free hit is taken** — offence by defender in own circle → PC; by attacker in the circle they attack → defence free hit ≤15 m out; elsewhere → free hit at the spot | `awardFoul` | `fouls › feet` (PC), `dangerous play › own 23 m` |
| **Penalty stroke** — defender's offence in the circle preventing a probable goal | PROVISIONAL heuristic: outfield defender's body contact in own circle on a ball whose straight-line path crosses the goal line inside the posts, speed > 3 m/s → PS + yellow card | `fouls › penalty stroke` (+ negative "not goal-bound → PC") |
| **Dangerous play** — a raised ball at an opponent within 5 m above knee height (thresholds PROVISIONAL: 0.5 m, 5 m, ±35°) → free hit / PC if by a defender in own 23 m; green card | `struck.lift > 0.05 || aerial || flick` + `opponentInLine` + `projectedHeight` | `fouls › dangerous play` ×2 |
| **Back-stick** — playing the ball with the rounded side | `struck.face === 'round'` (an input attribute; AI/tests choose it) | `fouls › back-stick` |
| **Free hit: 5 m** — opponents at least 5 m away | `placementsFor` moves violators to 5.2 m along the ball→player vector | `free hits › opponents within 5 m are moved` |
| **Self-pass** — the taker may play the ball again | nothing prohibits it; test asserts no foul | `free hits › self-pass` |
| **Free hit inside the attacking 23 m** — ball must travel 5 m or be touched by another player before entering the circle (PROVISIONAL wording) | `pending23` tracker set in `takeRestart`; foul on `circleEntries` if not satisfied | `free hits › attacking 23 m` (+ negative) |
| **Gating** — nobody plays a dead ball; only the restart team plays a pending restart; PS: only the taker, and only a strike; suspended players never | `gateCommand`, called by the engine before physics for `strike/trap/substitute` | `free hits › negative (gate)`, `penalty stroke`, `cards` |
| **Penalty corner — award & set-up** — ball on the backline 10 m from the nearer post (side of the offence); ≤5 defenders (incl. GK) behind the backline, the rest beyond the centre line; attackers outside the circle; injector at the ball; clock stopped | `awardPc` → `award('penaltyCorner')` → `placementsFor` | `penalty corner › award` |
| **PC — taken** — clock resumes on injection; injection is not a "shot" | `takeRestart` (+ `takenThisTick` guard) | `penalty corner › taken` |
| **PC — first hit height** — a first *hit* shot at goal must cross the goal line ≤ 460 mm; drag flicks/deflections may be higher (subject to danger) | `pcFirstShot` = first attacker strike from inside the circle after injection; on `inGoal` crossing with `kind==='hit' && z > 0.46` → `pcHighFirstHit` foul, PC ended `foul` | `penalty corner › taken` (both branches) + `low first hit is a goal` |
| **PC — end** — goal, cleared out of the circle (>5 m beyond it), ball out, foul, or upgraded to a stroke | `endPc(outcome)`; `PenaltyCornerEnded` event | `penalty corner`, engine `match.test › PCs balanced` |
| **PC — substitutions** — none between award and completion, except the goalkeeper | `gateCommand('substitute')` | `penalty corner › substitutions` |
| **Penalty stroke — set-up & taking** — ball on the spot (6.40 m), GK on the goal line, everyone else beyond the 23 m; taker strikes once (push/flick) | `awardPs`, `placementsFor`, `gateCommand`; goal → `fromPS`; miss over the backline → PS over, defence hit-out | `penalty stroke` ×2 |
| **Cards & suspensions** — green 2 min, yellow 5 min (serious 10), red rest of match (durations PROVISIONAL for the Belgian league); suspension is *playing* time; team plays short | `issueCard` → `suspend` ruling (engine: `onPitch=false`, dugout) → `reinstate` when `matchClockTicks ≥ until` | `cards and suspensions` ×2, engine `match.test › cards` |
| **Persistent fouling** — umpiring heuristic: 3rd personal foul → green, 5th → yellow (PROVISIONAL) | `laws.persistentFoul{Green,Yellow}At` | `cards › persistent fouling` |
| **Rolling substitutions** — unlimited; at the halfway dugout; blocked during a PC (except GK) | engine `substitute` command; `gateCommand`; players teleport to/from the dugout (Phase 3 AI runs them off) | engine `match.test › substitutions never exceed 11` |
| **No offside** | nothing to implement — and nothing implemented | — |
| **Obstruction, stick tackle, third-party** | **not yet detectable** — needs Phase 3's tackle/duel model. `FoulKind` reserves `obstruction`, `stickTackle`. | — (listed as Phase 3 debt) |
| **Above-shoulder play, aerial receiving rules, GK equipment rules, shoot-outs** | Phase 3 (AI-dependent) / Phase 6 (shoot-outs; `laws.shootOutTicks` reserved) | — |

## Provisional readings for Jan to confirm

1. **Green/yellow durations** in the Belgian league (2 / 5 min; 10 for serious yellow). Also whether repeated green → yellow automatically.
2. **Free hit inside the attacking 23 m**: current wording — must the ball travel 5 m *or* be touched by another player before entering the circle? (Implemented as either.)
3. **Intent on a defender's ball over their own backline**: implemented as "own stick from inside their circle = intentional → PC; anything else → long corner". Real umpiring judges the *deliberate* act.
4. **Feet/body advantage**: every outfield body contact is an offence today; real umpiring plays advantage. Phase 3 AI will avoid feet, which changes the frequency; calibrate then.
5. **Penalty stroke heuristic**: outfield defender's body stops a goal-bound ball in the circle. Real law: any offence preventing a probable goal, or intentional in the circle.
6. **Dangerous-play thresholds**: knee height 0.5 m, 5 m range, ±35° cone; a PC drag flick is exempt from the danger check (only the first-hit height rule applies).
7. **Centre pass alternation** by quarter (Q1 toss winner, then alternating).
8. **Set-up windows** as sim idle: 40 s in real hockey for PC/goal; `FIH_OUTDOOR` uses 3–6 s of sim idle (`setupTicks`) because the playing clock is stopped anyway; `FIH_OUTDOOR_FAST` shorter still for batch runs.
9. **PC "cleared"**: ended once the ball is >5 m outside the circle. Real rule: the PC is over when the ball travels >5 m outside the circle *or* … (several conditions). Simplified.
