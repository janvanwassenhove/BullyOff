<script setup lang="ts">
/** 04 · Club selection — crest + kit system. Card grid left, kit-coloured detail rail right. TAKE THE JOB → season.pickClub. */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { clubPlayers } from '@bullyoff/season';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';
import Crest from './ui/Crest.vue';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const world = computed(() => season.world);
const clubs = computed(() => (world.value ? Object.values(world.value.clubs).sort((a, b) => a.tier - b.tier || b.level - a.level) : []));
const selectedId = ref<string | null>(app.selectedClub ?? clubs.value[0]?.id ?? null);
const selected = computed(() => clubs.value.find((c) => c.id === selectedId.value) ?? clubs.value[0] ?? null);
const tierLevel = (tier: number): number => { const cs = clubs.value.filter((c) => c.tier === tier); return cs.length ? Math.round((10 * cs.reduce((s, c) => s + c.level, 0)) / cs.length) / 10 : 0; };
const detail = computed(() => {
  const c = selected.value; const w = world.value; if (!c || !w) return null;
  const squad = clubPlayers(w, c.id), youth = clubPlayers(w, c.id, true).length - squad.length;
  const titles = c.honours.titles.length, last = c.honours.titles[c.honours.titles.length - 1];
  return { squad: squad.length, youth, titles, last, level: Math.round(c.level * 10) / 10, tierLevel: tierLevel(c.tier), isChampion: w.history[w.history.length - 1]?.champion === c.id };
});
function take(): void { if (selected.value) { season.pickClub(selected.value.id); app.selectedClub = selected.value.id; void season.save(); app.go('season'); } }
</script>

<template>
  <section class="select">
    <div class="grid-col">
      <div class="head">
        <h1 class="display h1">
          {{ t('career.pickTitle') }}
        </h1>
        <span class="sub">{{ t('career.pickSub', { n: clubs.length }) }}</span>
      </div>
      <div class="cards">
        <button
          v-for="c in clubs"
          :key="c.id"
          class="card"
          :class="{ on: c.id === selected?.id }"
          @click="selectedId = c.id"
        >
          <Crest
            :colours="c.colours"
            :shape="c.badge.shape"
            :split="c.badge.split"
            :size="38"
          />
          <span class="ccol">
            <span class="cname">{{ c.name }}</span>
            <span class="cmeta">{{ c.town }} · {{ t('career.est', { year: c.founded }) }}{{ c.nickname ? ' · "' + c.nickname + '"' : '' }}</span>
            <span class="tags">
              <span
                class="chip"
                :class="c.tier === 1 ? 'chip-accent' : 'chip-signal'"
              >{{ t('career.tier', { n: c.tier }) }}</span>
              <span class="chip">{{ t('career.level', { n: (c.level / 4).toFixed(1) }) }}</span>
            </span>
          </span>
        </button>
      </div>
    </div>
    <aside
      v-if="selected && detail"
      class="rail"
    >
      <div
        class="bannerk"
        :style="{ background: hex(selected.colours[0]) }"
      >
        <div class="stripes" />
        <div class="bk">
          <Crest
            :colours="selected.colours"
            :shape="selected.badge.shape"
            :split="selected.badge.split"
            :size="56"
            light
          />
          <div class="bcol">
            <span
              class="eyebrow"
              :style="{ color: hex(selected.colours[1]), opacity: 0.8 }"
            >{{ selected.town.toUpperCase() }} · {{ t('career.est', { year: selected.founded }).toUpperCase() }}</span>
            <span
              class="bname"
              :style="{ color: hex(selected.colours[1]) }"
            >{{ selected.name }}</span>
          </div>
        </div>
      </div>
      <div class="body">
        <div class="kpis">
          <div class="kpi"><span class="kv display-700">{{ detail.titles }}</span><span class="eyebrow">{{ t('career.titles') }}</span></div>
          <div class="kpi"><span class="kv display-700">{{ (detail.level / 4).toFixed(1) }}</span><span class="eyebrow">{{ t('career.squadLevel') }}</span></div>
          <div class="kpi"><span class="kv display-700">{{ selected.facilities }}/5</span><span class="eyebrow">{{ t('career.facilities') }}</span></div>
        </div>
        <p class="blurb">
          {{ detail.titles ? t('career.blurbTitles', { n: detail.titles, last: detail.last }, detail.titles) : t('career.blurbNoTitles') }}
          {{ t('career.blurbSquad', { squad: detail.squad, youth: detail.youth, level: (detail.level / 4).toFixed(1), tierLevel: (detail.tierLevel / 4).toFixed(1) }) }}
          {{ selected.tier === 1 ? t('career.blurbBoardT1') : t('career.blurbBoardT2') }}
        </p>
        <div class="kit">
          <span class="eyebrow">{{ t('career.kit') }}</span>
          <div class="swatches">
            <span
              class="sw"
              :style="{ background: hex(selected.colours[0]) }"
            />
            <span
              class="sw"
              :style="{ background: hex(selected.colours[1]) }"
            />
            <span
              class="sw"
              style="background: #0f2b23"
            />
            <span class="grow" />
            <span class="hint">{{ t('career.kitNote') }}</span>
          </div>
        </div>
        <span class="grow" />
        <button
          class="btn btn-primary btn-lg btn-block"
          @click="take"
        >
          {{ t('career.takeJob') }}
        </button>
      </div>
    </aside>
  </section>
</template>

<style scoped>
.select { min-height: 100dvh; display: grid; grid-template-columns: minmax(0, 1fr) 430px; background: var(--bg); }
.grid-col { padding: 26px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.h1 { font-size: 30px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.cards { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
.card { background: var(--panel); border: 1px solid var(--hairline); border-radius: 10px; padding: 14px; display: flex; gap: 12px; cursor: pointer; text-align: left; color: var(--fg); font: inherit; transition: border-color 120ms; }
.card:hover, .card.on { border-color: var(--accent); }
.ccol { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.cname { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.03em; line-height: 1.15; }
.cmeta { font-size: 12.5px; color: var(--fg-muted); }
.tags { display: flex; gap: 5px; margin-top: 5px; }
.rail { border-left: 1px solid var(--hairline); background: var(--panel); display: flex; flex-direction: column; min-height: 0; }
.bannerk { height: 200px; position: relative; overflow: hidden; flex: none; }
.stripes { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 14px, transparent 14px 28px); }
.bk { position: absolute; left: 24px; bottom: 20px; display: flex; align-items: flex-end; gap: 14px; }
.bcol { display: flex; flex-direction: column; gap: 2px; }
.bname { font-family: var(--font-display); font-size: 30px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; text-transform: uppercase; max-width: 300px; }
.body { padding: 22px; display: flex; flex-direction: column; gap: 16px; min-height: 0; flex: 1; }
.kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
.kpi { display: flex; flex-direction: column; gap: 2px; }
.kv { font-size: 28px; }
.blurb { font-size: 14.5px; color: var(--fg-3); line-height: 1.6; }
.kit { display: flex; flex-direction: column; gap: 8px; }
.swatches { display: flex; gap: 8px; align-items: center; }
.sw { width: 34px; height: 34px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.14); }
.hint { font-size: 12.5px; color: var(--fg-dim); }
@media (max-width: 1100px) { .select { grid-template-columns: 1fr; } .cards { grid-template-columns: repeat(2, 1fr); } .rail { border-left: none; border-top: 1px solid var(--hairline); } }
@media (max-width: 640px) { .cards { grid-template-columns: 1fr; } }
</style>
