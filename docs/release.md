# Release checklist — BULLY OFF manager

Ship = a static PWA build of `apps/manager` deployed by `.github/workflows/deploy.yml` to GitHub Pages on every push to `main` (project page `/BullyOff/`; set `BASE_PATH` for a custom domain).

## Before tagging

- [ ] `pnpm check` green (typecheck · lint · 150+ tests); `pnpm test:browsers` green (determinism + renderer in Chromium/Firefox/WebKit).
- [ ] `pnpm --filter @bullyoff/manager build` — the PWA precache lists `sw.js`, the engine worker and the season worker chunks.
- [ ] Engine version (`packages/engine/src/constants.ts`) and goldens (`sim/golden.ts`, `sim/scenarios.golden.json`) agree with `docs/handoff/phase-*.md` and `docs/rules/calibration.md`.
- [ ] `SAVE_VERSION` bumped **only** if the `World` shape changed, with a migration in `packages/season/src/save.ts` and a test; never edit a past migration.
- [ ] Blocklist unchanged or only grown (`packages/worldgen/src/blocklist.ts`); the 2 000-identity test passes.
- [ ] Privacy statement (`About & privacy`) still true: no network after load, no real clubs/people, no telemetry.
- [ ] Strings: new UI text has `nl`/`en`/`fr` entries (`apps/manager/src/i18n/*.json`).

## On a phone (manual, before v1.0.0)

- [ ] Install from the Pages URL (Android Chrome / iOS Safari "Add to Home Screen"); relaunch offline: world generation (20 seasons) and a coached match work.
- [ ] Coached match at 1× holds 60 fps in director mode; tactical/coach overlays legible at 390×844.
- [ ] "Sim to season end" shows progress and finishes without a stall.
- [ ] Save → reload → load; export → import on another browser.
- [ ] Update flow: deploy a change, reopen the app, the "new version" banner appears, reload keeps the save.

## Tag

```bash
git tag -a v1.0.0 -m "BULLY OFF manager v1.0.0"
```

```bash
git push origin v1.0.0
```

Release notes: engine version, save version, calibration summary, known deviations (from `docs/rules/calibration.md`), owed human reviews (`KICKOFF.md`).
