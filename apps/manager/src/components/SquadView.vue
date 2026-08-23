<script setup lang="ts">
/**
 * 06 · The team sheet. Left: the eleven in formation slots, the bench, and the rest of the squad —
 * this is where a coach picks who starts, who sits and who is rested. Right: the player card with
 * the moves for that player. The sheet is saved on the club, so a simulated match day uses it too;
 * until the coach touches it, the list shows the assistant's pick for the next fixture.
 */
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { attributeRows, playerRead } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';
import { useSeasonStore, type SquadRow } from '../stores/season';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const base = import.meta.env.BASE_URL;
const rows = computed(() => season.squad);
const sheet = computed(() => season.sheet);
const away = computed(() => new Set(season.sheet.away.map((r) => r.id)));
const selected = computed(() => rows.value.find((r) => r.id === app.selectedPerson) ?? sheet.value.starters[0] ?? rows.value[0] ?? null);
const read = computed(() => (selected.value ? playerRead(selected.value.person) : null));
const attrs = computed(() => (selected.value ? attributeRows(selected.value.person) : []));
const youthCount = computed(() => rows.value.filter((r) => r.youth).length);
const barColour = (v: number): string => (v >= 75 ? 'var(--accent)' : v >= 60 ? 'var(--accent-soft)' : v >= 50 ? 'var(--signal)' : 'var(--danger)');
const womens = computed(() => season.world?.profile === 'womens');
/** Deterministic neutral portrait from a small generated set (public/portraits/{m,w}-{1..6}.webp). */
const portrait = computed(() => (selected.value ? `${base}portraits/${womens.value ? 'w' : 'm'}-${(selected.value.id % 6) + 1}.webp` : ''));
const hand = computed(() => (selected.value ? (selected.value.id % 7 === 0 ? 'left' : 'right') : 'right'));

/** Where a player stands on the sheet — the card's moves follow from it. */
const placeOf = (id: number): 'starter' | 'bench' | 'rest' =>
  (sheet.value.starters.some((r) => r.id === id) ? 'starter' : sheet.value.bench.some((r) => r.id === id) ? 'bench' : 'rest');
const place = computed(() => (selected.value ? placeOf(selected.value.id) : 'rest'));
const canPlay = computed(() => !!selected.value && selected.value.injured === 0 && !away.value.has(selected.value.id));

/** A swap in progress: click ⇄ on one row, then ⇄ on another. */
const swapFrom = ref<number | null>(null);
function tapSwap(id: number): void {
  if (swapFrom.value === null) { swapFrom.value = id; return; }
  if (swapFrom.value === id) { swapFrom.value = null; return; }
  season.swapOnSheet(swapFrom.value, id);
  swapFrom.value = null;
}
const status = (r: SquadRow): { label: string; c: string } =>
  r.injured > 0 ? { label: t('squad.out', { d: r.injured }), c: 'var(--danger)' }
    : away.value.has(r.id) ? { label: t('squad.absent'), c: 'var(--signal)' }
      : r.person.availability < 0.75 ? { label: t('squad.tired'), c: 'var(--signal)' }
        : { label: t('squad.fit'), c: 'var(--accent-soft)' };
</script>

<template>
  <div class="sq">
    <div class="main">
      <div class="head">
        <h1 class="display h1">
          {{ t('squad.title') }}
        </h1>
        <span class="sub">{{ t('squad.sub', { n: rows.length, youth: youthCount, pct: Math.min(95, 40 + rows.length) }) }}</span>
        <span class="grow" />
        <span
          class="chip"
          :class="sheet.picked ? 'chip-accent' : 'chip-11'"
        >{{ sheet.picked ? t('squad.sheetPicked') : t('squad.sheetAuto') }}</span>
        <button
          v-if="sheet.picked"
          class="btn btn-ghost btn-xs"
          @click="season.clearLineup()"
        >
          {{ t('squad.sheetReset') }}
        </button>
        <button
          class="btn btn-secondary btn-xs"
          @click="app.go('tactics')"
        >
          {{ t('squad.toTactics') }}
        </button>
      </div>
      <span class="hint">{{ t('squad.swapHint') }}</span>

      <div
        v-for="grp in [
          { key: 'starters', rows: sheet.starters, slots: true },
          { key: 'bench', rows: sheet.bench, slots: false },
          { key: 'rest', rows: sheet.rest, slots: false },
        ]"
        :key="grp.key"
        class="panel tbl"
      >
        <div class="ghead">
          <span class="eyebrow">{{ t('squad.group.' + grp.key) }}</span>
          <span class="mono gcount">{{ grp.rows.length }}</span>
        </div>
        <div
          v-for="(r, i) in grp.rows"
          :key="r.id"
          class="trow"
          :class="{ on: r.id === selected?.id, from: r.id === swapFrom }"
        >
          <span
            class="mono slot"
            :class="{ role: grp.slots }"
          >{{ grp.slots ? season.slotRoles[i] : r.n }}</span>
          <button
            class="rowmain"
            @click="app.selectedPerson = r.id"
          >
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
            >{{ status(r).label }}</span>
          </button>
          <button
            class="swapbtn mono"
            :class="{ armed: swapFrom !== null && swapFrom !== r.id }"
            :title="t('squad.swap')"
            @click="tapSwap(r.id)"
          >
            {{ swapFrom === r.id ? '✕' : swapFrom !== null ? t('squad.swapHere') : '⇄' }}
          </button>
        </div>
        <p
          v-if="!grp.rows.length"
          class="gempty"
        >
          {{ t('squad.groupEmpty') }}
        </p>
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
      <div class="moves">
        <span class="eyebrow">{{ t('squad.moves') }} · {{ t('squad.place.' + place) }}</span>
        <div class="mrow">
          <button
            v-if="place !== 'starter'"
            class="btn btn-primary btn-sm"
            :disabled="!canPlay"
            @click="season.promoteToStarters(selected.id)"
          >
            {{ t('squad.toEleven') }}
          </button>
          <button
            v-if="place !== 'bench'"
            class="btn btn-secondary btn-sm"
            :disabled="!canPlay"
            @click="season.demoteToBench(selected.id)"
          >
            {{ t('squad.toBench') }}
          </button>
          <button
            v-if="place !== 'rest'"
            class="btn btn-ghost btn-sm"
            @click="season.restPlayer(selected.id)"
          >
            {{ t('squad.toRest') }}
          </button>
        </div>
        <span
          v-if="!canPlay"
          class="why"
        >{{ selected.injured > 0 ? t('squad.whyInjured', { d: selected.injured }) : t('squad.whyAbsent') }}</span>
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
.main { padding: 24px; display: flex; flex-direction: column; gap: 12px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
.h1 { font-size: 28px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.hint { font-size: 12px; color: var(--fg-dim); margin-top: -6px; }
.tbl { overflow: hidden; }
.ghead { display: flex; align-items: center; gap: 10px; padding: 10px 16px; border-bottom: 1px solid var(--hairline); }
.gcount { font-size: 11px; color: var(--fg-dim); }
.trow { display: grid; grid-template-columns: 40px minmax(0, 1fr) 44px; align-items: center; border-bottom: 1px solid var(--row-line); }
.trow.on { background: rgba(31, 154, 99, 0.10); }
.trow.from { background: rgba(214, 168, 44, 0.14); }
.rowmain { display: grid; grid-template-columns: minmax(0, 1fr) 58px 44px 52px 74px 62px 92px; align-items: center; gap: 0; padding: 8px 0; border: none; background: transparent; font: inherit; font-size: 14px; color: var(--fg-2); text-align: left; cursor: pointer; width: 100%; }
.trow.on .rowmain { color: var(--fg); }
.slot { font-size: 11px; color: var(--fg-dim); padding-left: 16px; }
.slot.role { color: var(--accent-soft); letter-spacing: 0.08em; }
.swapbtn { font-size: 12px; color: var(--fg-dim); background: transparent; border: 1px solid transparent; border-radius: 4px; padding: 5px 6px; margin-right: 10px; cursor: pointer; }
.swapbtn:hover { color: var(--fg); border-color: var(--hairline); }
.swapbtn.armed { color: var(--signal); border-color: var(--line-strong); }
.gempty { padding: 12px 16px; font-size: 12.5px; color: var(--fg-dim); }
.r { text-align: right; }
.namecell { display: flex; align-items: center; gap: 8px; min-width: 0; }
.nm { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.badge { font-size: 10px; color: var(--accent-soft); }
.role { font-size: 11px; letter-spacing: 0.08em; color: var(--fg-muted); }
.num { font-size: 13px; color: var(--fg-muted); }
.ovr { font-size: 14px; color: var(--fg); }
.st { font-size: 11px; padding-right: 4px; }
.rail { border-left: 1px solid var(--hairline); background: var(--panel); display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.phead { padding: 24px; border-bottom: 1px solid var(--hairline); display: flex; gap: 18px; align-items: flex-end; }
.portrait { width: 96px; height: 112px; border: 1px solid #1b2530; border-radius: 8px; background: repeating-linear-gradient(135deg, #0d151a 0 9px, #0b1216 9px 18px); display: grid; place-items: center; overflow: hidden; position: relative; flex: none; }
.portrait img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.plabel { font-size: 9px; color: var(--fg-faint); text-align: center; }
.pcol { display: flex; flex-direction: column; gap: 3px; min-width: 0; }
.pname { font-family: var(--font-display); font-size: 38px; font-weight: 700; letter-spacing: 0.03em; line-height: 1; }
.chips { display: flex; gap: 8px; margin-top: 5px; flex-wrap: wrap; }
.moves { padding: 16px 24px; border-bottom: 1px solid var(--hairline); display: flex; flex-direction: column; gap: 8px; }
.mrow { display: flex; gap: 8px; flex-wrap: wrap; }
.why { font-size: 12px; color: var(--signal); }
.pbody { padding: 22px 24px; display: flex; flex-direction: column; gap: 18px; }
.attrs { display: flex; flex-direction: column; gap: 10px; }
.arow { display: grid; grid-template-columns: 110px minmax(0, 1fr) 34px; gap: 12px; align-items: center; }
.ak { font-size: 13.5px; color: var(--fg-3); }
.av { font-size: 12.5px; color: var(--fg); text-align: right; }
.how { padding-top: 16px; display: flex; flex-direction: column; gap: 8px; }
.howp { font-size: 14.5px; color: var(--fg-2); line-height: 1.6; }
.empty { padding: 24px; color: var(--fg-dim); font-size: 14px; }
@media (max-width: 1100px) { .sq { grid-template-columns: 1fr; } .rail { border-left: none; border-top: 1px solid var(--hairline); } .rowmain { grid-template-columns: minmax(0, 1fr) 44px 36px 40px 60px 48px 70px; font-size: 12px; } }
</style>
