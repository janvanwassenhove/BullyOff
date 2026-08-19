<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeasonStore } from '../stores/season';
import { useMatchStore } from '../stores/match';

const emit = defineEmits<{ watch: [] }>();
const { t } = useI18n();
const season = useSeasonStore();
const match = useMatchStore();
const seed = ref(2026);
const profile = ref<'mens' | 'womens'>('mens');
const flavour = ref<'mixed' | 'vlaanderen' | 'wallonie' | 'bruxelles'>('mixed');
const historyYears = ref(20);
const tab = ref<'table' | 'squad' | 'fixtures' | 'history'>('table');

onMounted(() => { void season.refreshSlots(); });

const clubs = computed(() => season.world ? Object.values(season.world.clubs).sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name)) : []);
const myFixtures = computed(() => {
  const w = season.world; if (!w?.userClub) return [];
  const u = w.userClub;
  return w.season.fixtures.filter((f) => f.home === u || f.away === u).sort((a, b) => a.day - b.day);
});
function watchLast(): void {
  if (season.lastUserLog) { match.log = season.lastUserLog; match.colours = season.lastUserColours; match.source = 'my last match'; emit('watch'); }
}
function res(f: { result?: { home: number; away: number; shootOut?: [number, number] } }): string {
  if (!f.result) return '—';
  return `${f.result.home}–${f.result.away}${f.result.shootOut ? ` (SO ${f.result.shootOut[0]}–${f.result.shootOut[1]})` : ''}`;
}
async function onImport(ev: Event): Promise<void> {
  const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return;
  season.importJson(await f.text());
}
function download(): void {
  const json = season.exportJson(); if (!json) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `bullyoff-save-${season.world?.year ?? ''}.json`; a.click(); URL.revokeObjectURL(a.href);
}
</script>

<template>
  <div class="season">
    <section
      v-if="!season.world"
      class="panel setup"
    >
      <h2>{{ t('season.newCareer') }}</h2>
      <label>{{ t('season.competition') }} <select v-model="profile"><option value="mens">{{ t('viewer.mens') }}</option><option value="womens">{{ t('viewer.womens') }}</option></select></label>
      <label>{{ t('season.flavour') }} <select v-model="flavour"><option value="mixed">{{ t('season.flavourMixed') }}</option><option value="vlaanderen">{{ t('season.flavourVl') }}</option><option value="wallonie">{{ t('season.flavourWa') }}</option><option value="bruxelles">{{ t('season.flavourBxl') }}</option></select></label>
      <label>{{ t('season.history') }} <select v-model.number="historyYears"><option :value="0">{{ t('season.historyNone') }}</option><option :value="10">{{ t('season.historyN', { n: 10 }) }}</option><option :value="20">{{ t('season.historyN', { n: 20 }) }}</option></select></label>
      <label>{{ t('season.worldSeed') }} <input
        v-model.number="seed"
        type="number"
      ></label>
      <button
        class="btn primary"
        :disabled="season.busy"
        @click="season.newWorld(seed, profile, flavour, historyYears)"
      >
        {{ season.busy ? season.message : t('season.generate') }}
      </button>
      <div
        v-if="season.slots.length"
        class="slots"
      >
        <span>{{ t('season.savedCareers') }}</span>
        <button
          v-for="s in season.slots"
          :key="s"
          class="btn small"
          @click="season.load(s)"
        >
          {{ s }}
        </button>
      </div>
      <label class="file">{{ t('season.importSave') }} <input
        type="file"
        accept="application/json"
        @change="onImport"
      ></label>
    </section>

    <template v-else>
      <section
        v-if="!season.world.userClub"
        class="panel"
      >
        <h2>{{ t('season.pickClub') }}</h2>
        <div class="clubs">
          <button
            v-for="c in clubs"
            :key="c.id"
            class="club"
            @click="season.pickClub(c.id)"
          >
            <span
              class="swatch"
              :style="{ background: '#' + c.colours[0].toString(16).padStart(6, '0') }"
            />
            <span class="name">{{ c.name }}</span>
            <span class="meta">{{ c.town }} · {{ t('season.est', { year: c.founded }) }}{{ c.nickname ? ' · "' + c.nickname + '"' : '' }}</span>
            <span class="meta">{{ t('season.tier', { n: c.tier }) }} · {{ t('season.level', { n: c.level.toFixed(1) }) }} · {{ t('season.facilities', { n: c.facilities }) }}{{ c.honours.titles.length ? ' · ' + t('season.titles', { n: c.honours.titles.length }, c.honours.titles.length) + ' (' + t('season.lastTitle', { year: c.honours.titles[c.honours.titles.length - 1] }) + ')' : '' }}</span>
          </button>
        </div>
      </section>

      <template v-else>
        <header class="bar">
          <strong>{{ season.userClub?.name }}</strong>
          <span class="muted">{{ t('season.tier', { n: season.userClub?.tier }) }} · {{ t('season.seasonYear', { year: season.world.year }) }} · {{ t('season.day', { d: season.world.season.day, n: season.world.season.days }) }}{{ season.world.season.finished ? ' · ' + t('season.finished') : '' }}</span>
          <span class="grow" />
          <button
            v-if="season.todaysUserFixture"
            class="btn primary"
            :disabled="season.busy"
            @click="season.startCoaching()"
          >
            {{ t('season.coachToday') }}
          </button>
          <button
            class="btn"
            :disabled="season.busy || season.world.season.finished"
            @click="season.playDay()"
          >
            {{ season.busy ? t('season.playing') : season.todaysUserFixture ? t('season.simDayInclMine') : t('season.playDay') }}
          </button>
          <button
            class="btn"
            :disabled="season.busy || season.world.season.finished"
            @click="season.playToEnd()"
          >
            {{ season.busy && season.progress ? `${season.progress.label} · ${Math.round(100 * season.progress.done / season.progress.total)} %` : t('season.simToEnd') }}
          </button>
          <button
            v-if="season.world.season.finished"
            class="btn primary"
            :disabled="season.busy"
            @click="season.nextSeason()"
          >
            {{ t('season.nextSeason') }}
          </button>
          <button
            class="btn"
            :disabled="!season.lastUserLog"
            @click="watchLast"
          >
            {{ t('season.watchLast') }}
          </button>
          <button
            class="btn small"
            @click="season.save()"
          >
            {{ t('season.save') }}
          </button>
          <button
            class="btn small"
            @click="download"
          >
            {{ t('season.export') }}
          </button>
        </header>
        <p
          v-if="season.message"
          class="msg"
        >
          {{ season.message }}
        </p>
        <p
          v-if="season.error"
          class="msg error"
        >
          {{ season.error }}
        </p>
        <nav class="tabs">
          <button
            v-for="tab_ in ['table', 'squad', 'fixtures', 'history'] as const"
            :key="tab_"
            class="btn small"
            :class="{ active: tab === tab_ }"
            @click="tab = tab_"
          >
            {{ t('season.tabs.' + tab_) }}
          </button>
        </nav>

        <section
          v-if="tab === 'table'"
          class="panel"
        >
          <table class="grid">
            <thead><tr><th>#</th><th>{{ t('season.cols.club') }}</th><th>P</th><th>W</th><th>D</th><th>L</th><th>GF</th><th>GA</th><th>Pts</th></tr></thead>
            <tbody>
              <tr
                v-for="(r, i) in season.table"
                :key="r.club"
                :class="{ me: r.club === season.world.userClub, po: i < 4, rel: i >= season.table.length - 2 }"
              >
                <td>{{ i + 1 }}</td><td>{{ season.clubName(r.club) }}</td><td>{{ r.p }}</td><td>{{ r.w }}</td><td>{{ r.d }}</td><td>{{ r.l }}</td><td>{{ r.gf }}</td><td>{{ r.ga }}</td><td><b>{{ r.pts }}</b></td>
              </tr>
            </tbody>
          </table>
          <p class="muted small">
            {{ t('season.tableNote', { a: season.world.season.winterBreak[0], b: season.world.season.winterBreak[1] }) }}
          </p>
        </section>

        <section
          v-if="tab === 'squad'"
          class="panel"
        >
          <table class="grid">
            <thead><tr><th>{{ t('season.cols.name') }}</th><th>{{ t('season.cols.role') }}</th><th>{{ t('season.cols.age') }}</th><th>{{ t('season.cols.ovr') }}</th><th>{{ t('season.cols.goals') }}</th><th>{{ t('season.cols.status') }}</th></tr></thead>
            <tbody>
              <tr
                v-for="p in season.squad"
                :key="p.id"
              >
                <td>{{ p.name }}</td><td>{{ p.role }}</td><td>{{ p.age }}</td><td>{{ p.ovr }}</td><td>{{ p.goals }}</td><td>{{ p.injured ? t('season.injured', { d: p.injured }) : t('season.fit') }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          v-if="tab === 'fixtures'"
          class="panel"
        >
          <table class="grid">
            <thead><tr><th>{{ t('season.cols.day') }}</th><th>{{ t('season.cols.phase') }}</th><th>{{ t('season.cols.home') }}</th><th>{{ t('season.cols.away') }}</th><th>{{ t('season.cols.result') }}</th></tr></thead>
            <tbody>
              <tr
                v-for="f in myFixtures"
                :key="f.id"
                :class="{ next: f.id === season.nextUserFixture?.id }"
              >
                <td>{{ f.day }}</td><td>{{ f.phase }}</td><td>{{ season.clubName(f.home) }}</td><td>{{ season.clubName(f.away) }}</td><td>{{ res(f) }}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section
          v-if="tab === 'history'"
          class="panel"
        >
          <p
            v-if="!season.world.history.length"
            class="muted"
          >
            {{ t('season.noHistory') }}
          </p>
          <ul class="hist">
            <li
              v-for="h in season.world.history"
              :key="h.year"
            >
              <b>{{ h.year }}</b> — {{ t('season.histLine', { champion: season.clubName(h.champion), regular: season.clubName(h.regularWinner), final: h.playoffFinal[2], up: h.promoted.map(season.clubName).join(', '), down: h.relegated.map(season.clubName).join(', ') }) }}
            </li>
          </ul>
        </section>
      </template>
    </template>
  </div>
</template>

<style scoped>
.season { display: flex; flex-direction: column; gap: var(--space-3); min-height: 0; overflow: auto; }
.panel { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); display: flex; flex-direction: column; gap: var(--space-2); }
.setup label { display: flex; justify-content: space-between; align-items: center; gap: var(--space-2); }
.btn { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px 12px; cursor: pointer; font: inherit; }
.btn.primary { background: var(--color-turf-700); border-color: var(--color-turf-500); color: #fff; font-weight: 700; }
.btn.small { padding: 4px 8px; font-size: var(--text-sm); }
.btn.active { border-color: var(--color-turf-500); color: var(--color-turf-100); }
.btn:disabled { opacity: 0.5; cursor: default; }
.clubs { display: grid; grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); gap: var(--space-2); }
.club { display: grid; grid-template-columns: 14px 1fr; gap: 2px 8px; text-align: left; background: var(--color-bg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px; cursor: pointer; color: var(--color-fg); font: inherit; }
.swatch { width: 14px; height: 14px; border-radius: 3px; grid-row: 1 / span 3; }
.name { font-weight: 700; }
.meta { font-size: var(--text-xs); color: var(--color-fg-muted); }
.bar { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.grow { flex: 1; }
.muted { color: var(--color-fg-muted); }
.small { font-size: var(--text-xs); }
.msg { font-size: var(--text-sm); color: var(--color-turf-100); }
.msg.error { color: var(--color-card-red); }
.tabs { display: flex; gap: var(--space-2); }
.grid { border-collapse: collapse; font-size: var(--text-sm); width: 100%; }
.grid th, .grid td { padding: 3px 8px; text-align: left; border-bottom: 1px solid var(--color-border); }
.grid tr.me { background: rgba(31, 154, 99, 0.18); }
.grid tr.po td:first-child { color: var(--color-turf-500); font-weight: 700; }
.grid tr.rel td:first-child { color: var(--color-card-red); font-weight: 700; }
.grid tr.next { outline: 1px solid var(--color-turf-500); }
.hist { padding-left: 18px; font-size: var(--text-sm); }
.slots { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; font-size: var(--text-sm); }
</style>
