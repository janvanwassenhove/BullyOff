/**
 * MatchView — the PixiJS replay viewer (ADR-003, ADR-013). Reads a MatchLog only.
 *
 * - world container in METRES (pitch geometry straight from @bullyoff/shared);
 *   the camera sets its scale/position; screen conversion happens here only.
 * - interpolation buffer between frames (any cadence) — no 20 Hz stepping.
 * - director camera (spring, circle-aware zoom, velocity lead, punches) or tactical.
 * - moment system: goal → slow-motion hold + zoom punch; whistle/crowd audio hooks.
 * - HUD (score, clock, quarter) derived from events up to the current tick, so
 *   scrubbing backwards is exact.
 */
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  CIRCLE_RADIUS, GOAL_DEPTH, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH, LINE_23_X, PENALTY_SPOT_X,
} from '@bullyoff/shared';
import { DT, type Frame, type MatchEvent, type MatchLog } from '@bullyoff/engine';
import { cameraTarget, initialCamera, punch, stepCamera, type CameraState } from './camera.js';
import { sampleAt, type Sample } from './interp.js';
import { AudioLayer } from './audio.js';

/** director = TV camera; tactical = whole pitch; coach = whole pitch + numbers, stamina bars and the coach's team highlighted (Phase 7). */
export type ViewMode = 'director' | 'tactical' | 'coach';

export interface MatchViewOptions {
  homeColour?: number;
  awayColour?: number;
  /** Short names shown in the HUD next to colour chips ("ESP 1 – 0 GRO"). */
  homeName?: string;
  awayName?: string;
  mode?: ViewMode;
  /** Pause automatically on these event types (auto-pause triggers). */
  autoPauseOn?: MatchEvent['t'][];
  /** Live mode (Phase 7): the log grows via `append`; reaching the last frame waits for data instead of stopping. */
  live?: boolean;
  /** The coach's team (0/1) for the coach view highlight. */
  coachTeam?: 0 | 1;
}

export interface HudState { score: [number, number]; quarter: number; clockSeconds: number; phase: string; lastEvent: string }

export interface MatchView {
  play(): void;
  pause(): void;
  toggle(): void;
  setSpeed(x: number): void;
  seek(tick: number): void;
  setMode(m: ViewMode): void;
  enableAudio(): void;
  readonly playing: boolean;
  readonly speed: number;
  readonly tick: number;
  readonly lastTick: number;
  readonly hud: HudState;
  onFrame(cb: (tick: number, hud: HudState) => void): void;
  /** Draw the current tick synchronously (frame-accuracy tests, screenshots, hidden tabs). */
  renderFrame(): void;
  /** Live mode: append events/frames produced since the last append (ticks must be monotone). */
  append(events: readonly MatchEvent[], frames: readonly Frame[]): void;
  /** Distance (ticks) between the play head and the newest frame — how far behind live we are. */
  readonly lag: number;
  destroy(): void;
}

const LINE = 0xf4f4f0;

export async function createMatchView(canvas: HTMLCanvasElement, log: MatchLog, opts: MatchViewOptions = {}): Promise<MatchView> {
  const app = new Application();
  // Phone budget (Phase 9): cap the render resolution at 1.5 and skip MSAA on coarse-pointer devices — lines are re-drawn per zoom so they stay crisp anyway.
  const phone = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;
  await app.init({ canvas, antialias: !phone, background: 0x0e1116, resolution: Math.min(phone ? 1.5 : 2, globalThis.devicePixelRatio || 1), autoDensity: true, width: Math.max(1, canvas.parentElement?.clientWidth ?? 800), height: Math.max(1, canvas.parentElement?.clientHeight ?? 450) });

  // Pixi's resizeTo only reacts to window resizes; the stage element itself can change (layout, sidebars).
  // Checked once per ticker frame (an observer risks resize feedback loops).
  const host = canvas.parentElement;
  let lastW = -1, lastH = -1;
  const syncSize = (): void => {
    if (!host) return;
    const w = host.clientWidth, h = host.clientHeight;
    if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) { lastW = w; lastH = h; app.renderer.resize(w, h); }
  };

  const homeColour = opts.homeColour ?? 0xe63946;
  const awayColour = opts.awayColour ?? 0x2a9df4;
  let mode: ViewMode = opts.mode ?? 'director';
  const nPlayers = log.header.playerIds.length;
  const teams = log.header.teams;
  const gkIndex = new Set<number>();
  { const seen = new Set<number>(); teams.forEach((tm, i) => { if (!seen.has(tm)) { seen.add(tm); gkIndex.add(i); } }); }
  let lastTick = log.frames.length ? (log.frames[log.frames.length - 1]?.tick ?? 0) : (log.events[log.events.length - 1]?.tick ?? 0);
  const live = opts.live ?? false;
  const coachTeam = opts.coachTeam ?? 0;
  const surface = log.header.surface;

  // ── layers ────────────────────────────────────────────────────────────────
  const world = new Container();
  const pitch = new Graphics();
  const shadows = new Container();
  const actors = new Container();
  const fx = new Graphics();
  world.addChild(pitch, shadows, actors, fx);
  app.stage.addChild(world);
  let pitchLw = 0.075;
  drawPitch(pitch, surface, pitchLw);

  const coachStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 11, fill: 0xffffff, fontWeight: '700' });
  const overlay = new Container(); // coach view: numbers + stamina bars (world space, hidden in other modes)
  world.addChild(overlay);
  const playerG: { shadow: Graphics; body: Container; stick: Graphics; disc: Graphics; label: Text; bar: Graphics }[] = [];
  for (let i = 0; i < nPlayers; i++) {
    const shadow = new Graphics().ellipse(0.12, 0.18, 0.5, 0.32).fill({ color: 0x000000, alpha: 0.28 });
    const body = new Container();
    const disc = new Graphics().circle(0, 0, 0.42).fill(teams[i] === 0 ? homeColour : awayColour).stroke({ width: 0.06, color: 0x111111, alpha: 0.6 });
    if (gkIndex.has(i)) disc.circle(0, 0, 0.42).stroke({ width: 0.12, color: 0xffd166 });
    const nose = new Graphics().moveTo(0.42, 0).lineTo(0.62, 0).stroke({ width: 0.14, color: 0xffffff, alpha: 0.9 });
    const stick = new Graphics().moveTo(0, 0).lineTo(1.35, 0).stroke({ width: 0.09, color: 0x2b1d0e }).circle(1.35, 0, 0.09).fill(0x2b1d0e);
    body.addChild(disc, nose);
    shadows.addChild(shadow); actors.addChild(stick, body);
    const label = new Text({ text: String(log.header.playerIds[i] ?? i), style: coachStyle }); label.anchor.set(0.5); label.scale.set(0.045);
    const bar = new Graphics();
    overlay.addChild(bar, label);
    playerG.push({ shadow, body, stick, disc, label, bar });
  }
  const ballShadow = new Graphics().ellipse(0, 0, 0.2, 0.13).fill({ color: 0x000000, alpha: 0.35 });
  const ball = new Graphics().circle(0, 0, 0.17).fill(0xfbfaf2).stroke({ width: 0.03, color: 0x8a8a80 });
  shadows.addChild(ballShadow); actors.addChild(ball);

  // ── HUD (screen space) ────────────────────────────────────────────────────
  const hudStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 18, fill: 0xf0f0f0, fontWeight: '700' });
  const subStyle = new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 13, fill: 0xb0b8c0 });
  const hudBg = new Graphics();
  const hudChips = new Graphics();
  const homeName = opts.homeName ?? 'HOME', awayName = opts.awayName ?? 'AWAY';
  const hudText = new Text({ text: '', style: hudStyle });
  const hudSub = new Text({ text: '', style: subStyle });
  const banner = new Text({ text: '', style: new TextStyle({ fontFamily: 'system-ui, sans-serif', fontSize: 44, fill: 0xffffff, fontWeight: '900', letterSpacing: 6, dropShadow: { color: 0x000000, blur: 8, distance: 0, alpha: 0.8 } }) });
  banner.anchor.set(0.5); banner.alpha = 0;
  app.stage.addChild(hudBg, hudChips, hudText, hudSub, banner);

  // ── playback state ────────────────────────────────────────────────────────
  let tick = 0, speed = 1, playing = false;
  let cam: CameraState = initialCamera();
  let evCursor = 0;               // events processed for moments/audio (monotone while playing forward)
  let hud: HudState = { score: [0, 0], quarter: 1, clockSeconds: 0, phase: 'pre-match', lastEvent: '' };
  let slowmoUntil = -1;           // wall seconds
  let bannerUntil = -1;
  let punchAt = -Infinity;        // wall seconds of the last strike punch
  let wall = 0;                   // wall-clock seconds accumulated
  const audio = new AudioLayer();
  const frameCbs: ((tick: number, hud: HudState) => void)[] = [];
  const autoPause = new Set(opts.autoPauseOn ?? []);

  function recomputeHud(upTo: number): void {
    const h: HudState = { score: [0, 0], quarter: 1, clockSeconds: 0, phase: 'pre-match', lastEvent: '' };
    let clockRunning = false, clockAtTick = 0, clockBase = 0;
    for (const e of log.events) {
      if (e.tick > upTo) break;
      switch (e.t) {
        case 'QuarterStart': h.quarter = e.quarter; h.phase = `Q${e.quarter}`; clockBase = (e.quarter - 1) * 15 * 60; clockRunning = false; break;
        case 'QuarterEnd': h.phase = e.quarter === 4 ? 'full time' : 'break'; clockRunning = false; clockBase = e.quarter * 15 * 60; break;
        case 'Clock': clockRunning = e.running; clockAtTick = e.tick; clockBase = e.matchClockTicks * DT; break;
        case 'Goal': h.score = [e.score[0], e.score[1]]; h.lastEvent = `GOAL ${e.team === 0 ? 'home' : 'away'}`; break;
        case 'FullTime': h.phase = 'full time'; break;
        case 'PenaltyCornerAwarded': h.lastEvent = 'penalty corner'; break;
        case 'PenaltyStrokeAwarded': h.lastEvent = 'penalty stroke'; break;
        case 'Card': h.lastEvent = `${e.colour} card #${e.playerId}`; break;
        default: break;
      }
    }
    h.clockSeconds = clockBase + (clockRunning ? (upTo - clockAtTick) * DT : 0);
    hud = h;
  }

  function seekTo(t: number): void {
    tick = Math.max(0, Math.min(lastTick, t));
    evCursor = log.events.findIndex((e) => e.tick > tick);
    if (evCursor < 0) evCursor = log.events.length;
    recomputeHud(tick);
    slowmoUntil = -1; bannerUntil = -1;
    // re-prime the camera at the ball (ADR-013: never interpolate across a seek)
    const s = sampleAt(log.frames, tick, nPlayers);
    if (s) { cam = { ...initialCamera(), x: mode === 'tactical' ? 0 : s.ball.x, y: mode === 'tactical' ? 0 : s.ball.y * 0.6, width: mode === 'tactical' ? 100 : 60 }; }
  }

  function processEvents(upTo: number): void {
    while (evCursor < log.events.length) {
      const e = log.events[evCursor];
      if (!e || e.tick > upTo) break;
      evCursor++;
      switch (e.t) {
        case 'Goal':
          hud.score = [e.score[0], e.score[1]]; hud.lastEvent = `GOAL ${e.team === 0 ? 'home' : 'away'}`;
          slowmoUntil = wall + 1.6; bannerUntil = wall + 2.2; banner.text = 'GOAL'; punchAt = wall;
          audio.crowd(); audio.whistle(2);
          break;
        case 'BallStruck': if (e.speed > 12) { punchAt = wall; audio.strike(e.speed, surface); } break;
        case 'PenaltyCornerAwarded': hud.lastEvent = 'penalty corner'; audio.whistle(1); banner.text = 'PENALTY CORNER'; bannerUntil = wall + 1.4; break;
        case 'PenaltyStrokeAwarded': hud.lastEvent = 'penalty stroke'; audio.whistle(1); banner.text = 'PENALTY STROKE'; bannerUntil = wall + 1.4; break;
        case 'RestartAwarded': if (e.restart.kind !== 'centrePass') audio.whistle(1); break;
        case 'QuarterStart': hud.quarter = e.quarter; hud.phase = `Q${e.quarter}`; audio.whistle(1); break;
        case 'QuarterEnd': hud.phase = e.quarter === 4 ? 'full time' : 'break'; audio.whistle(2); break;
        case 'FullTime': hud.phase = 'full time'; banner.text = 'FULL TIME'; bannerUntil = wall + 3; audio.crowd(); break;
        case 'Card': hud.lastEvent = `${e.colour} card #${e.playerId}`; audio.whistle(1); break;
        default: break;
      }
      if (autoPause.has(e.t)) playing = false;
    }
  }

  const measureText = new Text({ text: '', style: hudStyle });
  function measureAwayChip(): number {
    // x offset (from the text start) of the end of "... {awayName}" — measured with the same style
    measureText.text = `    ${homeName} ${hud.score[0]}  –  ${hud.score[1]} ${awayName}`;
    return measureText.width + 6;
  }
  function draw(s: Sample, dtWall: number): void {
    // camera
    const w = app.screen.width, h = app.screen.height;
    const aspect = w / Math.max(1, h);
    // ball velocity from a short look-ahead sample (frames may be sparse)
    const s2 = sampleAt(log.frames, s.tick + 2, nPlayers) ?? s;
    const bv = { vx: (s2.ball.x - s.ball.x) / (2 * DT), vy: (s2.ball.y - s.ball.y) / (2 * DT) };
    const target = cameraTarget({ x: s.ball.x, y: s.ball.y, ...bv }, mode === 'director' ? 'director' : 'tactical', aspect);
    cam = stepCamera(cam, target, dtWall, mode !== 'director' ? 10 : 6 / Math.max(1, speed / 2));
    overlay.visible = mode === 'coach';
    const width = cam.width * punch(wall - punchAt);
    const scale = w / width;
    world.scale.set(scale);
    world.position.set(w / 2 - cam.x * scale, h / 2 - cam.y * scale);
    // lines must stay ≥ ~1.5 device px at any zoom (a 75 mm line is sub-pixel on a phone showing the whole pitch)
    const wantLw = Math.max(0.075, 1.6 / scale);
    if (Math.abs(wantLw - pitchLw) / pitchLw > 0.3) { pitchLw = wantLw; pitch.clear(); drawPitch(pitch, surface, pitchLw); }

    // actors
    for (let i = 0; i < nPlayers; i++) {
      const p = s.players[i]; const g = playerG[i];
      if (!p || !g) continue;
      const off = Math.abs(p.y) > HALF_WIDTH + 1.5; // in the dugout: still drawn, faded
      g.body.position.set(p.x, p.y); g.body.rotation = p.heading; g.body.alpha = off ? 0.35 : 1;
      g.shadow.position.set(p.x, p.y); g.shadow.alpha = off ? 0 : 1;
      g.stick.position.set(p.x, p.y); g.stick.rotation = p.stick; g.stick.alpha = off ? 0.35 : 1;
      // stamina tint on the disc: fresh = full colour, tired = darker
      const st = Math.max(0, Math.min(1, p.stamina));
      g.disc.alpha = 0.7 + 0.3 * st;
      if (mode === 'coach') {
        const mineTeam = teams[i] === coachTeam;
        g.label.position.set(p.x, p.y - 1.05); g.label.alpha = off ? 0.3 : mineTeam ? 1 : 0.55;
        g.bar.clear();
        if (!off) {
          g.bar.rect(p.x - 0.7, p.y + 0.7, 1.4, 0.22).fill({ color: 0x000000, alpha: 0.5 });
          g.bar.rect(p.x - 0.7, p.y + 0.7, 1.4 * st, 0.22).fill({ color: st > 0.6 ? 0x2ecc71 : st > 0.35 ? 0xf1c40f : 0xe74c3c, alpha: mineTeam ? 1 : 0.5 });
        }
      }
    }
    ball.position.set(s.ball.x, s.ball.y - s.ball.z * 0.65); // pseudo-3D lift
    ballShadow.position.set(s.ball.x + s.ball.z * 0.25, s.ball.y);
    ballShadow.scale.set(1 + s.ball.z * 0.15);
    ballShadow.alpha = Math.max(0.12, 0.35 - s.ball.z * 0.08);
    ball.scale.set(1 + s.ball.z * 0.12);

    // HUD
    const mm = Math.floor(hud.clockSeconds / 60), ss = Math.floor(hud.clockSeconds % 60);
    hudText.text = `    ${homeName} ${hud.score[0]}  –  ${hud.score[1]} ${awayName}    ${hud.phase}  ${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
    hudSub.text = `${speed}×${wall < slowmoUntil ? '  slow-mo' : ''}${playing ? '' : '  paused'}   ${hud.lastEvent}   ${surface} turf`;
    hudBg.clear().roundRect(8, 8, Math.max(hudText.width, hudSub.width) + 24, 52, 8).fill({ color: 0x000000, alpha: 0.55 });
    hudText.position.set(20, 12); hudSub.position.set(20, 36);
    // colour chips: home before its name, away after its name — the kit colours on the pitch
    hudChips.clear().roundRect(20, 17, 14, 14, 3).fill(homeColour).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    hudChips.roundRect(20 + measureAwayChip(), 17, 14, 14, 3).fill(awayColour).stroke({ width: 1, color: 0xffffff, alpha: 0.7 });
    banner.position.set(w / 2, h * 0.28);
    banner.alpha = wall < bannerUntil ? Math.min(1, (bannerUntil - wall) / 0.4) : 0;
  }

  let last = performance.now();
  app.ticker.add(() => {
    syncSize();
    const now = performance.now();
    const dtWall = Math.min(0.1, (now - last) / 1000); last = now; wall += dtWall;
    if (playing) {
      const slow = wall < slowmoUntil ? 0.25 : 1;
      tick += dtWall * 20 * speed * slow;
      if (tick >= lastTick) { tick = lastTick; if (!live) playing = false; }
      processEvents(tick);
      // clock display advances with the tick when running (recompute cheaply every ~0.25 s)
      if (Math.floor(tick) % 5 === 0) recomputeHud(tick);
    }
    const s = sampleAt(log.frames, tick, nPlayers);
    if (s) draw(s, dtWall);
    for (const cb of frameCbs) cb(tick, hud);
  });

  seekTo(0);

  return {
    play: () => { if (tick >= lastTick) seekTo(0); playing = true; },
    pause: () => { playing = false; },
    toggle: () => { if (playing) { playing = false; return; } if (tick >= lastTick) seekTo(0); playing = true; },
    setSpeed: (x) => { speed = Math.max(0.25, Math.min(8, x)); },
    seek: (t) => { seekTo(t); },
    setMode: (m) => { mode = m; },
    enableAudio: () => { audio.enable(); },
    get playing() { return playing; },
    get speed() { return speed; },
    get tick() { return tick; },
    get lastTick() { return lastTick; },
    get hud() { return hud; },
    onFrame: (cb) => { frameCbs.push(cb); },
    renderFrame: () => { syncSize(); const s = sampleAt(log.frames, tick, nPlayers); if (s) draw(s, 1 / 60); app.render(); },
    append: (events, frames) => {
      log.events.push(...events); log.frames.push(...frames);
      const lf = log.frames[log.frames.length - 1]?.tick, le = log.events[log.events.length - 1]?.tick;
      lastTick = Math.max(lastTick, lf ?? 0, log.frames.length ? 0 : (le ?? 0));
    },
    get lag() { return lastTick - tick; },
    destroy: () => { app.destroy(false, { children: true }); },
  };
}

// ── pitch drawing (metres; geometry from shared) ──────────────────────────────

function drawPitch(g: Graphics, surface: string, lw: number): void {
  const margin = 4;
  const turf = surface === 'watered' ? 0x1e6fb0 : surface === 'wet' ? 0x175c8f : 0x1f8a5a; // water-based blue vs dry sand-dressed green
  const stripe = surface === 'dry' ? 0x22935f : surface === 'watered' ? 0x2178bb : 0x1a6398;
  g.rect(-HALF_LENGTH - margin, -HALF_WIDTH - margin, 2 * (HALF_LENGTH + margin), 2 * (HALF_WIDTH + margin)).fill(turf);
  // mown stripes
  for (let x = -HALF_LENGTH; x < HALF_LENGTH; x += 9.14) {
    if (Math.round((x + HALF_LENGTH) / 9.14) % 2 === 0) g.rect(x, -HALF_WIDTH, 9.14, 2 * HALF_WIDTH).fill(stripe);
  }
  // wet sheen
  if (surface !== 'dry') g.rect(-HALF_LENGTH - margin, -HALF_WIDTH - margin, 2 * (HALF_LENGTH + margin), 2 * (HALF_WIDTH + margin)).fill({ color: 0xffffff, alpha: surface === 'watered' ? 0.06 : 0.1 });
  const stroke = { width: lw, color: LINE, alpha: 0.95 };
  // boundary, centre line, 23 m lines
  g.rect(-HALF_LENGTH, -HALF_WIDTH, 2 * HALF_LENGTH, 2 * HALF_WIDTH).stroke(stroke);
  g.moveTo(0, -HALF_WIDTH).lineTo(0, HALF_WIDTH).stroke(stroke);
  g.moveTo(LINE_23_X, -HALF_WIDTH).lineTo(LINE_23_X, HALF_WIDTH).stroke(stroke);
  g.moveTo(-LINE_23_X, -HALF_WIDTH).lineTo(-LINE_23_X, HALF_WIDTH).stroke(stroke);
  for (const end of [1, -1] as const) {
    const gx = end * HALF_LENGTH;
    // circle: post-centred quarter arcs + straight top; dotted 5 m circle
    for (const [r, dotted] of [[CIRCLE_RADIUS, false], [CIRCLE_RADIUS + 5, true]] as const) {
      const topX = gx - end * r;
      if (!dotted) {
        g.moveTo(topX, -GOAL_HALF_WIDTH).lineTo(topX, GOAL_HALF_WIDTH).stroke(stroke);
        // arcs from the straight down to the backline
        const a0 = end === 1 ? Math.PI : 0;
        g.arc(gx, GOAL_HALF_WIDTH, r, a0, a0 + (end === 1 ? -Math.PI / 2 : Math.PI / 2), end === 1).stroke(stroke);
        g.arc(gx, -GOAL_HALF_WIDTH, r, a0, a0 + (end === 1 ? Math.PI / 2 : -Math.PI / 2), end !== 1).stroke(stroke);
      } else {
        // dotted: short dashes along the same shape
        const seg = 0.6;
        for (let y = -GOAL_HALF_WIDTH; y < GOAL_HALF_WIDTH; y += seg * 2) g.moveTo(topX, y).lineTo(topX, Math.min(GOAL_HALF_WIDTH, y + seg)).stroke(stroke);
        for (const sgn of [1, -1]) {
          for (let a = 0; a < Math.PI / 2; a += (seg * 2) / r) {
            const a1 = a, a2 = Math.min(Math.PI / 2, a + seg / r);
            const cx = gx, cy = sgn * GOAL_HALF_WIDTH;
            const px = (ang: number): number => cx - end * r * Math.cos(ang);
            const py = (ang: number): number => cy + sgn * r * Math.sin(ang);
            g.moveTo(px(a1), py(a1)).lineTo(px(a2), py(a2)).stroke(stroke);
          }
        }
      }
    }
    // penalty spot, goal
    g.circle(end * PENALTY_SPOT_X, 0, 0.1).fill(LINE);
    g.rect(Math.min(gx, gx + end * GOAL_DEPTH), -GOAL_HALF_WIDTH, GOAL_DEPTH, 2 * GOAL_HALF_WIDTH).fill({ color: 0xffffff, alpha: 0.12 }).stroke({ width: 0.08, color: 0xffffff, alpha: 0.9 });
    // net hatch
    for (let y = -GOAL_HALF_WIDTH; y <= GOAL_HALF_WIDTH; y += 0.3) g.moveTo(gx, y).lineTo(gx + end * GOAL_DEPTH, y).stroke({ width: 0.02, color: 0xffffff, alpha: 0.35 });
    // dugouts (halfway, off the pitch)
  }
  g.rect(-3, -HALF_WIDTH - 3.2, 6, 1.4).stroke({ width: 0.06, color: 0xffffff, alpha: 0.4 });
  g.rect(-3, HALF_WIDTH + 1.8, 6, 1.4).stroke({ width: 0.06, color: 0xffffff, alpha: 0.4 });
}
