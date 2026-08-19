# Handoff — Phase 9: Ship (v1.0 candidate)

**Date:** 2026-08-19
**Gate (BRIEF §8):** a fresh phone installs the PWA, generates a world offline, plays a coached match at 60 fps and a season without a stall, saves survive a reload and an app update (migrations), the UI reads in all three languages, and the privacy statement is true.
**Status: everything buildable is built and green (`pnpm check` 151 tests, `pnpm test:browsers`, PWA build with 25 precached entries, deploy workflow); the on-device half of the gate needs Jan and a phone — see `docs/release.md`.**

## What was built

- **PWA**: `vite-plugin-pwa` (generateSW, `registerType: 'prompt'` — never a silent reload mid-match), manifest (name, icons 192/512/maskable, standalone, theme colour), precache of the app shell + engine worker + season worker chunks (≈ 0.9 MB), `navigateFallback`, outdated-cache cleanup. `src/pwa.ts`: offline-ready notice, update banner with explicit reload, `beforeinstallprompt` → "Install app" button. Icons generated without dependencies by `tools/icons/make-icons.cjs` (turf roundel, stick, ball) into `apps/manager/public`.
- **i18n NL / EN / FR**: `vue-i18n` (`src/i18n/{nl,en,fr}.json`), detection from localStorage → browser language → `en`, language switch in the header, `<html lang>` kept in sync. Every UI string in App / SeasonView / CoachView / MatchViewer / About / Onboarding and every store message goes through `t()`; generated names, club identities and rules are data and stay untranslated (ADR-006). Belgian voice: *strafcorner / barrage / reeks*, *penalty corner / barrage / division*.
- **About & privacy** page: the ADR-006 statement in three languages — no real clubs/people, no accounts/telemetry/analytics/ads, no network after load, exports contain generated data only, club mode is v1.x and local-only; engine + save versions; repo link.
- **Onboarding**: three screens on first run (world → season → coach), skippable, remembered in localStorage.
- **Performance guards**: renderer resolution cap 1.5 and no MSAA on coarse-pointer devices (`MatchView`), world generation and match days in workers, `Sim to season end` shows day progress from the season worker (`progress` messages).
- **Deploy**: `.github/workflows/deploy.yml` builds `apps/manager` with `BASE_PATH=/<repo>/` and publishes to GitHub Pages on every push to `main`; CI (`ci.yml`) still runs check + cross-browser determinism. `docs/release.md` is the release checklist incl. the phone pass.

## What was decided

- **Update = prompt, not auto-reload.** A coach mid-match must never lose the bench to a service-worker swap.
- **Only UI strings are translated.** A Flemish club keeps its Flemish name in the French UI; that is how Belgian hockey reads.
- **GitHub Pages project page** as the v1.0 host (zero infra, HTTPS, fits ADR-006 "no backend"); `BASE_PATH` makes a custom domain a one-line change.

## What surprised us

- `vite-plugin-pwa`'s virtual register module needs `workbox-window` as a direct devDependency under pnpm's strict node_modules — the error only shows at build time.
- A PWA built from a workspace monorepo precaches cleanly; the biggest chunk is the app shell with Pixi (≈ 480 KB, 160 KB gzip) — fine for a first load, and everything after that is local.

## What v1.0 still owes (all human / device)

1. The phone pass in `docs/release.md` (install, offline, 60 fps, season without stall, save across update).
2. The four reviews carried through the phases: Phase 3 coach verdict on the scenario deck, Phase 5 "feels like a goal", Phase 6 "feels earned", Phase 7 touchline review, Phase 8 name-pool eye.
3. Real assets (sprites, SFX, wordmark face, procedural badges) — ADR-012's art pass; the layered renderer and audio API are ready.
4. GitHub Pages must be enabled once in the repo settings (Source: GitHub Actions) for `deploy.yml` to publish.

## After v1.0 (v1.x, per BRIEF)

- Arcade front-end (`apps/arcade` stub) reusing `CoachInstruction`/`Command` and the same engine worker.
- Club mode (ADR-006 option D): local-only own squad.
- Instruction list in the replay (`ReplayFile` v2), records view from per-season tables, quick-sim toggle, stamina curve tuning and re-calibration, PC read-and-counter AI.
