<script setup lang="ts">
/** 05 · Season hub content: tabs + league table (or fixtures/results/history) and the right rail (form, staff advice, treatment room). */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { adviseSeason } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const tab = ref<'table' | 'fixtures' | 'results' | 'history'>('table');
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const world = computed(() => season.world);
const table = computed(() => season.table);
const zone = (i: number): string => (i < 4 ? 'var(--accent)' : i === table.value.length - 2 ? 'var(--signal)' : i === table.value.length - 1 ? 'var(--danger)' : 'var(--fg-dim)');
const advice = computed(() => (world.value?.userClub ? adviseSeason(world.value, world.value.userClub) : []));
const form = computed(() => season.form);
const formBg = (r: 'W' | 'D' | 'L'): string => (r === 'W' ? 'var(--accent)' : r === 'D' ? 'var(--form-draw)' : 'var(--danger)');
const res = (f: { result?: { home: number; away: number; shootOut?: [number, number] } }): string => {
  if (!f.result) return '—';
  return `${f.result.home}–${f.result.away}${f.result.shootOut ? ` · ${t('hub.so', { a: f.result.shootOut[0], b: f.result.shootOut[1] })}` : ''}`;
};
const outcome = (f: { home: string; away: string; result?: { home: number; away: number; shootOut?: [number, number] } }): 'W' | 'D' | 'L' | '' => {
  const u = world.value?.userClub; const r = f.result; if (!u || !r) return '';
  const mine = f.home === u ? r.home : r.away, theirs = f.home === u ? r.away : r.home;
  if (r.shootOut) return (f.home === u ? r.shootOut[0] > r.shootOut[1] : r.shootOut[1] > r.shootOut[0]) ? 'W' : 'L';
  return mine > theirs ? 'W' : mine < theirs ? 'L' : 'D';
};
function openPlayer(id: number | undefined): void { if (id !== undefined) { app.selectedPerson = id; app.go('squad'); } }
</script>

<template>
  <div
    v-if="world"
    class="hubc"
  >
    <div class="main">
      <div class="tabs">
        <button
          v-for="k in (['table', 'fixtures', 'results', 'history'] as const)"
          :key="k"
          class="pill-tab"
          :class="{ on: tab === k }"
          @click="tab = k"
        >
          {{ t('hub.tabs.' + k) }}
        </button>
        <span class="grow" />
        <button
          v-if="season.lastMatch"
          class="pill-tab"
          @click="app.go('report')"
        >
          {{ t('hub.report') }}
        </button>
      </div>

      <div
        v-if="tab === 'table'"
        class="panel tbl"
      >
        <div class="thead mono">
          <span>{{ t('hub.cols.pos') }}</span><span>{{ t('hub.cols.club') }}</span><span class="r">{{ t('hub.cols.p') }}</span><span class="r">{{ t('hub.cols.w') }}</span><span class="r">{{ t('hub.cols.d') }}</span><span class="r">{{ t('hub.cols.l') }}</span><span class="r">{{ t('hub.cols.gf') }}</span><span class="r">{{ t('hub.cols.ga') }}</span><span class="r">{{ t('hub.cols.pts') }}</span>
        </div>
        <div
          v-for="(r, i) in table"
          :key="r.club"
          class="trow"
          :class="{ me: r.club === world.userClub }"
        >
          <span
            class="mono pos"
            :style="{ color: zone(i) }"
          >{{ i + 1 }}</span>
          <span class="clubcell"><span
            class="sw"
            :style="{ background: hex(world.clubs[r.club]?.colours[0] ?? 0) }"
          /><span class="cn">{{ season.clubName(r.club) }}</span></span>
          <span class="r mono num">{{ r.p }}</span><span class="r mono num">{{ r.w }}</span><span class="r mono num">{{ r.d }}</span><span class="r mono num">{{ r.l }}</span><span class="r mono num">{{ r.gf }}</span><span class="r mono num">{{ r.ga }}</span><span class="r mono pts">{{ r.pts }}</span>
        </div>
        <div class="legend">
          <span><i style="background: var(--accent)" />{{ t('hub.legend.playoffs') }}</span>
          <span><i style="background: var(--signal)" />{{ t('hub.legend.playdown') }}</span>
          <span><i style="background: var(--danger)" />{{ t('hub.legend.relegated') }}</span>
          <span class="grow" />
          <span>{{ t('hub.legend.winter', { a: world.season.winterBreak[0] + 1, b: world.season.winterBreak[1] + 1 }) }}</span>
        </div>
      </div>

      <div
        v-else-if="tab === 'fixtures'"
        class="panel tbl"
      >
        <div class="thead mono fx">
          <span>{{ t('hub.cols.day') }}</span><span>{{ t('hub.cols.phase') }}</span><span>{{ t('hub.cols.home') }}</span><span>{{ t('hub.cols.away') }}</span><span class="r">{{ t('hub.cols.result') }}</span>
        </div>
        <div
          v-for="f in season.userFixtures"
          :key="f.id"
          class="trow fx"
          :class="{ next: f.id === season.nextUserFixture?.id }"
        >
          <span class="mono num">{{ f.day + 1 }}</span><span class="mono small">{{ t('hub.phase.' + f.phase) }}</span><span>{{ season.clubName(f.home) }}</span><span>{{ season.clubName(f.away) }}</span><span class="r mono">{{ res(f) }}</span>
        </div>
      </div>

      <div
        v-else-if="tab === 'results'"
        class="panel tbl"
      >
        <p
          v-if="!season.userResults.length"
          class="empty"
        >
          {{ t('hub.noResults') }}
        </p>
        <div
          v-for="f in season.userResults"
          :key="f.id"
          class="trow fx"
        >
          <span class="mono num">{{ f.day + 1 }}</span>
          <span
            class="formsq small"
            :style="{ background: formBg(outcome(f) || 'D') }"
          >{{ outcome(f) }}</span>
          <span>{{ season.clubName(f.home) }}</span><span>{{ season.clubName(f.away) }}</span><span class="r mono">{{ res(f) }}</span>
        </div>
      </div>

      <div
        v-else
        class="panel tbl"
      >
        <p
          v-if="!world.history.length"
          class="empty"
        >
          {{ t('hub.noHistory') }}
        </p>
        <div
          v-for="h in [...world.history].reverse()"
          :key="h.year"
          class="trow hist"
        >
          <span class="mono year">{{ h.year }}</span>
          <span>{{ t('hub.histLine', { champion: season.clubName(h.champion), regular: season.clubName(h.regularWinner), final: h.playoffFinal[2], up: h.promoted.map(season.clubName).join(', '), down: h.relegated.map(season.clubName).join(', ') }) }}</span>
        </div>
      </div>
      <p
        v-if="world.season.finished && world.history.length"
        class="over"
      >
        {{ t('hub.seasonOver', { year: world.year, champion: season.clubName(world.history[world.history.length - 1]?.champion ?? '') }) }}
      </p>
      <p
        v-if="season.error"
        class="err"
      >
        {{ season.error }}
      </p>
    </div>

    <aside class="rail">
      <div class="block">
        <span class="eyebrow">{{ t('hub.form') }}</span>
        <div class="formrow">
          <span
            v-for="(r, i) in form"
            :key="i"
            class="formsq"
            :style="{ background: formBg(r), color: r === 'D' ? 'var(--fg)' : 'var(--ink)' }"
          >{{ r }}</span>
          <span class="grow" />
          <span class="formnote">{{ form.length ? t('hub.formNote', { gf: season.homeGoalsPerMatch }) : t('hub.formEmpty') }}</span>
        </div>
      </div>
      <div class="block hairline-t">
        <span class="eyebrow eyebrow-signal">{{ t('hub.staff') }}</span>
        <p
          v-if="!advice.length"
          class="empty"
        >
          {{ t('hub.staffEmpty') }}
        </p>
        <button
          v-for="a in advice"
          :key="a.kind"
          class="adv rail"
          :class="'rail-' + (a.rail === 'line' ? 'line' : a.rail)"
          @click="openPlayer(a.personId)"
        >
          <span class="atitle">{{ t(a.i18nKey + '.title', a.params) }}</span>
          <span class="abody">{{ t(a.i18nKey + '.body', a.params) }}</span>
        </button>
      </div>
      <div class="block hairline-t">
        <span class="eyebrow">{{ t('hub.treatment') }}</span>
        <p
          v-if="!season.treatmentRoom.length"
          class="empty"
        >
          {{ t('hub.treatmentEmpty') }}
        </p>
        <div
          v-for="p in season.treatmentRoom.slice(0, 5)"
          :key="p.id"
          class="inj"
        >
          <span
            class="dot"
            :style="{ background: p.injured > 7 ? 'var(--danger)' : 'var(--signal)' }"
          />
          <span class="iname">{{ p.name }}</span>
          <span class="irole mono">{{ p.role }}</span>
          <span class="grow" />
          <span
            class="mono"
            :style="{ color: p.injured > 7 ? 'var(--danger)' : 'var(--signal)' }"
          >{{ t('hub.daysOut', { d: p.injured }) }}</span>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.hubc { display: grid; grid-template-columns: minmax(0, 1fr) 400px; min-height: 0; }
.main { padding: 22px 24px; display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; }
.tabs { display: flex; gap: 8px; }
.tbl { overflow: hidden; }
.thead { display: grid; grid-template-columns: 44px minmax(0, 1fr) repeat(7, 52px); padding: 11px 16px; border-bottom: 1px solid var(--hairline); font-size: 10px; letter-spacing: 0.14em; color: var(--fg-dim); }
.thead.fx, .trow.fx { grid-template-columns: 52px 90px minmax(0, 1fr) minmax(0, 1fr) 110px; }
.trow { display: grid; grid-template-columns: 44px minmax(0, 1fr) repeat(7, 52px); align-items: center; padding: 9px 16px; border-bottom: 1px solid var(--row-line); font-size: 14px; color: var(--fg-2); }
.trow.me { background: rgba(31, 154, 99, 0.10); color: var(--fg); }
.trow.next { outline: 1px solid var(--accent); outline-offset: -1px; }
.trow.hist { grid-template-columns: 64px 1fr; }
.r { text-align: right; }
.pos { font-size: 12px; }
.clubcell { display: flex; align-items: center; gap: 9px; min-width: 0; }
.sw { width: 9px; height: 9px; border-radius: 2px; flex: none; }
.cn { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.num { font-size: 13px; color: var(--fg-muted); }
.pts { font-size: 14px; color: var(--fg); }
.small { font-size: 11px; letter-spacing: 0.08em; color: var(--fg-muted); }
.year { font-size: 13px; color: var(--accent-soft); }
.legend { display: flex; gap: 18px; padding: 11px 16px; font-size: 12.5px; color: var(--fg-dim); flex-wrap: wrap; }
.legend i { display: inline-block; width: 8px; height: 8px; border-radius: 2px; margin-right: 6px; }
.empty { padding: 14px 16px; font-size: 13.5px; color: var(--fg-dim); }
.over { font-size: 14px; color: var(--fg-3); }
.err { color: var(--danger); font-size: 13px; }
.rail { border-left: 1px solid var(--hairline); background: var(--panel); padding: 22px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.block { display: flex; flex-direction: column; gap: 9px; }
.block.hairline-t { padding-top: 16px; }
.formrow { display: flex; gap: 6px; align-items: center; }
.formsq { width: 36px; height: 36px; border-radius: 5px; display: grid; place-items: center; font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--ink); }
.formsq.small { width: 26px; height: 26px; font-size: 13px; }
.formnote { font-size: 13px; color: var(--fg-muted); }
.adv { display: flex; flex-direction: column; gap: 3px; text-align: left; background: none; border: none; border-left: 2px solid var(--line-strong); padding: 0 0 0 12px; cursor: pointer; color: var(--fg); font: inherit; }
.adv.rail-accent { border-left-color: var(--accent); }
.adv.rail-signal { border-left-color: var(--signal); }
.atitle { font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: 0.02em; }
.abody { font-size: 13.5px; color: var(--fg-3); line-height: 1.5; }
.inj { display: flex; align-items: center; gap: 10px; font-size: 13.5px; }
.iname { color: var(--fg-2); }
.irole { color: var(--fg-dim); font-size: 11px; }
@media (max-width: 1000px) { .hubc { grid-template-columns: 1fr; } .rail { border-left: none; border-top: 1px solid var(--hairline); } .thead, .trow { grid-template-columns: 36px minmax(0, 1fr) repeat(7, 36px); font-size: 12px; } }
/* Phone: the club name is the point of the table — drop won/drawn/lost and keep played, goals and points */
@media (max-width: 480px) {
  .thead:not(.fx) > :nth-child(4), .thead:not(.fx) > :nth-child(5), .thead:not(.fx) > :nth-child(6),
  .trow:not(.fx):not(.hist) > :nth-child(4), .trow:not(.fx):not(.hist) > :nth-child(5), .trow:not(.fx):not(.hist) > :nth-child(6) { display: none; }
  .thead:not(.fx), .trow:not(.fx):not(.hist) { grid-template-columns: 30px minmax(0, 1fr) repeat(4, 38px); }
  .cn { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
}
</style>
