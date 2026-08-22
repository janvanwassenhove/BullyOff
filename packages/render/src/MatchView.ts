/**
 * MatchView — the PixiJS replay viewer (ADR-003, ADR-013). Reads a MatchLog only.
 *
 * - a real FIH pitch drawn from metres through the seven-angle camera PROJECTION
 *   (pitch.ts): markers scale with depth, shadows fall away from the light, the
 *   far half darkens under a tilted camera. Never a CSS transform.
 * - interpolation buffer between frames (any cadence) — no 20 Hz stepping.
 * - director camera (spring, circle-aware zoom, velocity lead, punches) at the
 *   broadcast tilt, or any fixed camera from the handoff table.
 * - moment system: goal → slow-motion hold + banner; whistle/crowd audio hooks.
 * - HUD *state* (score, clock, quarter) derived from events up to the current
 *   tick so scrubbing backwards is exact; the chrome itself lives in Vue.
 */
import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { GOAL_DEPTH, GOAL_HALF_WIDTH, HALF_LENGTH, HALF_WIDTH } from '@bullyoff/shared';
import { DT, type Frame, type MatchEvent, type MatchLog } from '@bullyoff/engine';
import { cameraTarget, initialCamera, punch, stepCamera, type CameraState } from './camera.js';
import { sampleAt, type Sample } from './interp.js';
import { AudioLayer } from './audio.js';
import {
  CAMERAS, PENALTY_SPOTS, PITCH_COLOURS, directorCamera, makeProjector, mirrorCamera, mowStripes, overlayShapes, pitchLines,
  type CameraId, type CameraSpec, type FitMode, type OverlayId, type Projector,
} from './pitch.js';

/** director = follow camera at the broadcast tilt; tactical = whole pitch flat; coach = whole pitch + numbers and stamina bars. */
export type ViewMode = 'director' | 'tactical' | 'coach';
export type CameraChoice = CameraId | 'director';

export interface MatchViewOptions {
  homeColour?: number;
  awayColour?: number;
  /** Short names (kept for API compatibility; the score chrome is rendered by the app). */
  homeName?: string;
  awayName?: string;
  mode?: ViewMode;
  /** Fixed camera (overrides the mode's default). */
  camera?: CameraChoice;
  overlay?: OverlayId;
  fit?: FitMode;
  /** Pause automatically on these event types (auto-pause triggers). */
  autoPauseOn?: MatchEvent['t'][];
  /** Live mode (Phase 7): the log grows via `append`; reaching the last frame waits for data instead of stopping. */
  live?: boolean;
  /** The coach's team (0/1) for the coach view highlight and the overlays' attacking end. */
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
  /** Pick a fixed camera from the handoff table, or 'director' for the follow camera. Presentation only. */
  setCamera(c: CameraChoice): void;
  setOverlay(o: OverlayId): void;
  enableAudio(): void;
  readonly playing: boolean;
  readonly speed: number;
  readonly tick: number;
  readonly lastTick: number;
  readonly hud: HudState;
  readonly camera: CameraChoice;
  readonly overlay: OverlayId;
  onFrame(cb: (tick: number, hud: HudState) => void): void;
  /** Draw the current tick synchronously (frame-accuracy tests, screenshots, hidden tabs). */
  renderFrame(): void;
  /** Live mode: append events/frames produced since the last append (ticks must be monotone). */
  append(events: readonly MatchEvent[], frames: readonly Frame[]): void;
  /** Distance (ticks) between the play head and the newest frame — how far behind live we are. */
  readonly lag: number;
  /** Render a given tick into a w×h PNG data URL (key-moment thumbnails — from the replay, never authored). Restores the play head. */
  snapshot(tick: number, w: number, h: number, camera?: CameraChoice): string;
  destroy(): void;
}

const MARKER_R = 0.95;   // 1.9 m diameter markers
const BALL_R = 0.45;     // 0.9 m

export async function createMatchView(canvas: HTMLCanvasElement, log: MatchLog, opts: MatchViewOptions = {}): Promise<MatchView> {
  const app = new Application();
  // Phone budget (Phase 9): cap the render resolution at 1.5 and skip MSAA on coarse-pointer devices.
  const phone = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(pointer: coarse)').matches;
  await app.init({ canvas, antialias: !phone, background: 0x08120e, resolution: Math.min(phone ? 1.5 : 2, globalThis.devicePixelRatio || 1), autoDensity: true, width: Math.max(1, canvas.parentElement?.clientWidth ?? 800), height: Math.max(1, canvas.parentElement?.clientHeight ?? 450) });

  const host = canvas.parentElement;
  let lastW = -1, lastH = -1;
  /** Resize the renderer to the host element; reports whether the size actually changed. */
  const syncSize = (): boolean => {
    if (!host) return false;
    const w = host.clientWidth, h = host.clientHeight;
    if (w > 0 && h > 0 && (w !== lastW || h !== lastH)) { lastW = w; lastH = h; app.renderer.resize(w, h); return true; }
    return false;
  };

  const homeColour = opts.homeColour ?? 0x1d3557;
  const awayColour = opts.awayColour ?? 0xe63946;
  let mode: ViewMode = opts.mode ?? 'director';
  let cameraChoice: CameraChoice = opts.camera ?? (mode === 'director' ? 'director' : 'full');
  let overlay: OverlayId = opts.overlay ?? 'none';
  const fit: FitMode = opts.fit ?? 'contain';
  const nPlayers = log.header.playerIds.length;
  const teams = log.header.teams;
  const gkIndex = new Set<number>();
  { const seen = new Set<number>(); teams.forEach((tm, i) => { if (!seen.has(tm)) { seen.add(tm); gkIndex.add(i); } }); }
  let lastTick = log.frames.length ? (log.frames[log.frames.length - 1]?.tick ?? 0) : (log.events[log.events.length - 1]?.tick ?? 0);
  const live = opts.live ?? false;
  const coachTeam = opts.coachTeam ?? 0;
  const attackingEnd: 1 | -1 = coachTeam === 0 ? 1 : -1;
  const surface = log.header.surface;

  // ── layers (all screen space; the projector maps metres → pixels every draw) ──
  const pitchG = new Graphics();     // turf, stripes, lines, goals, spots
  const overlayG = new Graphics();   // press / channels / circle
  const shadowG = new Graphics();
  const actorsG = new Graphics();    // markers + ball (+ stamina bars in coach mode)
  const sheenG = new Graphics();
  const labels = new Container();
  app.stage.addChild(pitchG, overlayG, shadowG, actorsG, sheenG, labels);

  const labelStyle = new TextStyle({ fontFamily: '"IBM Plex Mono", ui-monospace, monospace', fontSize: 11, fill: 0xffffff, fontWeight: '500', letterSpacing: 0.5 });
  const labelT: Text[] = [];
  for (let i = 0; i < nPlayers; i++) {
    const t = new Text({ text: String(log.header.playerIds[i] ?? i), style: labelStyle }); t.anchor.set(0.5); t.visible = false;
    labels.addChild(t); labelT.push(t);
  }
  const banner = new Text({ text: '', style: new TextStyle({ fontFamily: '"Barlow Condensed", "Barlow", system-ui, sans-serif', fontSize: 44, fill: 0xf2f7fa, fontWeight: '700', letterSpacing: 6, dropShadow: { color: 0x000000, blur: 8, distance: 0, alpha: 0.8 } }) });
  banner.anchor.set(0.5); banner.alpha = 0;
  app.stage.addChild(banner);

  // ── playback state ────────────────────────────────────────────────────────
  let tick = 0, speed = 1, playing = false;
  let cam: CameraState = initialCamera();
  let evCursor = 0;
  let hud: HudState = { score: [0, 0], quarter: 1, clockSeconds: 0, phase: 'pre-match', lastEvent: '' };
  let slowmoUntil = -1, bannerUntil = -1, punchAt = -Infinity, wall = 0;
  const audio = new AudioLayer();
  const frameCbs: ((tick: number, hud: HudState) => void)[] = [];
  const autoPause = new Set(opts.autoPauseOn ?? []);
  let lastPitchKey = '';

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
    // re-prime the director camera at the ball (ADR-013: never interpolate across a seek)
    const s = sampleAt(log.frames, tick, nPlayers);
    if (s) cam = { ...initialCamera(), x: s.ball.x, y: s.ball.y * 0.6, width: 60 };
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

  /** The camera spec for this draw: a fixed one from the table (mirrored to the coach's attacking end for the goal cams) or the director spring. */
  function currentSpec(s: Sample, dtWall: number, aspect: number, choice: CameraChoice): CameraSpec {
    if (choice === 'director') {
      const s2 = sampleAt(log.frames, s.tick + 2, nPlayers) ?? s;
      const bv = { vx: (s2.ball.x - s.ball.x) / (2 * DT), vy: (s2.ball.y - s.ball.y) / (2 * DT) };
      const target = cameraTarget({ x: s.ball.x, y: s.ball.y, ...bv }, 'director', aspect);
      cam = stepCamera(cam, target, dtWall, 6 / Math.max(1, speed / 2));
      return directorCamera(cam.x, cam.y, cam.width * punch(wall - punchAt), aspect, 52);
    }
    const base = CAMERAS[choice];
    // goal-end cameras look at the end the coach's team attacks when the ball is in that half, else the other end
    const goalEnd: CameraId[] = ['circle', 'goalmouth', 'lowAngle', 'behindGoal', 'cornerCam', 'half'];
    if (goalEnd.includes(choice)) {
      const ballEnd: 1 | -1 = s.ball.x >= 0 ? 1 : -1;
      return ballEnd === 1 ? base : mirrorCamera(base);
    }
    return base;
  }

  function drawPitch(p: Projector): void {
    const key = `${p.width}x${p.height}:${p.spec.region.join(',')}:${p.spec.tilt}:${p.spec.yaw}:${overlay}`;
    if (key === lastPitchKey) return;
    lastPitchKey = key;
    pitchG.clear(); overlayG.clear(); sheenG.clear();
    const poly = (pts: readonly (readonly [number, number])[]): void => {
      pts.forEach(([x, y], i) => { const q = p.project(x, y); if (i === 0) pitchG.moveTo(q.x, q.y); else pitchG.lineTo(q.x, q.y); });
    };
    // turf apron + stripes
    const apron: [number, number][] = [[-HALF_LENGTH - 4, -HALF_WIDTH - 4], [HALF_LENGTH + 4, -HALF_WIDTH - 4], [HALF_LENGTH + 4, HALF_WIDTH + 4], [-HALF_LENGTH - 4, HALF_WIDTH + 4]];
    poly(apron); pitchG.closePath().fill(PITCH_COLOURS.turf);
    for (const st of mowStripes()) { poly(st.quad); pitchG.closePath().fill(st.alt ? PITCH_COLOURS.turfAlt : PITCH_COLOURS.turf); }
    if (surface !== 'dry') { poly(apron); pitchG.closePath().fill({ color: 0x7fe3b0, alpha: surface === 'watered' ? 0.035 : 0.06 }); }
    // goal boxes filled faintly, then every line
    for (const end of [1, -1] as const) {
      const gx = end * HALF_LENGTH, gd = Math.max(GOAL_DEPTH, 1.2);
      poly([[gx, -GOAL_HALF_WIDTH], [gx + end * gd, -GOAL_HALF_WIDTH], [gx + end * gd, GOAL_HALF_WIDTH], [gx, GOAL_HALF_WIDTH]]);
      pitchG.closePath().fill({ color: PITCH_COLOURS.line, alpha: 0.14 });
    }
    const lw = Math.max(1, Math.min(2, p.metre * 0.075));
    for (const line of pitchLines()) {
      if (line.dashed) {
        // dashes of ~1 m along the sampled polyline
        let on = true;
        for (let i = 1; i < line.points.length; i++) {
          const a = line.points[i - 1], b = line.points[i];
          if (!a || !b) continue;
          if (on) { const pa = p.project(a[0], a[1]), pb = p.project(b[0], b[1]); pitchG.moveTo(pa.x, pa.y).lineTo(pb.x, pb.y).stroke({ width: lw, color: PITCH_COLOURS.line, alpha: line.alpha }); }
          on = !on;
        }
      } else {
        poly(line.points); pitchG.stroke({ width: lw, color: PITCH_COLOURS.line, alpha: line.alpha });
      }
    }
    for (const [x, y] of PENALTY_SPOTS) { const q = p.project(x, y); pitchG.circle(q.x, q.y, Math.max(1.5, 0.35 * p.metre * q.k)).fill({ color: PITCH_COLOURS.line, alpha: 0.7 }); }
    // overlays
    for (const o of overlayShapes(overlay, attackingEnd)) {
      o.quad.forEach(([x, y], i) => { const q = p.project(x, y); if (i === 0) overlayG.moveTo(q.x, q.y); else overlayG.lineTo(q.x, q.y); });
      overlayG.closePath().fill({ color: o.colour, alpha: o.alpha });
      if (o.edge) {
        const e0 = o.edge[0], e1 = o.edge[1];
        if (e0 && e1) {
          // dashed leading edge
          const n = 28;
          for (let i = 0; i < n; i += 2) {
            const ax = e0[0] + (e1[0] - e0[0]) * (i / n), ay = e0[1] + (e1[1] - e0[1]) * (i / n);
            const bx = e0[0] + (e1[0] - e0[0]) * ((i + 1) / n), by = e0[1] + (e1[1] - e0[1]) * ((i + 1) / n);
            const qa = p.project(ax, ay), qb = p.project(bx, by);
            overlayG.moveTo(qa.x, qa.y).lineTo(qb.x, qb.y).stroke({ width: 1, color: 0x7fe3b0, alpha: 0.55 });
          }
        }
      }
    }
    // sheen: tilted → darker far half and a floodlit glow at the near edge; flat → gentle top glow and a bottom vignette
    const w = p.width, h = p.height;
    if (p.tilt) {
      sheenG.rect(0, 0, w, h * 0.4).fill({ color: 0x06090c, alpha: 0.3 });
      sheenG.rect(0, h * 0.6, w, h * 0.4).fill({ color: 0x000000, alpha: 0.22 });
      sheenG.ellipse(w / 2, h * 0.8, w * 0.5, h * 0.35).fill({ color: 0x7fe3b0, alpha: 0.05 });
    } else {
      sheenG.ellipse(w / 2, 0, w * 0.6, h * 0.5).fill({ color: 0x7fe3b0, alpha: 0.05 });
      sheenG.rect(0, h * 0.5, w, h * 0.5).fill({ color: 0x000000, alpha: 0.12 });
    }
  }

  function drawActors(p: Projector, s: Sample): void {
    shadowG.clear(); actorsG.clear();
    const order = s.players.map((pl, i) => ({ i, y: pl.y })).sort((a, b) => a.y - b.y); // far (small y) first under a tilt
    const showLabels = mode === 'coach';
    for (const { i } of order) {
      const pl = s.players[i]; if (!pl) continue;
      const off = Math.abs(pl.y) > HALF_WIDTH + 1.5;
      const q = p.project(pl.x, pl.y);
      const rad = MARKER_R * p.metre * q.k;
      const team = teams[i] ?? 0;
      const colour = team === 0 ? homeColour : awayColour;
      const ring = team === 0 ? PITCH_COLOURS.homeRing : PITCH_COLOURS.awayRing;
      const alpha = off ? 0.35 : 1;
      if (!off) shadowG.ellipse(q.x + rad * 0.14, q.y + rad * 0.55, rad * 1.05, rad * 0.5).fill({ color: PITCH_COLOURS.shadow.colour, alpha: PITCH_COLOURS.shadow.alpha });
      const st = Math.max(0, Math.min(1, pl.stamina));
      actorsG.circle(q.x, q.y, rad).fill({ color: colour, alpha: alpha * (0.75 + 0.25 * st) }).stroke({ width: Math.max(1, rad * 0.16), color: ring.colour, alpha: ring.alpha * alpha });
      if (gkIndex.has(i)) actorsG.circle(q.x, q.y, rad * 0.42).fill({ color: 0xf4f1e8, alpha: 0.9 * alpha });
      const t = labelT[i];
      if (t) {
        t.visible = showLabels && !off;
        if (t.visible) { t.position.set(q.x, q.y - rad - 7); t.alpha = team === coachTeam ? 1 : 0.55; t.style.fontSize = Math.max(9, Math.min(13, 10 * q.k)); }
        if (showLabels && !off) {
          actorsG.rect(q.x - rad, q.y + rad + 3, rad * 2, 3).fill({ color: 0x000000, alpha: 0.5 });
          actorsG.rect(q.x - rad, q.y + rad + 3, rad * 2 * st, 3).fill({ color: st > 0.6 ? 0x1f9a63 : st > 0.35 ? 0xf1c40f : 0xe74c3c, alpha: team === coachTeam ? 1 : 0.5 });
        }
      }
    }
    // ball: shadow on the ground, the ball lifted by its height, a soft glow
    const g = p.project(s.ball.x + s.ball.z * 0.25, s.ball.y);
    const b = p.project(s.ball.x, s.ball.y, s.ball.z);
    const br = Math.max(2.5, BALL_R * p.metre * b.k);
    shadowG.ellipse(g.x, g.y, br * 1.1 * (1 + s.ball.z * 0.15), br * 0.6).fill({ color: 0x000000, alpha: Math.max(0.12, 0.35 - s.ball.z * 0.08) });
    actorsG.circle(b.x, b.y, br * 2.2).fill({ color: PITCH_COLOURS.ball, alpha: 0.12 });
    actorsG.circle(b.x, b.y, br).fill(PITCH_COLOURS.ball).stroke({ width: 1, color: 0x000000, alpha: 0.4 });
  }

  function draw(s: Sample, dtWall: number, choice: CameraChoice = cameraChoice): void {
    const w = app.screen.width, h = app.screen.height;
    const spec = currentSpec(s, dtWall, w / Math.max(1, h), choice);
    const p = makeProjector(spec, w, h, choice === 'director' ? 'cover' : fit, choice === 'director' ? 0 : 6);
    drawPitch(p);
    drawActors(p, s);
    banner.position.set(w / 2, h * 0.28);
    banner.alpha = wall < bannerUntil ? Math.min(1, (bannerUntil - wall) / 0.4) : 0;
  }

  let last = performance.now();
  app.ticker.add(() => {
    const resized = syncSize();
    const now = performance.now();
    const dtWall = Math.min(0.1, (now - last) / 1000); last = now; wall += dtWall;
    if (playing) {
      const slow = wall < slowmoUntil ? 0.25 : 1;
      tick += dtWall * 20 * speed * slow;
      if (tick >= lastTick) { tick = lastTick; if (!live) playing = false; }
      processEvents(tick);
      if (Math.floor(tick) % 5 === 0) recomputeHud(tick);
    }
    // A paused view is a still frame (ADR-013: frame-accurate = a deterministic draw at a tick).
    // Drawing on the wall clock while paused makes the canvas drift between two reads of the same
    // tick — the play head has not moved, but interpolation, sheen and banner alpha have — which
    // breaks frame-accurate read-back and repaints a stationary picture on a phone for nothing.
    // While paused only an explicit command repaints: renderFrame(), seek(), setMode/setCamera/
    // setOverlay, or a resize (the camera transform is computed in draw(), so a new size needs one).
    if (playing || resized) {
      const s = sampleAt(log.frames, tick, nPlayers);
      if (s) draw(s, dtWall);
    }
    for (const cb of frameCbs) cb(tick, hud);
  });

  /** Draw the current tick and present it — what every command has to do while paused. */
  const renderNow = (): void => { syncSize(); const s = sampleAt(log.frames, tick, nPlayers); if (s) draw(s, 1 / 60); app.render(); };

  seekTo(0);
  renderNow(); // the view starts paused, so the first picture is drawn here rather than by the ticker

  return {
    play: () => { if (tick >= lastTick) seekTo(0); playing = true; },
    pause: () => { playing = false; },
    toggle: () => { if (playing) { playing = false; return; } if (tick >= lastTick) seekTo(0); playing = true; },
    setSpeed: (x) => { speed = Math.max(0.25, Math.min(8, x)); },
    seek: (t) => { seekTo(t); if (!playing) renderNow(); },
    setMode: (m) => { mode = m; cameraChoice = m === 'director' ? 'director' : 'full'; lastPitchKey = ''; if (!playing) renderNow(); },
    setCamera: (c) => { cameraChoice = c; lastPitchKey = ''; if (!playing) renderNow(); },
    setOverlay: (o) => { overlay = o; lastPitchKey = ''; if (!playing) renderNow(); },
    enableAudio: () => { audio.enable(); },
    get playing() { return playing; },
    get speed() { return speed; },
    get tick() { return tick; },
    get lastTick() { return lastTick; },
    get hud() { return hud; },
    get camera() { return cameraChoice; },
    get overlay() { return overlay; },
    onFrame: (cb) => { frameCbs.push(cb); },
    renderFrame: () => { renderNow(); },
    append: (events, frames) => {
      log.events.push(...events); log.frames.push(...frames);
      const lf = log.frames[log.frames.length - 1]?.tick, le = log.events[log.events.length - 1]?.tick;
      lastTick = Math.max(lastTick, lf ?? 0, log.frames.length ? 0 : (le ?? 0));
    },
    get lag() { return lastTick - tick; },
    snapshot: (t, w, h, camera = 'goalmouth') => {
      const keepTick = tick, keepPlaying = playing;
      playing = false;
      const s = sampleAt(log.frames, Math.max(0, Math.min(lastTick, t)), nPlayers);
      if (!s) return '';
      draw(s, 1 / 60, camera);
      app.render();
      const src = app.renderer.extract.canvas(app.stage) as HTMLCanvasElement;
      const out = document.createElement('canvas'); out.width = w; out.height = h;
      const ctx = out.getContext('2d');
      if (ctx) {
        // cover-fit the stage into the thumbnail
        const sc = Math.max(w / src.width, h / src.height);
        const dw = src.width * sc, dh = src.height * sc;
        ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
      }
      tick = keepTick; playing = keepPlaying; lastPitchKey = '';
      const back = sampleAt(log.frames, tick, nPlayers); if (back) draw(back, 1 / 60);
      return out.toDataURL('image/png');
    },
    destroy: () => { app.destroy(false, { children: true }); },
  };
}
