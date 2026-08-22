<script setup lang="ts">
/** 06 · Squad & player detail. Table left, player card right: portrait, chips, attribute bars, the coaching read. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { attributeRows, playerRead } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const base = import.meta.env.BASE_URL;
const rows = computed(() => season.squad);
const selected = computed(() => rows.value.find((r) => r.id === app.selectedPerson) ?? rows.value.find((r) => !r.youth) ?? rows.value[0] ?? null);
const read = computed(() => (selected.value ? playerRead(selected.value.person) : null));
const attrs = computed(() => (selected.value ? attributeRows(selected.value.person) : []));
const youthCount = computed(() => rows.value.filter((r) => r.youth).length);
const status = (r: { injured: number; person: { availability: number } }): { key: string; c: string } => (r.injured > 0 ? { key: 'out', c: 'var(--danger)' } : r.person.availability < 0.75 ? { key: 'tired', c: 'var(--signal)' } : { key: 'fit', c: 'var(--accent-soft)' });
const barColour = (v: number): string => (v >= 75 ? 'var(--accent)' : v >= 60 ? 'var(--accent-soft)' : v >= 50 ? 'var(--signal)' : 'var(--danger)');
const womens = computed(() => season.world?.profile === 'womens');
/** Deterministic neutral portrait from a small generated set (public/portraits/{m,w}-{1..6}.webp). */
const portrait = computed(() => (selected.value ? `${base}portraits/${womens.value ? 'w' : 'm'}-${(selected.value.id % 6) + 1}.webp` : ''));
const hand = computed(() => (selected.value ? (selected.value.id % 7 === 0 ? 'left' : 'right') : 'right'));
</script>

<template>
  <div class="sq">
    <div class="main">
      <div class="head">
        <h1 class="display h1">
          {{ t('squad.title') }}
        </h1>
        <span class="sub">{{ t('squad.sub', { n: rows.length, youth: youthCount, pct: Math.min(95, 40 + rows.length) }) }}</span>
      </div>
      <div class="panel tbl">
        <div class="thead mono">
          <span>{{ t('squad.cols.n') }}</span><span>{{ t('squad.cols.name') }}</span><span>{{ t('squad.cols.role') }}</span><span class="r">{{ t('squad.cols.age') }}</span><span class="r">{{ t('squad.cols.ovr') }}</span><span class="r">{{ t('squad.cols.minutes') }}</span><span class="r">{{ t('squad.cols.goals') }}</span><span class="r">{{ t('squad.cols.status') }}</span>
        </div>
        <button
          v-for="r in rows"
          :key="r.id"
          class="trow"
          :class="{ on: r.id === selected?.id }"
          @click="app.selectedPerson = r.id"
        >
          <span class="mono dim">{{ r.n }}</span>
          <span class="namecell"><span class="nm">{{ r.name }}</span><span
            v-if="r.youth || r.captain"
            class="mono badge"
          >{{ r.youth ? t('squad.youth') : t('squad.captain') }}</span></span>
          <span class="mono role">{{ r.role }}</span>
          <span class="r mono num">{{ r.age }}</span>
          <span class="r mono ovr">{{ r.ovr }}</span>
          <span class="r mono num">{{ r.minutes }}</span>
          <span class="r mono num">{{ r.goals }}</span>
          <span
            class="r mono st"
            :style="{ color: status(r).c }"
          >{{ status(r).key === 'out' ? t('squad.out', { d: r.injured }) : t('squad.' + status(r).key) }}</span>
        </button>
      </div>
    </div>

    <aside
      v-if="selected && read"
      class="rail"
    >
      <div class="phead">
        <div class="portrait">
          <img
            :src="portrait"
            alt=""
            @error="($event.target as HTMLImageElement).style.display = 'none'"
          >
          <span class="mono plabel">{{ t('squad.portrait') }}</span>
        </div>
        <div class="pcol">
          <span class="eyebrow">{{ t('squad.role.' + selected.role) }} · {{ selected.age }} · {{ t('squad.hand.' + hand) }}</span>
          <span class="pname">{{ selected.name.toUpperCase() }}</span>
          <div class="chips">
            <span class="chip chip-fill">{{ t('squad.ovr', { n: selected.ovr }) }}</span>
            <span class="chip chip-signal-line">{{ t('squad.goals', { n: selected.goals }) }}</span>
            <span class="chip">{{ t('squad.contract', { year: (season.world?.year ?? 2026) + 1 + (selected.id % 3) }) }}</span>
          </div>
        </div>
      </div>
      <div class="pbody">
        <div class="attrs">
          <span class="eyebrow">{{ t('squad.attributes') }}</span>
          <div
            v-for="a in attrs"
            :key="a.key"
            class="arow"
          >
            <span class="ak">{{ t('squad.attr.' + a.key) }}</span>
            <span class="bar bar-5"><i :style="{ width: a.value + '%', background: barColour(a.value) }" /></span>
            <span class="mono av">{{ a.value }}</span>
          </div>
        </div>
        <div class="how hairline-t">
          <span class="eyebrow eyebrow-signal">{{ womens ? t('squad.howToUseW') : t('squad.howToUseM') }}</span>
          <p class="howp">
            {{ t(read.i18nKey, read.params) }}
          </p>
          <div class="chips">
            <span
              v-if="read.suggest"
              class="chip chip-line-accent"
            >{{ t(read.suggest) }}</span>
            <span
              v-if="read.drill"
              class="chip chip-11"
            >{{ t(read.drill) }}</span>
          </div>
        </div>
      </div>
    </aside>
    <aside
      v-else
      class="rail"
    >
      <p class="empty">
        {{ t('squad.pick') }}
      </p>
    </aside>
  </div>
</template>

<style scoped>
.sq { display: grid; grid-template-columns: minmax(0, 1fr) 470px; min-height: 0; }
.main { padding: 24px; display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.h1 { font-size: 28px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.tbl { overflow: hidden; }
.thead, .trow { display: grid; grid-template-columns: 34px minmax(0, 1fr) 58px 44px 52px 74px 62px 92px; align-items: center; padding: 8px 16px; }
.thead { padding: 11px 16px; border-bottom: 1px solid var(--hairline); font-size: 10px; letter-spacing: 0.14em; color: var(--fg-dim); }
.trow { border: none; border-bottom: 1px solid var(--row-line); background: transparent; font: inherit; font-size: 14px; color: var(--fg-2); text-align: left; cursor: pointer; width: 100%; }
.trow.on { background: rgba(31, 154, 99, 0.10); color: var(--fg); }
.r { text-align: right; }
.dim { font-size: 12px; color: var(--fg-dim); }
.namecell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 10px; color: var(--accent-soft); }
.role { font-size: 11px; letter-spacing: 0.08em; color: var(--fg-muted); }
.num { font-size: 13px; color: var(--fg-muted); }
.ovr { font-size: 14px; color: var(--fg); }
.st { font-size: 11px; }
.rail { border-left: 1px solid var(--hairline); background: var(--panel); display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.phead { padding: 24px; border-bottom: 1px solid var(--hairline); display: flex; gap: 18px; align-items: flex-end; }
.portrait { width: 96px; height: 112px; border: 1px solid #1b2530; border-radius: 8px; background: repeating-linear-gradient(135deg, #0d151a 0 9px, #0b1216 9px 18px); display: grid; place-items: center; overflow: hidden; position: relative; flex: none; }
.portrait img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.plabel { font-size: 9px; color: var(--fg-faint); text-align: center; }
.pcol { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pname { font-family: var(--font-display); font-size: 38px; font-weight: 700; letter-spacing: 0.03em; line-height: 1; }
.chips { display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
.pbody { padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
.attrs { display: flex; flex-direction: column; gap: 10px; }
.arow { display: grid; grid-template-columns: 110px minmax(0, 1fr) 34px; gap: 12px; align-items: center; }
.ak { font-size: 13.5px; color: var(--fg-3); }
.av { font-size: 12.5px; color: var(--fg); text-align: right; }
.how { padding-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.howp { font-size: 14.5px; color: var(--fg-2); line-height: 1.6; }
.empty { padding: 24px; color: var(--fg-dim); font-size: 14px; }
@media (max-width: 1100px) { .sq { grid-template-columns: 1fr; } .rail { border-left: none; border-top: 1px solid var(--hairline); } .thead, .trow { grid-template-columns: 28px minmax(0, 1fr) 44px 36px 40px 60px 48px 70px; font-size: 12px; } }
</style>
