<script setup lang="ts">
import { computed, ref } from 'vue';
import { useMatchStore } from './stores/match';
import MatchViewer from './components/MatchViewer.vue';

const match = useMatchStore();
const SCENARIOS = ['outlet-under-press', 'high-press-vs-deep-block', 'baseline-entry', 'two-v-one', 'three-v-two', 'pc-dragFlick', 'pc-lowHit', 'pc-slipRight', 'pc-deflection', 'pc-one-man-down', 'last-two-minutes', 'counter-attack', 'long-corner'];
const fileInput = ref<HTMLInputElement | null>(null);

const recent = computed(() => {
  const ev = match.events.filter((e) => ['Goal', 'PenaltyCornerAwarded', 'PenaltyStrokeAwarded', 'Card', 'QuarterStart', 'QuarterEnd', 'FullTime'].includes(e.t));
  return ev.slice(-14).reverse();
});

async function onFile(ev: Event): Promise<void> {
  const f = (ev.target as HTMLInputElement).files?.[0];
  if (!f) return;
  match.loadJson(await f.text(), f.name);
}
function download(): void {
  const json = match.exportReplay();
  if (!json) return;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
  a.download = `bullyoff-${match.seed}.replay.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}
const label = (e: { t: string; tick: number } & Record<string, unknown>): string => {
  const s = (e.tick / 20);
  const mm = String(Math.floor(s / 60)).padStart(2, '0'), ss = String(Math.floor(s % 60)).padStart(2, '0');
  const who = 'team' in e ? (e['team'] === 0 ? 'home' : 'away') : '';
  const extra = e.t === 'Card' ? ` ${String(e['colour'])} #${String(e['playerId'])}` : e.t === 'Goal' ? ` ${String((e['score'] as number[])[0])}–${String((e['score'] as number[])[1])}` : '';
  return `${mm}:${ss}  ${e.t} ${who}${extra}`;
};
</script>

<template>
  <div class="shell">
    <header class="top">
      <h1 class="title">BULLY OFF</h1>
      <span class="sub">Phase 5 — replay viewer</span>
    </header>

    <aside class="side">
      <section class="panel">
        <h2>Simulate</h2>
        <label>Profile
          <select v-model="match.profile"><option value="mens">men's</option><option value="womens">women's</option></select>
        </label>
        <label>Turf
          <select v-model="match.surface"><option value="dry">dry</option><option value="watered">watered</option><option value="wet">wet</option></select>
        </label>
        <label>Seed <input
          v-model.number="match.seed"
          type="number"
        ></label>
        <button
          class="btn primary"
          :disabled="match.busy"
          @click="match.simulate()"
        >
          {{ match.busy ? 'simulating…' : 'Play a match' }}
        </button>
      </section>
      <section class="panel">
        <h2>Scenario (§6.2)</h2>
        <select v-model="match.scenarioId">
          <option
            v-for="s in SCENARIOS"
            :key="s"
            :value="s"
          >
            {{ s }}
          </option>
        </select>
        <button
          class="btn"
          :disabled="match.busy"
          @click="match.runScenario()"
        >
          Run scenario
        </button>
      </section>
      <section class="panel">
        <h2>Replay file</h2>
        <input
          ref="fileInput"
          type="file"
          accept="application/json"
          @change="onFile"
        >
        <button
          class="btn"
          :disabled="!match.log"
          @click="download"
        >
          Export .replay.json
        </button>
      </section>
      <section
        v-if="match.error"
        class="panel error"
      >
        {{ match.error }}
      </section>
      <section
        v-if="match.log"
        class="panel"
      >
        <h2>Events</h2>
        <p class="src">{{ match.source }}</p>
        <ul class="events">
          <li
            v-for="(e, i) in recent"
            :key="i"
          >
            {{ label(e as never) }}
          </li>
        </ul>
      </section>
    </aside>

    <main class="main">
      <MatchViewer
        v-if="match.log"
        :log="match.log"
      />
      <div
        v-else
        class="empty"
      >
        <p>Simulate a match or run a scenario. The engine runs in a Web Worker; the viewer reads only the event log.</p>
      </div>
    </main>
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: auto minmax(0, 1fr); height: 100dvh; gap: var(--space-3); padding: var(--space-3); }
.top { grid-column: 1 / -1; display: flex; align-items: baseline; gap: var(--space-4); }
.title { font-size: var(--text-xl); letter-spacing: 0.18em; font-weight: 800; color: var(--color-turf-100); }
.sub { color: var(--color-fg-muted); font-size: var(--text-sm); }
.side { display: flex; flex-direction: column; gap: var(--space-3); overflow: auto; min-height: 0; }
.panel { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.panel h2 { font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-fg-muted); }
.panel label { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.panel select, .panel input[type=number] { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 6px; font: inherit; max-width: 60%; }
.btn { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px 12px; cursor: pointer; font: inherit; }
.btn.primary { background: var(--color-turf-700); border-color: var(--color-turf-500); color: #fff; font-weight: 700; }
.btn:disabled { opacity: 0.5; cursor: default; }
.error { color: var(--color-card-red); }
.src { font-size: var(--text-xs); color: var(--color-fg-muted); }
.events { list-style: none; padding: 0; margin: 0; font-family: var(--font-mono); font-size: var(--text-xs); display: flex; flex-direction: column; gap: 2px; }
.main { min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
.empty { height: 100%; display: grid; place-content: center; color: var(--color-fg-muted); max-width: 40ch; text-align: center; margin: 0 auto; }
@media (max-width: 800px) { .shell { grid-template-columns: 1fr; grid-template-rows: auto auto 1fr; } .side { flex-direction: row; overflow-x: auto; } }
</style>
