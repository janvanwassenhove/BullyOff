/**
 * The pitch model and the seven-angle camera projection (pure maths, no canvas).
 */
import { describe, expect, it } from 'vitest';
import { HALF_LENGTH, HALF_WIDTH, LINE_23_X } from '@bullyoff/shared';
import { CAMERAS, CAMERA_IDS, dShape, directorCamera, makeProjector, mirrorCamera, mowStripes, overlayShapes, pitchLines } from './pitch.js';

describe('pitch geometry', () => {
  it('draws a real FIH pitch: boundary, centre line, both 23 m lines, two Ds of radius 14.63 struck from the posts, dashed 5 m lines, goals, hash marks', () => {
    const lines = pitchLines();
    const boundary = lines[0]!;
    expect(Math.min(...boundary.points.map((p) => p[0]))).toBeCloseTo(-HALF_LENGTH, 6);
    expect(Math.max(...boundary.points.map((p) => p[0]))).toBeCloseTo(HALF_LENGTH, 6);
    expect(Math.max(...lines.flatMap((l) => l.points.map((p) => p[0])))).toBeGreaterThan(HALF_LENGTH); // goal box behind the line
    expect(lines.some((l) => l.points.every((p) => p[0] === LINE_23_X))).toBe(true);
    expect(lines.some((l) => l.points.every((p) => p[0] === -LINE_23_X))).toBe(true);
    expect(lines.filter((l) => l.dashed).length).toBe(2);
    expect(lines.filter((l) => l.points.length === 2 && l.points[0]![1] === l.points[1]![1] && Math.abs(Math.abs(l.points[1]![0] - l.points[0]![0]) - 0.3) < 1e-6).length).toBe(18); // 9 hash marks per side
    const d = dShape(1, 14.63);
    // the D's top straight sits 14.63 m from the backline, spans the goal width, arcs reach the backline
    const top = d.filter((p) => Math.abs(p[0] - (HALF_LENGTH - 14.63)) < 1e-6);
    expect(top.length).toBeGreaterThanOrEqual(2);
    expect(d[0]![0]).toBeCloseTo(HALF_LENGTH, 6);
    expect(Math.abs(d[0]![1])).toBeCloseTo(1.83 + 14.63, 6);
    expect(mowStripes().length).toBe(19); // 91.4 / 5, last one 1.4 m wide
  });

  it('overlays: press shades the half beyond the halfway line towards the attacked goal; three channels of 18.33 m; the circle highlights the attacking D', () => {
    const press = overlayShapes('press', 1)[0]!;
    expect(press.quad.every((p) => p[0] >= 0)).toBe(true);
    expect(overlayShapes('press', -1)[0]!.quad.every((p) => p[0] <= 0)).toBe(true);
    const ch = overlayShapes('channels', 1);
    expect(ch.length).toBe(3);
    expect(ch[1]!.quad[0]![1]).toBeCloseTo(-HALF_WIDTH + 55 / 3, 6);
    expect(overlayShapes('circle', 1)[0]!.quad.every((p) => p[0] > HALF_LENGTH - 15)).toBe(true);
    expect(overlayShapes('none', 1)).toEqual([]);
  });
});

describe('camera projection', () => {
  it('full camera (contain) maps the pitch corners inside the viewport, centred, top-down', () => {
    const p = makeProjector(CAMERAS.full, 914, 550);
    const tl = p.project(-HALF_LENGTH, -HALF_WIDTH), br = p.project(HALF_LENGTH, HALF_WIDTH), c = p.project(0, 0);
    expect(tl.x).toBeCloseTo(0, 6); expect(tl.y).toBeCloseTo(0, 6);
    expect(br.x).toBeCloseTo(914, 6); expect(br.y).toBeCloseTo(550, 6);
    expect(c.x).toBeCloseTo(457, 6); expect(c.y).toBeCloseTo(275, 6);
    expect(p.metre).toBeCloseTo(10, 6);
    expect(tl.k).toBe(1);
  });
  it('cover fit fills the viewport (scale is the larger of the two)', () => {
    const p = makeProjector(CAMERAS.full, 400, 400, 'cover');
    expect(p.metre).toBeCloseTo(400 / 55, 6);
  });
  it('a tilted camera makes the far edge smaller than the near edge and keeps the centre put', () => {
    const p = makeProjector(CAMERAS.broadcast, 900, 506);
    const [x0, y0, x1, y1] = CAMERAS.broadcast.region;
    const far = p.project(0, -HALF_WIDTH), near = p.project(0, HALF_WIDTH), c = p.project((x0 + x1) / 2, (y0 + y1) / 2);
    expect(near.k).toBeGreaterThan(far.k);
    expect(c.x).toBeCloseTo(450, 3); expect(c.y).toBeCloseTo(253, 3);
    // the near sideline is wider on screen than the far sideline
    const farL = p.project(-40, -HALF_WIDTH), farR = p.project(40, -HALF_WIDTH);
    const nearL = p.project(-40, HALF_WIDTH), nearR = p.project(40, HALF_WIDTH);
    expect(nearR.x - nearL.x).toBeGreaterThan(farR.x - farL.x);
    // height lifts a point up the screen
    expect(p.project(10, 10, 1).y).toBeLessThan(p.project(10, 10, 0).y);
  });
  it('a −90° yaw (behind the goal) turns the length into the vertical screen axis', () => {
    const p = makeProjector({ ...CAMERAS.behindGoal, tilt: 0 }, 600, 400);
    const a = p.project(HALF_LENGTH - 5, 0), b = p.project(HALF_LENGTH - 15, 0);
    expect(Math.abs(a.x - b.x)).toBeLessThan(1e-6);
    expect(Math.abs(a.y - b.y)).toBeGreaterThan(10);
  });
  it('mirroring a goal-end camera looks at the west goal with the same angle', () => {
    const m = mirrorCamera(CAMERAS.goalmouth);
    expect(m.region[0]).toBeCloseTo(-CAMERAS.goalmouth.region[2], 6);
    expect(m.region[2]).toBeCloseTo(-CAMERAS.goalmouth.region[0], 6);
    expect(m.yaw).toBe(180);
  });
  it('the director camera is a broadcast-tilted region around a point; every table camera has a label key', () => {
    const d = directorCamera(10, -5, 60, 16 / 9);
    expect(d.tilt).toBe(52);
    expect((d.region[0] + d.region[2]) / 2).toBeCloseTo(10, 6);
    expect(d.region[2] - d.region[0]).toBeCloseTo(60, 6);
    for (const id of CAMERA_IDS) expect(CAMERAS[id].labelKey).toMatch(/^camera\./);
  });
});
