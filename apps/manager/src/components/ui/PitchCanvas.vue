<script setup lang="ts">
/**
 * A canvas that hosts a MatchView (packages/render) for a given log. Presentation only:
 * camera/overlay/mode are props, playback is driven by the parent through the exposed view.
 */
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import type { MatchLog } from '@bullyoff/engine';
import { createMatchView, type CameraChoice, type HudState, type MatchView, type OverlayId, type ViewMode } from '@bullyoff/render';

const props = withDefaults(defineProps<{
  log: MatchLog;
  colours?: [number, number];
  camera?: CameraChoice;
  overlay?: OverlayId;
  mode?: ViewMode;
  coachTeam?: 0 | 1;
  live?: boolean;
  autoPlay?: boolean;
  autoPauseOn?: 'QuarterEnd'[];
  fit?: 'contain' | 'cover';
  loop?: boolean;
}>(), { loop: false, colours: () => [0x1d3557, 0xe63946], camera: 'broadcast', overlay: 'none', mode: 'tactical', coachTeam: 0, live: false, autoPlay: true, autoPauseOn: () => [], fit: 'contain' });
const emit = defineEmits<{ ready: [view: MatchView]; frame: [tick: number, hud: HudState] }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const view = shallowRef<MatchView | null>(null);
// A canvas element can host one WebGL context in its life: once a view is destroyed, the next log
// gets a fresh element (keyed), otherwise the second view initialises on a dead context and freezes.
const gen = ref(0);

async function mount(): Promise<void> {
  if (view.value) { view.value.destroy(); view.value = null; gen.value++; await nextTick(); }
  if (!canvas.value) return;
  const v = await createMatchView(canvas.value, props.log, { mode: props.mode, camera: props.camera, overlay: props.overlay, homeColour: props.colours[0], awayColour: props.colours[1], live: props.live, coachTeam: props.coachTeam, autoPauseOn: props.autoPauseOn, fit: props.fit, loop: props.loop });
  v.onFrame((tick, hud) => { emit('frame', tick, hud); });
  view.value = v;
  if (props.autoPlay) v.play();
  emit('ready', v);
}
onMounted(() => { void mount(); });
watch(() => props.log, () => { void mount(); });
watch(() => props.camera, (c) => view.value?.setCamera(c));
watch(() => props.overlay, (o) => view.value?.setOverlay(o));
watch(() => props.mode, (m) => { view.value?.setMode(m); if (m !== 'director') view.value?.setCamera(props.camera); });
onBeforeUnmount(() => { view.value?.destroy(); });
defineExpose({ view });
</script>

<template>
  <div class="stage">
    <canvas
      ref="canvas"
      :key="gen"
      class="canvas"
    />
  </div>
</template>

<style scoped>
.stage { position: relative; width: 100%; height: 100%; min-height: 200px; background: #08120e; overflow: hidden; }
.canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
</style>
