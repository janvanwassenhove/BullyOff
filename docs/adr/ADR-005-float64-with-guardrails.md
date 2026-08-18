# ADR-005 — Numeric representation: float64 with guardrails

**Status:** Accepted · 2026-08-18
**Decides:** BRIEF §4.4. Enforced today by `eslint.config.js` (engine guardrail block).

## Context

Determinism (ADR-002) requires that the same seed and inputs yield the same event log. The strongest form — bit-identical logs *across different machines and browsers* — is only needed by peer-to-peer lockstep networking, which ADR-011 rules out. What we actually need is: (a) identical results on the same engine build in the same JS engine, always; (b) identical results across V8/JSC/SpiderMonkey as a strong preference, so that a shared replay seed reproduces on a friend's phone; and (c) no drift that compounds over a 70-minute match.

JavaScript's basic arithmetic (`+ − × ÷`, `Math.sqrt`, comparisons) is strictly IEEE-754 and identical everywhere. The transcendental functions (`sin, cos, tan, atan2, exp, log, pow, …`) are **implementation-defined in precision** (ECMA-262 §21.3.2) and do differ across engines in the last bits.

## Options considered

### A. Fixed-point integers (e.g. Q16.16 or scaled int32/BigInt) throughout the engine
- **For:** bit-exact everywhere by construction; the classic RTS/lockstep answer.
- **Against:** every line of physics code pays: manual scaling, overflow vigilance, awkward division, sqrt via integer Newton, trig via tables anyway. Massive velocity cost for a solo dev on the one package that must be right about hockey. Solves the P2P-lockstep problem, which we don't have. Overflow bugs are subtler than float drift.

### B. Plain float64, no discipline
- **For:** fastest to write.
- **Against:** cross-engine divergence creeps in through every `Math.sin`; if the representation ever has to change, it is a thousand-site refactor; wall-clock or summed-`dt` time drifts.

### C. float64 with mandatory guardrails
- **For:** the arithmetic that dominates physics is already exact and portable; the risk is confined to a short, enumerable list of functions we can replace; velocity stays high; the escape hatch to a different representation is kept cheap by a type alias.
- **Against:** requires discipline that lint must enforce, not convention. Our own trig/pow are slightly less precise than native — irrelevant at hockey scales (sub-millimetre) but must be documented.

## Decision

**Option C. IEEE-754 float64 throughout the engine**, with these guardrails — items 1, 2 and 4 are in place or scheduled for Phase 1; 3 is a Phase 1 CI job:

1. **Ban `Math.*` transcendentals** (`sin cos tan asin acos atan atan2 sinh cosh tanh asinh acosh atanh exp expm1 log log1p log2 log10 pow cbrt hypot random`) in `packages/engine`, `rules`, `shared` via ESLint `no-restricted-properties`. **Done in Phase 0** — see `eslint.config.js`. Allowed and exact: `sqrt abs floor ceil round trunc sign min max fround`. `packages/shared/src/math/` is the single exception, permitted to call native `Math.*` only to build lookup tables or as a test oracle; it exports LUT-interpolated `sin/cos`, own `atan2`, own `pow` for the specific exponents used, `exp` if needed.
2. **`Scalar` type alias.** `type Scalar = number` in `@bullyoff/shared`. Every simulation quantity is typed `Scalar`, not `number`. Changing representation is then one file plus a compiler-guided sweep. Phase 1.
3. **Determinism harness in CI on Chromium, Firefox and WebKit** (Playwright), not only Node. Hash the event log; fail on divergence. Phase 1 (`ci.yml` reserves the job).
4. **Serialisable, tick-stamped input commands** from day one. Phase 1.
5. **No accumulated error where it compounds:** elapsed time is `tick × dt`; positions integrate from velocities per tick, but anything "clock-like" is derived from the tick counter.

## Consequences

- If a real cross-browser divergence survives guardrail 1 (e.g. from `Math.sqrt` on a pathological input, or from FMA contraction in a JIT — both unlikely but not impossible), we will detect it in CI (guardrail 3) and can respond surgically. Because ADR-011 rules out lockstep, such a divergence would degrade *shared-seed reproduction* not *gameplay*: a friend replaying my seed might see a slightly different match. Acceptable to ship with a known-issue note; the log-sharing path (send the log, not the seed) is always exact.
- Own trig is *faster* than native at LUT resolution — a small bonus for 10,000-match batches.
- The alias `Scalar` costs nothing at runtime and buys an exit. It must be used honestly: no `as number` laundering.
- **Reversal condition:** if a future ADR reverses ADR-011 and adopts P2P lockstep, this ADR must be superseded by a fixed-point (or WASM-with-strict-FP) decision. That is the *only* scenario in which fixed-point earns its cost.
