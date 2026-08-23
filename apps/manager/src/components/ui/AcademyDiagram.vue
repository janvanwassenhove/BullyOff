<script setup lang="ts">
/**
 * A step's play, drawn through the same cameras the match viewer uses (`@bullyoff/render`): the
 * whole court for anything about shape, from behind the goal for anything that happens facing it.
 * Metres in, pixels out — the projector is the only place that conversion happens (rule 12).
 */
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { CAMERAS, PITCH_COLOURS, dShape, makeProjector, pitchLines, type Projector } from '@bullyoff/render';
import { CIRCLE_RADIUS } from '@bullyoff/shared';
import { frameAt, stepDuration, type Arrow, type Marker, type Step } from '../../lib/academy';

const props = defineProps<{ step: Step }>();
const emit = defineEmits<{ playing: [v: boolean] }>();

const W = 560, H = 340;
const proj = computed<Projector>(() => makeProjector(CAMERAS[props.step.view], W, H, 'contain', 10));
const px = (x: number, y: number): number => proj.value.project(x, y).x;
const py = (x: number, y: number): number => proj.value.project(x, y).y;
/** Perspective factor: markers shrink with depth exactly as they do in the match view. */
const pk = (x: number, y: number): number => proj.value.project(x, y).k;

const hex = (n: number): string => '#' + n.toString(16).padStart(6, '0');
const path = (pts: [number, number][]): string => pts.map((p) => `${px(p[0], p[1])},${py(p[0], p[1])}`).join(' ');
const lines = computed(() => pitchLines().map((l) => ({ d: path(l.points), alpha: l.alpha })));
const circles = computed(() => [dShape(1, CIRCLE_RADIUS), dShape(-1, CIRCLE_RADIUS)].map((c) => path(c)));

/**
 * The clock. The engine may not touch wall time (CLAUDE.md rule 4) — this is the app, where a
 * coaching board is allowed to play itself back. A step plays once on arrival and then holds the
 * finished picture, which is the frame a coach actually reads.
 */
const total = computed(() => stepDuration(props.step.arrows));
const t = ref(total.value);
let raf = 0;
let start = 0;

const reduced = (): boolean => {
  try { return globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; }
};

function stop(): void { if (raf) { cancelAnimationFrame(raf); raf = 0; } emit('playing', false); }

function play(): void {
  stop();
  if (reduced()) { t.value = total.value; return; } // straight to the end state: no motion, same picture
  t.value = 0;
  start = performance.now();
  emit('playing', true);
  const tick = (): void => {
    t.value = (performance.now() - start) / 1000;
    if (t.value >= total.value) { t.value = total.value; raf = 0; emit('playing', false); return; }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
}

watch(() => props.step, () => { play(); }, { immediate: true });
onBeforeUnmount(stop);
defineExpose({ play });

const frame = computed(() => frameAt(props.step, t.value));
const markers = computed<Marker[]>(() => frame.value.markers);
const arrows = computed<Arrow[]>(() => props.step.arrows);

const colour = (s: Marker['side']): string => (s === 'us' ? 'var(--accent)' : s === 'them' ? 'var(--danger)' : hex(PITCH_COLOURS.ball));
const dash = (k: Arrow['kind']): string => (k === 'run' ? '6 5' : k === 'carry' ? '2 4' : '0');
/** A revealed arrow's tip, so the trail ends exactly where the thing that draws it has got to. */
const tip = (a: Arrow, u: number): [number, number] => [a.from[0] + (a.to[0] - a.from[0]) * u, a.from[1] + (a.to[1] - a.from[1]) * u];
</script>

<template>
  <svg
    class="diag"
    :viewBox="`0 0 ${W} ${H}`"
    role="img"
  >
    <defs>
      <marker
        id="ah"
        viewBox="0 0 8 8"
        refX="7"
        refY="4"
        markerWidth="6"
        markerHeight="6"
        orient="auto-start-reverse"
      >
        <path
          d="M0,0 L8,4 L0,8 z"
          fill="var(--fg-2)"
        />
      </marker>
    </defs>
    <rect
      :width="W"
      :height="H"
      :fill="hex(PITCH_COLOURS.turf)"
    />
    <polyline
      v-for="(l, i) in lines"
      :key="'l' + i"
      :points="l.d"
      class="line"
      :stroke-opacity="l.alpha"
    />
    <polyline
      v-for="(c, i) in circles"
      :key="'c' + i"
      :points="c"
      class="line"
      stroke-opacity="0.55"
    />
    <g
      v-for="(a, i) in arrows"
      :key="'a' + i"
    >
      <line
        :x1="px(a.from[0], a.from[1])"
        :y1="py(a.from[0], a.from[1])"
        :x2="px(a.to[0], a.to[1])"
        :y2="py(a.to[0], a.to[1])"
        class="arrow ghost"
        :stroke-dasharray="dash(a.kind)"
      />
      <line
        v-if="(frame.reveal[i] ?? 0) > 0.02"
        :x1="px(a.from[0], a.from[1])"
        :y1="py(a.from[0], a.from[1])"
        :x2="px(tip(a, frame.reveal[i] ?? 0)[0], tip(a, frame.reveal[i] ?? 0)[1])"
        :y2="py(tip(a, frame.reveal[i] ?? 0)[0], tip(a, frame.reveal[i] ?? 0)[1])"
        class="arrow"
        :stroke-dasharray="dash(a.kind)"
        :marker-end="(frame.reveal[i] ?? 0) > 0.98 ? 'url(#ah)' : undefined"
      />
    </g>
    <g
      v-for="(m, i) in markers"
      :key="'m' + i"
    >
      <ellipse
        v-if="m.side !== 'ball'"
        :cx="px(m.x, m.y)"
        :cy="py(m.x, m.y) + 2"
        :rx="9 * pk(m.x, m.y)"
        :ry="3.5 * pk(m.x, m.y)"
        class="shadow"
      />
      <circle
        :cx="px(m.x, m.y)"
        :cy="py(m.x, m.y)"
        :r="(m.side === 'ball' ? 4.5 : 9) * pk(m.x, m.y)"
        :fill="colour(m.side)"
        :class="{ ball: m.side === 'ball' }"
      />
      <text
        v-if="m.tag"
        :x="px(m.x, m.y)"
        :y="py(m.x, m.y) + 3.5 * pk(m.x, m.y)"
        class="tag"
        :style="{ fontSize: 10 * pk(m.x, m.y) + 'px' }"
      >{{ m.tag }}</text>
    </g>
  </svg>
</template>

<style scoped>
.diag { width: 100%; height: auto; border-radius: 10px; display: block; background: var(--surface-2); }
.line { stroke: #f0fff8; stroke-width: 1.4; fill: none; }
.arrow { stroke: #f4f1e8; stroke-width: 2.2; }
.arrow.ghost { stroke: #f4f1e8; stroke-opacity: 0.25; stroke-width: 1.5; }
.ball { stroke: #0a0d10; stroke-width: 1.2; }
.shadow { fill: #000; fill-opacity: 0.34; }
.tag { fill: #0a0d10; text-anchor: middle; font-weight: 700; font-family: var(--font-mono, monospace); }
</style>
