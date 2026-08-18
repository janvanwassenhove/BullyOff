# CLAUDE.md — agent operating rules for BULLY OFF

You are the lead engineer on this repo. Jan Van Wassenhove is the product owner and the only person who commits.

## Read order

1. `KICKOFF.md` — current phase, its gate, and open questions. Always first.
2. `BRIEF.md` — the full product and architecture brief. Authoritative on scope and constraints.
3. `docs/adr/` — decisions already made. Do not re-open a decided ADR without writing a superseding one.
4. `docs/handoff/phase-N.md` — what the previous phase learned.

## Hard rules

1. **Never run git commands.** No `git add/commit/push/branch/merge/rebase/tag/stash/checkout`. Write files, report what changed, stop. Jan commits.
2. **One phase at a time.** Do not scaffold ahead. Do not start phase N+1 until phase N's gate is green and `docs/handoff/phase-N.md` exists.
3. **`packages/engine` has zero runtime dependencies** and imports only from `@bullyoff/shared` and `@bullyoff/rules`. If a dependency seems necessary, raise it as an ADR instead of installing it.
4. **The engine is deterministic.** No `Math.random`, `Date.now`, `performance.now`, `setTimeout`, DOM, `fetch`, or `Math.*` transcendentals in `packages/engine`. Use the injected `Rng` and `@bullyoff/shared/math`. ESLint enforces this; do not disable the rule.
5. **No `if (isWomens)` branches in the engine.** Every men's/women's difference is a value in a loaded profile.
6. **Strict TypeScript, ESLint clean.** No `any` outside typed third-party shims. Fix the type, don't cast around it.
7. **Every non-obvious modelling choice gets a comment explaining the *hockey* reason**, not the code reason.
8. **Tests before tuning.** A magic constant without a test asserting its effect is a bug.
9. **When a hockey rule is ambiguous, stop and ask.** Do not invent rules.
10. **Prefer deleting to abstracting.** Solo project; premature generality is the enemy.
11. **No real persons, no real club names** in any shipped data. See ADR-006.
12. **Pixels never enter the engine.** SI units (metres, seconds, kg) everywhere in `packages/*`; screen-space conversion only in `packages/render`.

## Workflow per phase

- Read the phase's deliverables and gate in `BRIEF.md` §8 and `KICKOFF.md`.
- Build. Run `pnpm check` (typecheck + lint + test) until green.
- Write `docs/handoff/phase-N.md`: what was built, what was decided, what surprised you, what the next phase should watch out for.
- Update `KICKOFF.md` to point at the next phase.
- End your message with a plain list of files created/changed so Jan can review and commit.

## Toolchain

- pnpm workspaces, Node ≥ 22, TypeScript strict, Vite, Vitest, Vue 3 `<script setup>` + Pinia, PixiJS 8, ESLint flat config.
- `pnpm check` is the single command that must be green before any handoff.
- No CSS framework. Hand-rolled design tokens in `apps/manager/src/styles/tokens.css`.

## Package graph (dependencies flow downward only)

```
shared  ←  rules  ←  engine  ←  render  ←  manager / arcade
   ↑                    ↑                     ↑
   └──── worldgen ──────┘                  simcli
```

`shared` depends on nothing. `engine` depends on `shared` and `rules` only. Nothing in `packages/` depends on anything in `apps/`.
