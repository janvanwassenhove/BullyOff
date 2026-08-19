/**
 * MatchView in a real browser (Playwright via @vitest/browser): mounts the viewer
 * on a canvas, renders frames at chosen ticks, and checks that (a) the pitch is
 * drawn, (b) different ticks render different pictures, (c) the same tick renders
 * the same picture twice (frame-accurate seek), (d) HUD state follows events.
 * `pnpm test:browsers` runs it on Chromium, Firefox and WebKit.
 */
import { expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { aiController, simulateMatch, squadsFromSetup, MENS } from '@bullyoff/engine';
import { aiMatchSetup } from '@bullyoff/engine/fixtures';
import { createMatchView } from '../src/index.js';

function pixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const oc = document.createElement('canvas'); oc.width = 64; oc.height = 40;
  const ctx = oc.getContext('2d')!;
  ctx.drawImage(canvas, 0, 0, 64, 40);
  return ctx.getImageData(0, 0, 64, 40).data;
}
const diff = (a: Uint8ClampedArray, b: Uint8ClampedArray): number => { let d = 0; for (let i = 0; i < a.length; i++) d += Math.abs((a[i] ?? 0) - (b[i] ?? 0)); return d / a.length; };

it('renders a replay frame-accurately in the browser', async () => {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST); setup.frameEvery = 1;
  const log = simulateMatch(setup, 7, aiController(7, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }), 20 * 90); // 90 s
  const host = document.createElement('div'); host.style.width = '800px'; host.style.height = '450px'; host.style.position = 'relative';
  const canvas = document.createElement('canvas'); host.appendChild(canvas); document.body.appendChild(host);
  const view = await createMatchView(canvas, log, { mode: 'director' });
  view.pause();
  view.seek(200); view.renderFrame();
  const a1 = pixels(canvas);
  view.seek(200); view.renderFrame();
  const a2 = pixels(canvas);
  view.seek(1200); view.renderFrame();
  const b = pixels(canvas);
  // something is drawn (not the bare background)
  let nonBg = 0; for (let i = 0; i < a1.length; i += 4) if (Math.abs((a1[i] ?? 0) - 14) > 20 || Math.abs((a1[i + 1] ?? 0) - 17) > 20) nonBg++;
  expect(nonBg).toBeGreaterThan(a1.length / 4 * 0.3);
  // same tick → same picture; different tick → different picture (camera & actors moved)
  expect(diff(a1, a2)).toBeLessThan(0.5);
  expect(diff(a1, b)).toBeGreaterThan(2);
  // HUD follows events: after 60 s the clock is > 0 and phase is Q1
  view.seek(1200); view.renderFrame();
  expect(view.hud.phase).toBe('Q1');
  expect(view.hud.clockSeconds).toBeGreaterThan(30);
  expect(view.lastTick).toBe(log.frames[log.frames.length - 1]!.tick);
  view.destroy();
});

it('screenshot for the review deck (chromium)', async () => {
  if (!navigator.userAgent.includes('Chrome')) return;
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST); setup.frameEvery = 1;
  const log = simulateMatch(setup, 42, aiController(42, squadsFromSetup(setup.players), { profile: MENS, surface: 'watered' }), 20 * 120);
  const host = document.createElement('div'); host.style.width = '960px'; host.style.height = '540px'; host.style.position = 'relative';
  const canvas = document.createElement('canvas'); host.appendChild(canvas); document.body.appendChild(host);
  const view = await createMatchView(canvas, log, { mode: 'director' });
  view.pause();
  // find a moment near the D: the first CircleEntry after 20 s
  const ce = log.events.find((e) => e.t === 'CircleEntry' && e.tick > 400);
  view.seek((ce?.tick ?? 800) + 6); view.renderFrame(); view.renderFrame();
  expect([canvas.clientWidth, canvas.clientHeight, canvas.width, canvas.height, host.clientWidth, window.devicePixelRatio]).toEqual([960, 540, 960, 540, 960, 1]);
  const { page } = await import('@vitest/browser/context');
  await page.screenshot({ path: 'shots/matchview-director.png', element: host });
  view.setMode('tactical'); view.seek(900); view.renderFrame(); view.renderFrame(); view.renderFrame();
  await page.screenshot({ path: 'shots/matchview-tactical.png', element: host });
  view.destroy();
});
