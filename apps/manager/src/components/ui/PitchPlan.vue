<script setup lang="ts">
/**
 * The plan on a real pitch: FIH geometry to scale (91.4 × 55 m, the circle a 14.63 m arc off the
 * posts, the 23 m lines where they belong) with your eleven in their formation slots and the two
 * lines that a pressing system actually means — where the first defender engages and where the back
 * line sits. A press is a *place on the pitch*; a slider cannot show that and a bare rectangle
 * cannot either. Metres in, pixels out, here and nowhere else (CLAUDE.md rule 12).
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FORMATIONS, backLineM, pressLineM, type FormationId } from '@bullyoff/engine';

const props = defineProps<{ formation: FormationId; pressHeight: number; defensiveLine: number }>();
const { t } = useI18n();

const LENGTH = 91.4, WIDTH = 55, R = 14.63, GOAL_HALF = 1.83, LINE23 = 22.9;
const W = 640;
const S = W / LENGTH;
const H = Math.round(WIDTH * S);
/** x runs from our backline (0) to theirs (91.4); y from the near sideline down. */
const X = (m: number): number => m * S;
const Y = (m: number): number => (m + WIDTH / 2) * S;

const slots = computed(() => FORMATIONS[props.formation]);
/** The shooting circle: a quarter arc off each post joined across the top, sampled so it is exact. */
const circle = (end: 0 | 1): string => {
  const gx = end === 0 ? 0 : LENGTH;
  const dir = end === 0 ? 1 : -1;
  const pts: string[] = [];
  for (let i = 0; i <= 20; i++) { const a = (Math.PI / 2) * (i / 20); pts.push(`${X(gx + dir * R * Math.sin(a))},${Y(-GOAL_HALF - R * Math.cos(a))}`); }
  for (let i = 20; i >= 0; i--) { const a = (Math.PI / 2) * (i / 20); pts.push(`${X(gx + dir * R * Math.sin(a))},${Y(GOAL_HALF + R * Math.cos(a))}`); }
  return pts.join(' ');
};
/**
 * Not fractions of the pitch: the AI reads these knobs as metres (pressLineM / backLineM), and the
 * board has to put the lines where the players will actually stand.
 */
const pressX = computed(() => X(pressLineM(props.pressHeight)));
const lineX = computed(() => X(backLineM(props.defensiveLine)));
const bandFrom = computed(() => Math.min(pressX.value, lineX.value));
const bandTo = computed(() => Math.max(pressX.value, lineX.value));
const dotColour = (role: string): string => (role === 'GK' ? 'var(--signal)' : role === 'DEF' ? 'var(--accent-soft)' : role === 'MID' ? 'var(--accent)' : '#f2f7fa');
</script>

<template>
  <svg
    class="plan"
    :viewBox="`0 0 ${W} ${H}`"
    role="img"
    :aria-label="t('coach.planLabel')"
  >
    <rect
      :width="W"
      :height="H"
      class="turf"
    />
    <rect
      v-for="i in 8"
      :key="i"
      :x="((i - 1) * W) / 8"
      :width="W / 8"
      :height="H"
      class="mow"
      :class="{ alt: i % 2 === 0 }"
    />
    <!-- the block this system works in -->
    <rect
      :x="bandFrom"
      :width="Math.max(2, bandTo - bandFrom)"
      :height="H"
      class="band"
    />

    <!-- FIH markings -->
    <rect
      x="1"
      y="1"
      :width="W - 2"
      :height="H - 2"
      class="line"
    />
    <line
      :x1="X(LENGTH / 2)"
      :y1="0"
      :x2="X(LENGTH / 2)"
      :y2="H"
      class="line"
    />
    <line
      v-for="x in [LINE23, LENGTH - LINE23]"
      :key="x"
      :x1="X(x)"
      :y1="0"
      :x2="X(x)"
      :y2="H"
      class="line soft"
    />
    <polyline
      v-for="end in ([0, 1] as const)"
      :key="end"
      :points="circle(end)"
      class="line"
      fill="none"
    />
    <rect
      v-for="end in ([0, 1] as const)"
      :key="`g${end}`"
      :x="end === 0 ? X(0) - 6 : X(LENGTH)"
      :y="Y(-GOAL_HALF)"
      width="6"
      :height="GOAL_HALF * 2 * S"
      class="goal"
    />

    <!-- the two lines a press actually means -->
    <line
      :x1="lineX"
      :y1="0"
      :x2="lineX"
      :y2="H"
      class="mark back"
    />
    <line
      :x1="pressX"
      :y1="0"
      :x2="pressX"
      :y2="H"
      class="mark press"
    />
    <text
      :x="pressX + 6"
      :y="16"
      class="tag press"
    >{{ t('coach.pressLine') }}</text>
    <text
      :x="lineX + 6"
      :y="H - 8"
      class="tag back"
    >{{ t('coach.backLine') }}</text>

    <!-- the eleven -->
    <g
      v-for="(s, i) in slots"
      :key="i"
    >
      <circle
        :cx="X(s.xp)"
        :cy="Y(s.y)"
        :r="7"
        :fill="dotColour(s.role)"
        class="dot"
      />
      <text
        :x="X(s.xp)"
        :y="Y(s.y) + 3"
        class="num"
      >{{ i === 0 ? '1' : i + 1 }}</text>
    </g>

    <!-- which way we attack -->
    <line
      :x1="X(LENGTH / 2) - 26"
      :y1="H - 14"
      :x2="X(LENGTH / 2) + 26"
      :y2="H - 14"
      class="arrow"
    />
    <polygon
      :points="`${X(LENGTH / 2) + 26},${H - 18} ${X(LENGTH / 2) + 34},${H - 14} ${X(LENGTH / 2) + 26},${H - 10}`"
      class="arrowhead"
    />
  </svg>
</template>

<style scoped>
.plan { width: 100%; max-width: 620px; height: auto; display: block; border: 1px solid var(--hairline); border-radius: 6px; }
.turf { fill: var(--turf); }
.mow { fill: var(--turf); }
.mow.alt { fill: var(--turf-alt); }
.band { fill: rgba(31, 154, 99, 0.16); }
.line { fill: none; stroke: rgba(242, 247, 250, 0.55); stroke-width: 1.5; }
.line.soft { stroke: rgba(242, 247, 250, 0.28); }
.goal { fill: #f2f7fa; opacity: 0.9; }
.mark { stroke-width: 2; stroke-dasharray: 7 5; }
.mark.press { stroke: var(--signal); }
.mark.back { stroke: var(--accent-soft); }
.tag { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.1em; }
.tag.press { fill: var(--signal); }
.tag.back { fill: var(--accent-soft); }
.dot { stroke: rgba(6, 9, 12, 0.55); stroke-width: 1.5; }
.num { font-family: var(--font-mono); font-size: 8px; fill: #06080a; text-anchor: middle; }
.arrow { stroke: rgba(242, 247, 250, 0.5); stroke-width: 1.5; }
.arrowhead { fill: rgba(242, 247, 250, 0.5); }
</style>
