<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { MatchLog } from '@bullyoff/engine';
import { createMatchView, type HudState, type MatchView, type ViewMode } from '@bullyoff/render';

const props = defineProps<{ log: MatchLog }>();

const canvas = ref<HTMLCanvasElement | null>(null);
const view = ref<MatchView | null>(null);
const tick = ref(0);
const lastTick = ref(1);
const playing = ref(false);
const speed = ref(1);
const mode = ref<ViewMode>('director');
const hud = ref<HudState>({ score: [0, 0], quarter: 1, clockSeconds: 0, phase: '', lastEvent: '' });
const sound = ref(false);

async function mount(): Promise<void> {
  if (!canvas.value) return;
  view.value?.destroy();
  const v = await createMatchView(canvas.value, props.log, { mode: mode.value });
  v.onFrame((t, h) => { tick.value = t; hud.value = h; playing.value = v.playing; });
  lastTick.value = v.lastTick;
  view.value = v;
  v.setSpeed(speed.value);
  v.play();
  if (import.meta.env.DEV) (globalThis as unknown as { __bullyoffView?: MatchView }).__bullyoffView = v; // dev hook for screenshots/tests
}

onMounted(() => { void mount(); });
watch(() => props.log, () => { void mount(); });
onBeforeUnmount(() => { view.value?.destroy(); });

function seek(ev: Event): void { view.value?.seek(Number((ev.target as HTMLInputElement).value)); }
function setSpeed(x: number): void { speed.value = x; view.value?.setSpeed(x); }
function toggleMode(): void { mode.value = mode.value === 'director' ? 'tactical' : 'director'; view.value?.setMode(mode.value); }
function toggleSound(): void { sound.value = !sound.value; if (sound.value) view.value?.enableAudio(); }
const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>

<template>
  <div class="viewer">
    <div class="stage">
      <canvas
        ref="canvas"
        class="canvas"
      />
    </div>
    <div class="controls">
      <button
        class="btn"
        @click="view?.toggle()"
      >
        {{ playing ? '⏸' : '▶' }}
      </button>
      <div class="speeds">
        <button
          v-for="x in [1, 2, 4, 8]"
          :key="x"
          class="btn small"
          :class="{ active: speed === x }"
          @click="setSpeed(x)"
        >
          {{ x }}×
        </button>
      </div>
      <input
        class="scrub"
        type="range"
        min="0"
        :max="lastTick"
        step="1"
        :value="Math.floor(tick)"
        @input="seek"
      >
      <span class="time">{{ fmt(hud.clockSeconds) }} · {{ hud.phase }}</span>
      <button
        class="btn small"
        @click="toggleMode"
      >
        {{ mode === 'director' ? 'director' : 'tactical' }}
      </button>
      <button
        class="btn small"
        :class="{ active: sound }"
        @click="toggleSound"
      >
        {{ sound ? '🔊' : '🔇' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.viewer { display: grid; grid-template-rows: minmax(0, 1fr) auto; height: 100%; min-height: 0; }
.stage { position: relative; min-height: 360px; background: #0e1116; border-radius: var(--radius-md); overflow: hidden; }
.canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.controls { display: flex; gap: var(--space-2); align-items: center; padding: var(--space-2) 0; flex-wrap: wrap; }
.btn { background: var(--color-bg-elevated); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 6px 12px; cursor: pointer; font: inherit; }
.btn.small { padding: 4px 8px; font-size: var(--text-sm); }
.btn.active { border-color: var(--color-turf-500); color: var(--color-turf-100); }
.speeds { display: flex; gap: 4px; }
.scrub { flex: 1; min-width: 160px; accent-color: var(--color-turf-500); }
.time { font-family: var(--font-mono); font-size: var(--text-sm); color: var(--color-fg-muted); white-space: nowrap; }
</style>
