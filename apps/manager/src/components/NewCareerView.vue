<script setup lang="ts">
/**
 * 03 · New career / world generation. Setup rail (chip groups + seed) and the generation
 * preview (progress, KPI tiles, history ledger). Binds to season.newWorld(); the ledger
 * fills from the generated world's history.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';
import type { Country, RegionFlavour } from '@bullyoff/worldgen';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const profile = ref<'mens' | 'womens'>('mens');
const flavour = ref<RegionFlavour>('mixed');
const country = ref<Country>('BE');
const COUNTRIES: Country[] = ['BE', 'NL', 'EN', 'FR', 'DE'];
const history = ref<0 | 10 | 20>(20);
const seed = ref(2026);
const progress = ref(0);
let timer: number | null = null;

onMounted(() => { void season.refreshSlots(); });
const busy = computed(() => season.busy);
const world = computed(() => season.world);
const persons = computed(() => (world.value ? Object.values(world.value.persons).filter((p) => !p.retired).length : 0));
const clubs = computed(() => (world.value ? Object.keys(world.value.clubs).length : 0));
const ledger = computed(() => (world.value ? [...world.value.history].reverse().map((h) => ({
  year: h.year,
  line: h.champion === h.regularWinner ? t('career.ledgerDouble', { champion: season.clubName(h.champion) }) : t('career.ledgerRegular', { champion: season.clubName(h.champion), regular: season.clubName(h.regularWinner) }),
  // the season package records the final as ids ("c2 4-1 c11"); swap the ids for names here, not in the data
  final: h.playoffFinal[2].split(" ").map((tok) => (tok === h.playoffFinal[0] || tok === h.playoffFinal[1] ? season.clubName(tok) : tok)).join(" "),
})) : []));
const pct = computed(() => (busy.value ? Math.min(96, progress.value) : world.value ? 100 : 0));

function reroll(): void { seed.value = Math.floor(1000 + Math.random() * 9000); }
async function generate(): Promise<void> {
  progress.value = 4;
  // the worker gives no per-season progress for creation; animate towards 96 % at the measured pace (~0.6 s / 20 seasons)
  const expectedMs = 1200 + history.value * 260; // six leagues: ≈ 230 ms per generated season
  const t0 = performance.now();
  timer = window.setInterval(() => { progress.value = Math.min(96, 4 + (92 * (performance.now() - t0)) / expectedMs); }, 60);
  season.turf = turf.value;
  await season.newWorld(seed.value, profile.value, flavour.value, history.value, country.value);
  if (timer) { clearInterval(timer); timer = null; }
  progress.value = 100;
}
const turf = ref<'watered' | 'dry' | 'wet'>('watered');
function takeClub(): void { app.go('clubSelect'); }
async function load(slot: string): Promise<void> { if (await season.load(slot)) app.go(season.world?.userClub ? 'season' : 'clubSelect'); }
async function onImport(ev: Event): Promise<void> { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; season.importJson(await f.text()); if (season.world) app.go(season.world.userClub ? 'season' : 'clubSelect'); }
</script>

<template>
  <section class="career">
    <header class="appbar">
      <button
        class="wordmark"
        @click="app.go('title')"
      >
        {{ t('app.title') }}
      </button>
      <span class="vdiv" />
      <span class="eyebrow eyebrow-11">{{ t('career.eyebrow') }}</span>
      <span class="grow" />
      <span class="eyebrow">{{ t('career.step', { n: 1 }) }}</span>
    </header>
    <div class="cols">
      <aside class="rail">
        <h1 class="hero">
          {{ t('career.hero') }}
        </h1>
        <div class="group">
          <div class="gh"><span class="eyebrow">{{ t('career.competition') }}</span><span class="hint">{{ t('career.competitionHint') }}</span></div>
          <div class="chips">
            <button
              class="choice"
              :class="{ on: profile === 'mens' }"
              :disabled="busy"
              @click="profile = 'mens'"
            >
              {{ t('career.mens') }}
            </button>
            <button
              class="choice"
              :class="{ on: profile === 'womens' }"
              :disabled="busy"
              @click="profile = 'womens'"
            >
              {{ t('career.womens') }}
            </button>
          </div>
        </div>
        <div class="group">
          <div class="gh"><span class="eyebrow">{{ t('career.country') }}</span><span class="hint">{{ t('career.countryHint') }}</span></div>
          <div class="chips">
            <button
              v-for="c in COUNTRIES"
              :key="c"
              class="choice"
              :class="{ on: country === c }"
              :disabled="busy"
              @click="country = c"
            >
              {{ t('country.' + c) }}
            </button>
          </div>
        </div>
        <div
          v-if="country === 'BE'"
          class="group"
        >
          <div class="gh"><span class="eyebrow">{{ t('career.flavour') }}</span><span class="hint">{{ t('career.flavourHint') }}</span></div>
          <div class="chips">
            <button
              v-for="f in (['mixed', 'vlaanderen', 'wallonie', 'bruxelles'] as const)"
              :key="f"
              class="choice"
              :class="{ on: flavour === f }"
              :disabled="busy"
              @click="flavour = f"
            >
              {{ t('career.' + f) }}
            </button>
          </div>
        </div>
        <div class="group">
          <div class="gh"><span class="eyebrow">{{ t('career.history') }}</span><span class="hint">{{ t('career.historyHint') }}</span></div>
          <div class="chips">
            <button
              class="choice"
              :class="{ on: history === 0 }"
              :disabled="busy"
              @click="history = 0"
            >
              {{ t('career.none') }}
            </button>
            <button
              class="choice"
              :class="{ on: history === 10 }"
              :disabled="busy"
              @click="history = 10"
            >
              {{ t('career.seasons10') }}
            </button>
            <button
              class="choice"
              :class="{ on: history === 20 }"
              :disabled="busy"
              @click="history = 20"
            >
              {{ t('career.seasons20') }}
            </button>
          </div>
        </div>
        <div class="group">
          <div class="gh"><span class="eyebrow">{{ t('career.turf') }}</span><span class="hint">{{ t('career.turfHint') }}</span></div>
          <div class="chips">
            <button
              v-for="s in (['watered', 'dry', 'wet'] as const)"
              :key="s"
              class="choice"
              :class="{ on: turf === s }"
              :disabled="busy"
              @click="turf = s"
            >
              {{ t('career.' + s) }}
            </button>
          </div>
        </div>
        <div class="group">
          <span class="eyebrow">{{ t('career.seed') }}</span>
          <div class="seedrow">
            <input
              v-model.number="seed"
              class="seed mono"
              type="number"
              :disabled="busy"
            >
            <button
              class="chip chip-line-accent mono reroll"
              :disabled="busy"
              @click="reroll"
            >
              {{ t('career.reroll') }}
            </button>
            <span class="hint">{{ t('career.seedNote') }}</span>
          </div>
        </div>
        <div
          v-if="season.slots.length"
          class="group saves"
        >
          <span class="eyebrow">{{ t('career.saved') }}</span>
          <div class="chips">
            <button
              v-for="s in season.slots"
              :key="s"
              class="choice"
              :disabled="busy"
              @click="load(s)"
            >
              {{ s }}
            </button>
            <label class="choice file">{{ t('career.importFile') }}<input
              type="file"
              accept="application/json"
              class="sr-only"
              @change="onImport"
            ></label>
          </div>
        </div>
        <span class="grow" />
        <button
          v-if="!world || busy"
          class="btn btn-primary btn-lg btn-block"
          :disabled="busy"
          @click="generate"
        >
          {{ t('career.generate') }}
        </button>
        <button
          v-else
          class="btn btn-primary btn-lg btn-block"
          @click="takeClub"
        >
          {{ t('career.takeJob') }} →
        </button>
      </aside>

      <main class="preview">
        <div class="prog-h">
          <span class="eyebrow">{{ busy ? t('career.generating') : t('career.idle') }}</span>
          <span class="prog-text">{{ busy ? (history > 0 ? t('career.writing', { n: history }) : t('career.writingNone')) : world ? t('career.done') : '' }}</span>
          <span class="grow" />
          <span class="mono pct">{{ Math.round(pct) }} %</span>
        </div>
        <div class="track">
          <span
            class="fill"
            :style="{ width: pct + '%' }"
          />
          <span
            v-if="busy"
            class="sweep bo-sweep"
          />
        </div>
        <div class="kpis">
          <div class="kpi"><span class="kv display-700">{{ clubs || '—' }}</span><span class="eyebrow">{{ t('career.clubs') }}</span></div>
          <div class="kpi"><span class="kv display-700">{{ persons || '—' }}</span><span class="eyebrow">{{ t('career.players') }}</span></div>
          <div class="kpi"><span class="kv display-700">{{ world ? world.history.length : history }}</span><span class="eyebrow">{{ t('career.seasonsLabel') }}</span></div>
          <div class="kpi"><span class="kv display-700">0</span><span class="eyebrow">{{ t('career.realNames') }}</span></div>
        </div>
        <div class="panel ledger">
          <span class="eyebrow">{{ t('career.ledger') }}</span>
          <p
            v-if="!ledger.length"
            class="hint"
          >
            {{ t('career.ledgerEmpty') }}
          </p>
          <div
            v-for="h in ledger"
            :key="h.year"
            class="lrow"
          >
            <span class="mono year">{{ h.year }}</span>
            <span class="line">{{ h.line }}</span>
            <span class="mono final">{{ h.final }}</span>
          </div>
        </div>
        <p
          v-if="season.error"
          class="err"
        >
          {{ season.error }}
        </p>
      </main>
    </div>
  </section>
</template>

<style scoped>
.career { min-height: 100dvh; display: grid; grid-template-rows: 58px minmax(0, 1fr); background: var(--bg); }
.appbar { display: flex; align-items: center; gap: 18px; padding: 0 24px; border-bottom: 1px solid var(--hairline); background: var(--panel-2); }
.wordmark { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 0.16em; color: var(--accent-pale); background: none; border: none; cursor: pointer; padding: 0; }
.vdiv { height: 18px; }
.cols { display: grid; grid-template-columns: 430px minmax(0, 1fr); min-height: 0; }
.rail { border-right: 1px solid var(--hairline); padding: 26px; display: flex; flex-direction: column; gap: 20px; background: var(--panel); overflow: auto; }
.hero { font-family: var(--font-display); font-size: 34px; font-weight: 600; letter-spacing: 0.03em; line-height: 1.05; white-space: pre-line; }
.group { display: flex; flex-direction: column; gap: 8px; }
.gh { display: flex; justify-content: space-between; align-items: baseline; }
.hint { font-size: 12.5px; color: var(--fg-dim); }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.seedrow { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.seed { width: 110px; font-size: 22px; color: var(--fg); background: var(--bg); border: 1px solid var(--line-strong); border-radius: 6px; padding: 9px 16px; }
.reroll { background: none; cursor: pointer; font-size: 11px; letter-spacing: 0.12em; }
.file { cursor: pointer; }
.preview { padding: 26px; display: flex; flex-direction: column; gap: 16px; min-height: 0; }
.prog-h { display: flex; align-items: baseline; gap: 12px; }
.prog-text { font-size: 14px; color: var(--fg-3); }
.pct { font-size: 13px; color: var(--accent-soft); }
.track { height: 3px; background: #1b2127; border-radius: 2px; position: relative; overflow: hidden; }
.fill { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); border-radius: 2px; transition: width 120ms linear; }
.sweep { position: absolute; top: 0; bottom: 0; width: 60px; background: linear-gradient(90deg, transparent, rgba(215, 245, 230, 0.5), transparent); }
.kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
.kpi { background: var(--panel); border: 1px solid var(--hairline); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 4px; }
.kv { font-size: 34px; }
.ledger { flex: 1; min-height: 0; padding: 18px; display: flex; flex-direction: column; gap: 10px; overflow: auto; }
.lrow { display: grid; grid-template-columns: 64px 1fr auto; gap: 14px; align-items: baseline; border-bottom: 1px solid var(--row-line); padding-bottom: 7px; }
.year { font-size: 13px; color: var(--accent-soft); }
.line { font-size: 14px; color: var(--fg-2); }
.final { font-size: 12px; color: var(--fg-dim); }
.err { color: var(--danger); font-size: 13px; }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } .rail { border-right: none; border-bottom: 1px solid var(--hairline); } .kpis { grid-template-columns: repeat(2, 1fr); } }
</style>
