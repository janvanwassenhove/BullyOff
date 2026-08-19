/**
 * MatchView in a real browser (Playwright via @vitest/browser): mounts the viewer
 * on a canvas, renders frames at chosen ticks, and checks that (a) the pitch is
 * drawn, (b) different ticks render different pictures, (c) the same tick renders
 * the same picture twice (frame-accurate seek), (d) HUD state follows events.
 * `pnpm test:browsers` runs it on Chromium, Firefox and WebKit.
 */
import { expect, it } from 'vitest';
import { FIH_OUTDOOR_FAST } from '@bullyoff/rules';
import { aiController, simulateMatch, squadsFromSetup, MENS, DEFAULT_TACTICS, type Frame, type FromEngine } from '@bullyoff/engine';
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

it('live mode (Phase 7): the log grows through append(), the coach view draws numbers and stamina bars, and instructions reach the AI', async () => {
  const setup = aiMatchSetup('mens', 'watered', FIH_OUTDOOR_FAST); setup.frameEvery = 1;
  const { createEngineHost } = await import('@bullyoff/engine');
  const out: FromEngine[] = [];
  const host = createEngineHost((m) => out.push(m));
  host.handle({ type: 'initAi', id: 1, setup, seed: 11, tactics: [{ ...DEFAULT_TACTICS }, { ...DEFAULT_TACTICS }] });
  const ready = out[0];
  if (ready?.type !== 'ready') throw new Error('no ready');
  const log = { header: ready.header, events: [...ready.events], frames: [] as Frame[] };
  const el = document.createElement('div'); el.style.width = '800px'; el.style.height = '450px'; el.style.position = 'relative';
  const canvas = document.createElement('canvas'); el.appendChild(canvas); document.body.appendChild(el);
  // a first chunk, then the view, then more chunks appended while "playing"
  out.length = 0; host.handle({ type: 'advance', id: 2, ticks: 60 });
  const c0 = out[0]; if (c0?.type !== 'events') throw new Error('no events'); log.events.push(...c0.events); log.frames.push(...c0.frames);
  const view = await createMatchView(canvas, log, { mode: 'coach', live: true, coachTeam: 0 });
  view.pause();
  expect(view.lastTick).toBe(59);
  out.length = 0; host.handle({ type: 'instruct', id: 3, instructions: [{ tick: 60, team: 0, kind: 'tactics', patch: { pressHeight: 0.9 } }] });
  expect(out[0]?.type).toBe('instructed');
  for (let i = 0; i < 20; i++) { out.length = 0; host.handle({ type: 'advance', id: 10 + i, ticks: 60 }); const m = out[0]; if (m?.type === 'events') view.append(m.events, m.frames); }
  expect(view.lastTick).toBe(60 * 21 - 1);
  out.length = 0; host.handle({ type: 'instruct', id: 99, instructions: [] });
  const t = out[0]; expect(t?.type === 'instructed' && t.tactics[0].pressHeight).toBe(0.9);
  view.seek(600); view.renderFrame();
  const coach = pixels(canvas);
  view.setMode('tactical'); view.renderFrame();
  const tactical = pixels(canvas);
  expect(diff(coach, tactical)).toBeGreaterThan(0.2); // overlays (numbers, stamina bars) are visible in coach mode
  view.seek(1250); view.renderFrame();
  expect(view.hud.clockSeconds).toBeGreaterThan(50);
  if (navigator.userAgent.includes('Chrome')) {
    const { page } = await import('@vitest/browser/context');
    view.setMode('coach'); view.seek(1000); view.renderFrame(); view.renderFrame();
    await page.screenshot({ path: 'shots/matchview-coach.png', element: el });
  }
  view.destroy();
});
