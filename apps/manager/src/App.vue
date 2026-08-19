<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useMatchStore } from './stores/match';
import { useSeasonStore } from './stores/season';
import MatchViewer from './components/MatchViewer.vue';
import SeasonView from './components/SeasonView.vue';
import CoachView from './components/CoachView.vue';
import AboutView from './components/AboutView.vue';
import Onboarding from './components/Onboarding.vue';
import type { MatchLog } from '@bullyoff/engine';
import { LOCALES, setLocale, type Locale } from './i18n';
import { applyUpdate, canInstall, needRefresh, offlineReady, promptInstall, setupPwa } from './pwa';

const { t, locale } = useI18n();
const match = useMatchStore();
const season = useSeasonStore();
const screen = ref<'season' | 'viewer' | 'about'>('season');
const SCENARIOS = ['outlet-under-press', 'high-press-vs-deep-block', 'baseline-entry', 'two-v-one', 'three-v-two', 'pc-dragFlick', 'pc-lowHit', 'pc-slipRight', 'pc-deflection', 'pc-one-man-down', 'last-two-minutes', 'counter-attack', 'long-corner'];
const fileInput = ref<HTMLInputElement | null>(null);
const ONBOARD_KEY = 'bullyoff.onboarded';
const onboarding = ref(false);

onMounted(() => {
  setupPwa();
  try { onboarding.value = globalThis.localStorage.getItem(ONBOARD_KEY) !== '1'; } catch { onboarding.value = false; }
});
function onboarded(): void { onboarding.value = false; try { globalThis.localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ } }
function pickLocale(ev: Event): void { setLocale((ev.target as HTMLSelectElement).value as Locale); }

async function onFinished(log: MatchLog): Promise<void> { await season.finishCoaching(log); screen.value = 'season'; }

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
  const who = 'team' in e ? (e['team'] === 0 ? t('season.cols.home') : t('season.cols.away')) : '';
  const extra = e.t === 'Card' ? ` ${String(e['colour'])} #${String(e['playerId'])}` : e.t === 'Goal' ? ` ${String((e['score'] as number[])[0])}–${String((e['score'] as number[])[1])}` : '';
  return `${mm}:${ss}  ${e.t} ${who}${extra}`;
};
</script>

<template>
  <div class="shell">
    <header class="top">
      <h1 class="title">{{ t('app.title') }}</h1>
      <nav class="nav">
        <button
          class="navbtn"
          :class="{ active: screen === 'season' }"
          @click="screen = 'season'"
        >
          {{ t('app.nav.season') }}
        </button>
        <button
          class="navbtn"
          :class="{ active: screen === 'viewer' }"
          @click="screen = 'viewer'"
        >
          {{ t('app.nav.viewer') }}
        </button>
        <button
          class="navbtn"
          :class="{ active: screen === 'about' }"
          @click="screen = 'about'"
        >
          {{ t('app.nav.about') }}
        </button>
      </nav>
      <span class="sub">{{ t('app.phase') }}</span>
      <span class="grow" />
      <button
        v-if="canInstall"
        class="btn small"
        @click="promptInstall"
      >
        {{ t('app.install') }}
      </button>
      <label class="lang">
        <span class="sr-only">{{ t('app.language') }}</span>
        <select
          :value="locale"
          :aria-label="t('app.language')"
          @change="pickLocale"
        >
          <option
            v-for="l in LOCALES"
            :key="l.id"
            :value="l.id"
          >
            {{ l.label }}
          </option>
        </select>
      </label>
    </header>

    <p
      v-if="needRefresh"
      class="banner"
    >
      {{ t('app.updateAvailable') }}
      <button
        class="btn small"
        @click="applyUpdate"
      >
        {{ t('app.reload') }}
      </button>
    </p>
    <p
      v-else-if="offlineReady"
      class="banner"
    >
      {{ t('app.offlineReady') }}
    </p>

    <template v-if="season.coaching">
      <main class="main wide">
        <CoachView
          :key="season.coaching.fixtureId"
          :coaching="season.coaching"
          @finished="onFinished"
          @abandon="season.abandonCoaching()"
        />
      </main>
    </template>
    <template v-else-if="screen === 'season'">
      <main class="main wide">
        <SeasonView @watch="screen = 'viewer'" />
      </main>
    </template>
    <template v-else-if="screen === 'about'">
      <main class="main wide">
        <AboutView />
      </main>
    </template>
    <template v-else>
      <aside class="side">
        <section class="panel">
          <h2>{{ t('viewer.simulate') }}</h2>
          <label>{{ t('viewer.profile') }}
            <select v-model="match.profile"><option value="mens">{{ t('viewer.mens') }}</option><option value="womens">{{ t('viewer.womens') }}</option></select>
          </label>
          <label>{{ t('viewer.turf') }}
            <select v-model="match.surface"><option value="dry">{{ t('viewer.dry') }}</option><option value="watered">{{ t('viewer.watered') }}</option><option value="wet">{{ t('viewer.wet') }}</option></select>
          </label>
          <label>{{ t('viewer.seed') }} <input
            v-model.number="match.seed"
            type="number"
          ></label>
          <button
            class="btn primary"
            :disabled="match.busy"
            @click="match.simulate()"
          >
            {{ match.busy ? t('viewer.simulating') : t('viewer.simulateMatch') }}
          </button>
        </section>
        <section class="panel">
          <h2>{{ t('viewer.scenarios') }}</h2>
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
            {{ t('viewer.runScenario') }}
          </button>
        </section>
        <section class="panel">
          <h2>{{ t('viewer.replays') }}</h2>
          <input
            ref="fileInput"
            type="file"
            accept="application/json"
            :aria-label="t('viewer.loadReplay')"
            @change="onFile"
          >
          <button
            class="btn"
            :disabled="!match.log"
            @click="download"
          >
            {{ t('viewer.exportReplay') }}
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
          <h2>{{ t('viewer.events') }}</h2>
          <p class="src">
            {{ match.source }}
          </p>
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
          :colours="match.colours"
        />
        <div
          v-else
          class="empty"
        >
          <p>{{ t('viewer.empty') }}</p>
        </div>
      </main>
    </template>

    <Onboarding
      v-if="onboarding"
      @done="onboarded"
    />
  </div>
</template>

<style scoped>
.shell { display: grid; grid-template-columns: 300px minmax(0, 1fr); grid-template-rows: auto auto minmax(0, 1fr); height: 100dvh; gap: var(--space-3); padding: var(--space-3); }
.top { grid-column: 1 / -1; display: flex; align-items: baseline; gap: var(--space-3); flex-wrap: wrap; }
.nav { display: flex; gap: var(--space-2); }
.navbtn { background: transparent; color: var(--color-fg-muted); border: 1px solid transparent; border-radius: var(--radius-sm); padding: 4px 10px; cursor: pointer; font: inherit; }
.navbtn.active { color: var(--color-fg); border-color: var(--color-border); background: var(--color-bg-elevated); }
.grow { flex: 1; }
.lang select { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 6px; font: inherit; }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
.banner { grid-column: 1 / -1; margin: 0; background: var(--color-bg-elevated); border: 1px solid var(--color-turf-500); border-radius: var(--radius-sm); padding: 6px 10px; font-size: var(--text-sm); display: flex; gap: var(--space-2); align-items: center; }
.main.wide { grid-column: 1 / -1; }
.title { font-size: var(--text-xl); letter-spacing: 0.18em; font-weight: 800; color: var(--color-turf-100); }
.sub { color: var(--color-fg-muted); font-size: var(--text-sm); }
.side { display: flex; flex-direction: column; gap: var(--space-3); overflow: auto; min-height: 0; }
.panel { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.panel h2 { font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.08em; color: var(--color-fg-muted); }
.panel label { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); font-size: var(--text-sm); }
.panel select, .panel input[type=number] { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 4px 6px; font: inherit; max-width: 60%; }
.btn { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px 12px; cursor: pointer; font: inherit; }
.btn.small { padding: 4px 8px; font-size: var(--text-sm); }
.btn.primary { background: var(--color-turf-700); border-color: var(--color-turf-500); color: #fff; font-weight: 700; }
.btn:disabled { opacity: 0.5; cursor: default; }
.error { color: var(--color-card-red); }
.src { font-size: var(--text-xs); color: var(--color-fg-muted); }
.events { list-style: none; padding: 0; margin: 0; font-family: var(--font-mono); font-size: var(--text-xs); display: flex; flex-direction: column; gap: 2px; }
.main { min-height: 0; display: grid; grid-template-rows: minmax(0, 1fr); }
.empty { height: 100%; display: grid; place-content: center; color: var(--color-fg-muted); max-width: 40ch; text-align: center; margin: 0 auto; }
@media (max-width: 800px) { .shell { grid-template-columns: 1fr; grid-template-rows: auto auto auto 1fr; } .side { flex-direction: row; overflow-x: auto; } }
</style>
