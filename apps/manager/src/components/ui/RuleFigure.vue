<script setup lang="ts">
/**
 * A rule scene drawn as a side elevation: the view from the sideline, with figures, a stick whose
 * flat face and rounded back you can tell apart, and the ball's height above the ground. Metres in,
 * pixels out — the conversion lives here and nowhere else (CLAUDE.md rule 12). The scene loops with
 * a hold on the verdict, which is the frame a player actually reads.
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { BACKBOARD_Z, GOAL_Z, KNEE_Z, ballAt, poseOf, sampleScene, type FigureSample, type FigureScene, type Side } from '../../lib/ruleFigures';

const props = defineProps<{ scene: FigureScene }>();
const { t: tr } = useI18n();

const W = 640;
const S = computed(() => W / props.scene.width);
const H = Math.round((W * 9) / 16); // the stage is 16:9; scenes are laid out on the ground and the rest is sky
const groundY = computed(() => H - 0.45 * S.value);
const X = (m: number): number => m * S.value;
const Y = (z: number): number => groundY.value - z * S.value;

const HOLD = 1.3; // the verdict stays up before the scene starts again
const time = ref(0);
let raf = 0, acc = 0, last = 0;
const reduced = (): boolean => { try { return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };

function stop(): void { if (raf) { cancelAnimationFrame(raf); raf = 0; } }
function start(): void {
  stop();
  // no motion: hold the decisive frame instead
  if (reduced()) { time.value = props.scene.verdict?.t ?? props.scene.seconds; return; }
  acc = 0; last = performance.now();
  const step = (now: number): void => {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; // clamped: a hidden tab must not jump
    acc += dt;
    if (acc > props.scene.seconds + HOLD) acc = 0;
    time.value = Math.min(acc, props.scene.seconds);
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
}
watch(() => props.scene, start, { immediate: true });
onBeforeUnmount(stop);

const frame = computed(() => sampleScene(props.scene, time.value));
const ball = computed(() => frame.value.ball);
/** The flight path so far: a ball in the air needs a trace to read as a flight. */
const trail = computed(() => {
  const out: { x: number; y: number; a: number }[] = [];
  const n = 14;
  for (let i = 0; i < n; i++) {
    const u = (i + 1) / (n + 1);
    const b = ballAt(props.scene, time.value * u);
    if (b.z > 0.12) out.push({ x: X(b.x), y: Y(b.z), a: 0.05 + 0.25 * u });
  }
  return out;
});
const shadowR = computed(() => 7 * (1 + ball.value.z * 0.25));

const COLOUR: Record<Side, string> = { us: 'var(--accent)', them: 'var(--danger)', umpire: 'var(--fg-2)' };
const CARD: Record<'green' | 'yellow' | 'red', string> = { green: 'var(--accent)', yellow: 'var(--signal)', red: 'var(--danger)' };

interface Drawn {
  side: Side; colour: string; mark: FigureSample['mark']; arm: number;
  torso: string; head: { x: number; y: number; r: number }; legs: string; arms: string; shaft: string;
  /** the stick head: the edge that meets the ball is the bright straight face, or the dark round back */
  bottomEdge: string; topEdge: string; backOnBall: boolean; carries: boolean;
  markAt: { x: number; y: number } | null;
  cardAt: { x: number; y: number } | null;
}

const figures = computed<Drawn[]>(() => frame.value.figures.map((f) => {
  const p = poseOf(f);
  const carries = f.side !== 'umpire'; // an umpire has a whistle and a card, not a stick
  const flat = f.face === 'flat';
  const base = p.stickHead, tip = p.hookTip;
  const bx = X(base.x), by = Y(base.z), tx = X(tip.x), ty = Y(tip.z);
  const bulge = 0.11 * S.value; // how far the rounded back stands off the flat face
  // Flat face down = the legal picture: a straight edge on the ball, the round back on top.
  // Reversed, the head is turned over: the round back is what meets the ball.
  const straight = `M ${bx} ${by} L ${tx} ${ty}`;
  const curveUp = `M ${bx} ${by} Q ${(bx + tx) / 2} ${by - bulge} ${tx} ${ty}`;
  const curveDown = `M ${bx} ${by - bulge} Q ${(bx + tx) / 2} ${by + bulge * 0.35} ${tx} ${ty - bulge}`;
  const straightUp = `M ${bx} ${by - bulge} L ${tx} ${ty - bulge}`;
  const markAt = f.mark === 'foot' ? { x: X(p.feet[1].x), y: Y(0.08) }
    : f.mark === 'stick' ? { x: (bx + tx) / 2, y: (by + ty) / 2 }
      : f.mark === 'body' ? { x: X(p.shoulder.x), y: Y(p.shoulder.z - 0.15) } : null;
  return {
    side: f.side, colour: COLOUR[f.side], mark: f.mark, arm: f.arm,
    torso: `M ${X(p.hip.x)} ${Y(p.hip.z)} L ${X(p.shoulder.x)} ${Y(p.shoulder.z)}`,
    head: { x: X(p.head.x), y: Y(p.head.z), r: 0.115 * S.value },
    legs: `M ${X(p.feet[0].x)} ${Y(0)} L ${X(p.hip.x)} ${Y(p.hip.z)} L ${X(p.feet[1].x)} ${Y(0)}`,
    arms: `M ${X(p.shoulder.x)} ${Y(p.shoulder.z)} L ${X(p.hands.x)} ${Y(p.hands.z)}`
      + (f.arm > 0.02 ? ` M ${X(p.shoulder.x)} ${Y(p.shoulder.z)} L ${X(p.armTip.x)} ${Y(p.armTip.z)}` : ''),
    shaft: `M ${X(p.hands.x)} ${Y(p.hands.z)} L ${bx} ${by}`,
    bottomEdge: flat ? straight : curveDown,
    topEdge: flat ? curveUp : straightUp,
    backOnBall: !flat, carries,
    markAt,
    cardAt: f.side === 'umpire' && f.arm > 0.5 ? { x: X(p.armTip.x), y: Y(p.armTip.z) } : null,
  };
}));

const show = computed(() => props.scene.show ?? []);
const has = (k: string): boolean => show.value.includes(k as 'goal');
const insetFace = computed(() => frame.value.figures.find((f) => f.face === 'back') ? 'back' : 'flat');
</script>

<template>
  <div class="wrap">
    <svg
      class="fig"
      :viewBox="`0 0 ${W} ${H}`"
      role="img"
      :aria-label="tr('rules.stageLabel')"
    >
      <!-- ground -->
      <rect
        :y="groundY"
        :width="W"
        :height="H - groundY"
        class="soil"
      />
      <defs>
        <radialGradient
          id="sky"
          cx="50%"
          cy="0%"
          r="90%"
        >
          <stop
            offset="0%"
            stop-color="#12241d"
          />
          <stop
            offset="100%"
            stop-color="#08120e"
          />
        </radialGradient>
      </defs>
      <rect
        :width="W"
        :height="groundY"
        fill="url(#sky)"
      />
      <line
        :x1="0"
        :y1="groundY"
        :x2="W"
        :y2="groundY"
        class="ground"
      />

      <!-- the geometry that makes the rule readable -->
      <template v-if="has('kneeLine')">
        <line
          :x1="0"
          :y1="Y(KNEE_Z)"
          :x2="W"
          :y2="Y(KNEE_Z)"
          class="guide"
        />
        <text
          :x="8"
          :y="Y(KNEE_Z) - 6"
          class="tag"
        >{{ tr('rules.legend.knee') }}</text>
      </template>
      <template v-if="has('goal') && scene.goalX !== undefined">
        <rect
          :x="X(scene.goalX)"
          :y="Y(GOAL_Z)"
          :width="0.9 * S"
          :height="GOAL_Z * S"
          class="goal"
        />
        <line
          :x1="X(scene.goalX)"
          :y1="groundY"
          :x2="X(scene.goalX)"
          :y2="Y(GOAL_Z)"
          class="post"
        />
      </template>
      <template v-if="has('backboard') && scene.goalX !== undefined">
        <rect
          :x="X(scene.goalX) - 3"
          :y="Y(BACKBOARD_Z)"
          :width="6"
          :height="BACKBOARD_Z * S"
          class="board"
        />
        <line
          :x1="0"
          :y1="Y(BACKBOARD_Z)"
          :x2="W"
          :y2="Y(BACKBOARD_Z)"
          class="guide"
        />
        <text
          :x="8"
          :y="Y(BACKBOARD_Z) - 6"
          class="tag"
        >{{ tr('rules.legend.backboard') }}</text>
      </template>
      <template
        v-for="(d, di) in scene.dimensions ?? []"
        :key="di"
      >
        <line
          :x1="X(d.from)"
          :y1="Y(scene.height * 0.86)"
          :x2="X(d.to)"
          :y2="Y(scene.height * 0.86)"
          class="dim"
        />
        <line
          v-for="e in [d.from, d.to]"
          :key="e"
          :x1="X(e)"
          :y1="Y(scene.height * 0.86) - 6"
          :x2="X(e)"
          :y2="Y(scene.height * 0.86) + 6"
          class="dim"
        />
        <text
          :x="(X(d.from) + X(d.to)) / 2"
          :y="Y(scene.height * 0.86) - 8"
          class="tag mid"
        >{{ d.label }}</text>
      </template>

      <!-- figures -->
      <g
        v-for="(f, i) in figures"
        :key="i"
        :style="{ color: f.colour }"
      >
        <path
          :d="f.legs"
          class="limb"
        />
        <path
          :d="f.torso"
          class="torso"
        />
        <path
          :d="f.arms"
          class="limb"
        />
        <circle
          :cx="f.head.x"
          :cy="f.head.y"
          :r="f.head.r"
          class="head"
        />
        <path
          v-if="f.carries"
          :d="f.shaft"
          class="shaft"
        />
        <path
          v-if="f.carries"
          :d="f.topEdge"
          :class="f.backOnBall ? 'face dim' : 'back'"
        />
        <path
          v-if="f.carries"
          :d="f.bottomEdge"
          :class="f.backOnBall ? 'back hot' : 'face'"
        />
        <!-- Real hockey cards are shaped as well as coloured (colour-blind players read the shape):
             green is triangular, yellow rectangular, red round. -->
        <polygon
          v-if="f.cardAt && frame.card === 'green'"
          :points="`${f.cardAt.x},${f.cardAt.y - 12} ${f.cardAt.x - 9},${f.cardAt.y + 8} ${f.cardAt.x + 9},${f.cardAt.y + 8}`"
          :fill="CARD.green"
          class="card"
        />
        <rect
          v-if="f.cardAt && frame.card === 'yellow'"
          :x="f.cardAt.x - 7"
          :y="f.cardAt.y - 10"
          width="14"
          height="20"
          rx="2"
          :fill="CARD.yellow"
          class="card"
        />
        <circle
          v-if="f.cardAt && frame.card === 'red'"
          :cx="f.cardAt.x"
          :cy="f.cardAt.y"
          r="10"
          :fill="CARD.red"
          class="card"
        />
        <circle
          v-if="f.markAt"
          :cx="f.markAt.x"
          :cy="f.markAt.y"
          r="13"
          class="mark"
        />
      </g>

      <!-- ball: drawn larger than life (a 36 mm ball would be two pixels) -->
      <ellipse
        :cx="X(ball.x)"
        :cy="groundY"
        :rx="shadowR"
        :ry="shadowR * 0.32"
        class="shadow"
      />
      <circle
        v-for="(p, i) in trail"
        :key="i"
        :cx="p.x"
        :cy="p.y"
        r="4"
        class="tr"
        :style="{ opacity: p.a }"
      />
      <circle
        :cx="X(ball.x)"
        :cy="Y(ball.z)"
        r="7"
        class="ball"
      />

      <!-- the flat face against the rounded back, as a cross-section -->
      <g
        v-if="has('stickInset')"
        :transform="`translate(${W - 78}, 30)`"
      >
        <circle
          r="26"
          class="inset"
        />
        <path
          :d="insetFace === 'flat' ? 'M -17 6 A 17 17 0 0 1 17 6 Z' : 'M -17 -6 A 17 17 0 0 0 17 -6 Z'"
          :class="insetFace === 'flat' ? 'dshape' : 'dshape hot'"
        />
        <line
          :x1="-17"
          :y1="insetFace === 'flat' ? 6 : -6"
          :x2="17"
          :y2="insetFace === 'flat' ? 6 : -6"
          class="chord"
        />
        <text
          :y="44"
          class="tag mid"
          :class="{ hot: insetFace === 'back' }"
        >{{ insetFace === 'flat' ? tr('rules.legend.flat') : tr('rules.legend.back') }}</text>
      </g>
    </svg>

    <Transition name="verd">
      <span
        v-if="frame.verdict"
        class="verdict display"
      >{{ tr(frame.verdict) }}</span>
    </Transition>
  </div>
</template>

<style scoped>
.wrap { position: relative; width: 100%; height: 100%; display: grid; place-items: center; background: #08120e; overflow: hidden; }
.fig { width: 100%; height: 100%; display: block; }
.soil { fill: var(--turf); opacity: 0.55; }
.ground { stroke: var(--turf-alt); stroke-width: 2; }
.guide { stroke: var(--fg-dim); stroke-width: 1.5; stroke-dasharray: 6 5; opacity: 0.75; }
.dim { stroke: var(--signal); stroke-width: 1.5; }
.tag { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; fill: var(--fg-muted); }
.tag.mid { text-anchor: middle; fill: var(--signal); }
.goal { fill: rgba(242, 247, 250, 0.05); stroke: #f2f7fa; stroke-width: 2; }
.post { stroke: #f2f7fa; stroke-width: 3; }
.board { fill: var(--signal); opacity: 0.8; }
.limb { stroke: currentColor; stroke-width: 3.5; fill: none; stroke-linecap: round; stroke-linejoin: round; opacity: 0.9; }
.torso { stroke: currentColor; stroke-width: 6; fill: none; stroke-linecap: round; }
.head { fill: currentColor; }
.shaft { stroke: #e9e4d8; stroke-width: 3; fill: none; stroke-linecap: round; }
.face { stroke: #f2f7fa; stroke-width: 5; fill: none; stroke-linecap: round; }
.face.dim { stroke: var(--fg-dim); stroke-width: 3; }
.back { stroke: var(--fg-muted); stroke-width: 4; fill: none; stroke-linecap: round; }
.back.hot { stroke: var(--danger); stroke-width: 5; }
.card { stroke: rgba(0, 0, 0, 0.5); stroke-width: 1; }
.mark { fill: none; stroke: var(--danger); stroke-width: 2.5; animation: bo-pulse 1.1s ease-in-out infinite; }
.shadow { fill: rgba(0, 0, 0, 0.4); }
.ball { fill: #f4f1e8; stroke: #06080a; stroke-width: 1.5; }
.tr { fill: #f4f1e8; }
.inset { fill: rgba(6, 9, 12, 0.85); stroke: var(--hairline); stroke-width: 1; }
.dshape { fill: var(--fg-dim); opacity: 0.55; }
.dshape.hot { fill: var(--danger); opacity: 0.75; }
.chord { stroke: #f2f7fa; stroke-width: 3.5; }
.tag.hot { fill: var(--danger); }
.verdict { position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%); font-size: 17px; font-weight: 600; letter-spacing: 0.14em; color: var(--ink); background: var(--signal); padding: 6px 16px; border-radius: 5px; white-space: nowrap; }
.verd-enter-active { transition: opacity 0.25s ease, transform 0.25s ease; }
.verd-enter-from { opacity: 0; transform: translate(-50%, 8px); }
.verd-leave-active { transition: opacity 0.15s ease; }
.verd-leave-to { opacity: 0; }
@media (prefers-reduced-motion: reduce) { .mark { animation: none; } }
</style>
