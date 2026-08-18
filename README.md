# BULLY OFF

A field hockey game for the web: a deterministic, headless match simulation engine in TypeScript, driving a coach/manager campaign (the product) and, later, a top-down arcade match. Fully fictional world. Static site, offline-capable PWA. NL / EN / FR.

The point is **hockey-accurate simulation** — circle rule, penalty corners, rolling substitutions, cards, four quarters, wet vs dry turf — in a sport every existing game models as "football with different rules". It is not.

> Status: **Phase 3 — players and AI — built, gate awaiting the coach's verdict.** Done: deterministic 2.5D engine with swept collisions (Phase 1); the full FIH rules layer (Phase 2); attributes, the circle-warped value function, a utility AI with goalkeeper, tackles, a penalty-corner battery and rolling subs, plus the §6.2 scenario fixtures (Phase 3). `pnpm simcli match --matches 5` plays five AI matches in ~7 s. See [`KICKOFF.md`](KICKOFF.md).

## Documents

- [`BRIEF.md`](BRIEF.md) — the full product & architecture brief (constraints, scope, phases, gates)
- [`CLAUDE.md`](CLAUDE.md) — operating rules for the AI lead engineer
- [`KICKOFF.md`](KICKOFF.md) — current phase, gate, open questions
- [`docs/adr/`](docs/adr/README.md) — architecture decision records (13)
- [`docs/handoff/`](docs/handoff/) — per-phase handoff notes

## Layout

```
packages/shared    types, seeded RNG, deterministic math, SI units — depends on nothing
packages/rules     FIH ruleset as data + predicates
packages/engine    headless deterministic sim: tick(state, inputs) → state, MatchEvent[]
packages/worldgen  fictional clubs, players, leagues, 20 seasons of history
packages/render    PixiJS view layer — reads event logs only
apps/manager       Vue 3 + Pinia — the coach/manager product
apps/simcli        Node CLI — batch simulation for calibration
apps/arcade        v1.x — deliberately empty
tools/calibrate    compares sim aggregates with real-world targets
```

## Develop

Requires Node ≥ 22 and pnpm 10.

```bash
pnpm install
```

```bash
pnpm check
```

`pnpm check` = typecheck + lint + test, and must be green before any phase handoff. Other scripts: `pnpm build`, `pnpm dev:manager`, `pnpm simcli match --matches N` (AI matches), `pnpm simcli scenario list|<id>` (§6.2 fixtures as text logs), `pnpm test:watch`, `pnpm test:browsers` (cross-browser determinism; run `pnpm browsers:install` once).

## Ground rules (short)

- Engine has zero runtime deps, no `Math.random`/`Date.now`/DOM/timers, no `Math.*` transcendentals — ESLint enforces it.
- Same seed + same inputs ⇒ byte-identical event log. Always.
- No real people, no real clubs, ever. See ADR-006.
- SI units everywhere except `packages/render`.
