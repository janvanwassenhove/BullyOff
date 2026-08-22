<script setup lang="ts">
/**
 * A club crest from worldgen's badge seed: `shape` (shield / roundel / crest / diamond /
 * pennant) × `split` (halves / quarters / band / plain) in the kit colours. CSS primitives
 * only — never per-club art (design handoff § 04, ADR-012).
 */
import { computed } from 'vue';

const props = withDefaults(defineProps<{
  colours: [number, number];
  shape?: string;
  split?: string;
  /** Width in px; height follows the shape's ratio. */
  size?: number;
  /** Light border (detail banner) instead of the hairline. */
  light?: boolean;
}>(), { shape: 'shield', split: 'band', size: 38, light: false });

const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const c1 = computed(() => hex(props.colours[0]));
const c2 = computed(() => hex(props.colours[1]));
const h = computed(() => Math.round(props.size * (props.shape === 'roundel' ? 1 : props.shape === 'pennant' ? 1.3 : props.shape === 'diamond' ? 1.1 : 44 / 38)));
const radius = computed(() => {
  const s = props.size;
  switch (props.shape) {
    case 'roundel': return '50%';
    case 'crest': return `${s * 0.1}px ${s * 0.1}px ${s * 0.5}px ${s * 0.5}px / ${s * 0.1}px ${s * 0.1}px ${s * 0.7}px ${s * 0.7}px`;
    case 'diamond': return `${s * 0.12}px`;
    case 'pennant': return `${s * 0.1}px ${s * 0.1}px 0 0`;
    default: return `${s * 0.105}px ${s * 0.105}px ${s * 0.42}px ${s * 0.42}px`;
  }
});
const clip = computed(() => (props.shape === 'pennant' ? 'polygon(0 0, 100% 0, 100% 72%, 50% 100%, 0 72%)' : props.shape === 'diamond' ? 'polygon(50% 0, 100% 50%, 50% 100%, 0 50%)' : 'none'));
const band = computed(() => {
  switch (props.split) {
    case 'halves': return { left: '50%', right: '0', top: '0', bottom: '0' };
    case 'quarters': return { left: '0', right: '50%', top: '0', height: '50%' };
    case 'plain': return null;
    default: return { left: '0', right: '0', top: '38%', height: '22%' };
  }
});
</script>

<template>
  <span
    class="crest"
    :style="{ width: size + 'px', height: h + 'px', background: c1, borderRadius: radius, clipPath: clip, borderColor: light ? c2 : 'rgba(255,255,255,0.14)', borderWidth: light ? '2px' : '1px' }"
    aria-hidden="true"
  >
    <span
      v-if="band"
      class="band"
      :style="{ ...band, background: c2 }"
    />
    <span
      v-if="split === 'quarters'"
      class="band"
      :style="{ left: '50%', right: '0', top: '50%', bottom: '0', background: c2 }"
    />
  </span>
</template>

<style scoped>
.crest { position: relative; display: inline-block; flex: none; overflow: hidden; border: 1px solid rgba(255, 255, 255, 0.14); box-sizing: border-box; }
.band { position: absolute; }
</style>
