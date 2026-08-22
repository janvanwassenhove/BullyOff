<script setup lang="ts">
/**
 * A step's diagram: a slice of pitch with markers and arrows, drawn from academy data.
 * Metres in, pixels out — the conversion happens here and nowhere else (CLAUDE.md rule 12).
 */
import { computed } from 'vue';
import type { Arrow, DiagramView, Marker } from '../../lib/academy';

const props = defineProps<{ view: DiagramView; markers: Marker[]; arrows: Arrow[] }>();

/** [minX, maxX, minY, maxY] in metres for each slice. */
const BOX: Record<DiagramView, [number, number, number, number]> = {
  full: [-45.7, 45.7, -27.4, 27.4],
  attackingHalf: [0, 45.7, -27.4, 27.4],
  circle: [26, 46.7, -16.5, 16.5],
};
/**
 * How a coach draws it. A whole-pitch board is landscape with the attack going right; anything at
 * circle level is drawn with the goal at the top and the play coming up the page. Same data, two
 * projections — the engine frame never changes (ADR-001).
 */
const UPFIELD: Record<DiagramView, boolean> = { full: false, attackingHalf: true, circle: true };
const W = 520;
const box = computed(() => BOX[props.view]);
const up = computed(() => UPFIELD[props.view]);
const spanX = computed(() => box.value[1] - box.value[0]);
const spanY = computed(() => box.value[3] - box.value[2]);
const scale = computed(() => W / (up.value ? spanY.value : spanX.value));
const H = computed(() => Math.round((up.value ? spanX.value : spanY.value) * scale.value));
/** Screen x: across the pitch when the goal is at the top, along it otherwise. */
const px = (x: number, y: number): number => (up.value ? (y - box.value[2]) : (x - box.value[0])) * scale.value;
/** Screen y: down the page towards our own end when the goal is at the top. */
const py = (x: number, y: number): number => (up.value ? (box.value[1] - x) : (y - box.value[2])) * scale.value;

/**
 * The shooting circle: two quarter-arcs off the posts joined by a straight top. Sampled rather than
 * an SVG arc so it is projection-agnostic — the same points work goal-at-top and attack-to-the-right.
 */
const circlePath = computed(() => {
  const pts: string[] = [];
  const R = 14.63, GH = 1.83, GX = 45.7;
  for (let i = 0; i <= 24; i++) { const a = (Math.PI / 2) * (i / 24); pts.push(`${px(GX - R * Math.sin(a), -GH - R * Math.cos(a))},${py(GX - R * Math.sin(a), -GH - R * Math.cos(a))}`); }
  for (let i = 24; i >= 0; i--) { const a = (Math.PI / 2) * (i / 24); pts.push(`${px(GX - R * Math.sin(a), GH + R * Math.cos(a))},${py(GX - R * Math.sin(a), GH + R * Math.cos(a))}`); }
  return pts.join(' ');
});

const colour = (s: Marker['side']): string => (s === 'us' ? 'var(--accent)' : s === 'them' ? 'var(--danger)' : 'var(--fg-1)');
const dash = (k: Arrow['kind']): string => (k === 'run' ? '5 4' : k === 'carry' ? '2 3' : '0');
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
      class="turf"
    />
    <!-- the goal line, the 23 and the circle: the geometry a coach reads the picture by -->
    <line
      :x1="px(45.7, box[2])"
      :y1="py(45.7, box[2])"
      :x2="px(45.7, box[3])"
      :y2="py(45.7, box[3])"
      class="line"
    />
    <line
      :x1="px(22.9, box[2])"
      :y1="py(22.9, box[2])"
      :x2="px(22.9, box[3])"
      :y2="py(22.9, box[3])"
      class="line soft"
    />
    <line
      :x1="px(0, box[2])"
      :y1="py(0, box[2])"
      :x2="px(0, box[3])"
      :y2="py(0, box[3])"
      class="line soft"
    />
    <polyline
      :points="circlePath"
      class="line circle"
    />
    <line
      :x1="px(45.7, -1.83)"
      :y1="py(45.7, -1.83)"
      :x2="px(45.7, 1.83)"
      :y2="py(45.7, 1.83)"
      class="goal"
    />
    <g
      v-for="(a, i) in props.arrows"
      :key="'a' + i"
    >
      <line
        :x1="px(a.from[0], a.from[1])"
        :y1="py(a.from[0], a.from[1])"
        :x2="px(a.to[0], a.to[1])"
        :y2="py(a.to[0], a.to[1])"
        class="arrow"
        :stroke-dasharray="dash(a.kind)"
        marker-end="url(#ah)"
      />
    </g>
    <g
      v-for="(m, i) in props.markers"
      :key="'m' + i"
    >
      <circle
        :cx="px(m.x, m.y)"
        :cy="py(m.x, m.y)"
        :r="m.side === 'ball' ? 4 : 8"
        :fill="colour(m.side)"
        :class="{ ball: m.side === 'ball' }"
      />
      <text
        v-if="m.tag"
        :x="px(m.x, m.y)"
        :y="py(m.x, m.y) + 3.5"
        class="tag"
      >{{ m.tag }}</text>
    </g>
  </svg>
</template>

<style scoped>
.diag { width: 100%; height: auto; border-radius: 10px; display: block; }
.turf { fill: color-mix(in srgb, var(--accent) 13%, var(--surface-2)); }
.line { stroke: var(--line-strong); stroke-width: 1.6; fill: none; }
.line.soft { stroke: var(--line); }
.circle { stroke-width: 1.5; }
.goal { stroke: var(--fg-1); stroke-width: 4.5; stroke-linecap: round; }
.arrow { stroke: var(--fg-2); stroke-width: 2; }
.ball { stroke: var(--bg); stroke-width: 1.5; }
.tag { font-family: var(--font-mono, monospace); font-size: 9px; fill: var(--bg); text-anchor: middle; font-weight: 700; }
</style>
