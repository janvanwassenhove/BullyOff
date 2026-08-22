<script setup lang="ts">
/**
 * 08 · Post-match report — the teaching screen. Header (crests, names, score, context, actions),
 * MATCH SHEET, MOMENTUM + KEY MOMENTS (thumbnails rendered from the replay at the moment's tick),
 * and the learning rail: WHAT YOU DID WELL · TO WORK ON · RULE OF THE MATCH. Every claim comes
 * from packages/insight; no authored prose.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { analyse, matchSheet, momentum, type Finding } from '@bullyoff/insight';
import { topicForFinding } from '../lib/academy';
import type { MatchView } from '@bullyoff/render';
import { useAppStore } from '../stores/app';
import { useMatchStore } from '../stores/match';
import { useSeasonStore } from '../stores/season';
import { clockOf } from '../lib/eventText';
import Crest from './ui/Crest.vue';
import PitchCanvas from './ui/PitchCanvas.vue';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const match = useMatchStore();
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const lm = computed(() => season.lastMatch);
const world = computed(() => season.world);
const homeClub = computed(() => { const w = world.value; const f = w?.season.fixtures.find((x) => x.id === lm.value?.fixtureId); return f && w ? w.clubs[f.home] ?? null : null; });
const awayClub = computed(() => { const w = world.value; const f = w?.season.fixtures.find((x) => x.id === lm.value?.fixtureId); return f && w ? w.clubs[f.away] ?? null : null; });
const score = computed<[number, number]>(() => { const g = lm.value?.log.events.filter((e) => e.t === 'Goal') ?? []; const last = g[g.length - 1]; return last?.t === 'Goal' ? last.score : [0, 0]; });
const findings = computed<Finding[]>(() => (lm.value ? analyse(lm.value.log, lm.value.instructions, lm.value.coachTeam, { names: lm.value.names }) : []));
const well = computed(() => findings.value.filter((f) => f.section === 'well'));
const lessons = computed(() => findings.value.filter((f) => f.section === 'lesson').slice(0, 3));
const rule = computed(() => findings.value.find((f) => f.section === 'rule') ?? null);
/**
 * Coach hints: the short version. A lesson card explains; a hint tells you the one thing to do next
 * and hands you the academy topic that covers it. A finding qualifies exactly when it maps to a
 * topic — `academy.test.ts` holds the two sides together, so every mapped kind has a `hint` string
 * in all three languages and every hinted kind has somewhere to go.
 */
const hints = computed(() => findings.value
  .filter((f) => f.section === 'lesson' || f.section === 'coachRead')
  .map((f) => ({ key: `${f.kind}-${f.tick}`, i18nKey: f.i18nKey, params: f.params, topic: topicForFinding(f.kind) }))
  .filter((h) => h.topic !== null)
  .slice(0, 3));
const moments = computed(() => findings.value.filter((f) => f.section === 'moment').slice(0, 6));
const sheet = computed(() => (lm.value ? matchSheet(lm.value.log, lm.value.coachTeam) : []));
const mom = computed(() => (lm.value ? momentum(lm.value.log, lm.value.coachTeam) : []));
const momMax = computed(() => Math.max(1, ...mom.value.map((b) => Math.max(b.us, b.them))));
const ordinal = (n: number): string => (n <= 0 ? '—' : n <= 3 ? t(`ordinal.${n}`) : t('ordinal.n', { n }));
const thumbs = ref<Record<number, string>>({});
const thumbView = ref<MatchView | null>(null);
function onThumbReady(v: MatchView): void {
  thumbView.value = v; v.pause();
  // render each key moment from the replay a beat after the event, goal-mouth camera
  const out: Record<number, string> = {};
  for (const m of moments.value) { try { out[m.tick] = v.snapshot(Math.min(v.lastTick, m.tick + 10), 200, 112, m.kind === 'goal' ? 'goalmouth' : 'circle'); } catch { /* canvas unavailable */ } }
  thumbs.value = out;
}
const railColour = (s: Finding['severity']): string => (s === 'mistake' ? 'var(--danger)' : s === 'decision' ? 'var(--signal)' : s === 'good' ? 'var(--accent)' : 'var(--line-strong)');
function watch(): void { if (lm.value) { match.setLog(lm.value.log, 'last', lm.value.colours); app.go('viewer'); } }
function exportReplay(): void { if (!lm.value) return; match.setLog(lm.value.log, 'last', lm.value.colours); const json = match.exportReplay(); if (!json) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `bullyoff-day${lm.value.day}.replay.json`; a.click(); URL.revokeObjectURL(a.href); }
onMounted(() => { if (!lm.value) app.go('season'); });
</script>

<template>
  <section
    v-if="lm"
    class="report"
  >
    <header
      class="head"
      :style="{ background: `linear-gradient(105deg, ${hex(lm.colours[0])}8c, rgba(10,13,16,0.2) 60%, ${hex(lm.colours[1])}2e)` }"
    >
      <div class="teams">
        <Crest
          :colours="homeClub?.colours ?? [lm.colours[0], 0xffffff]"
          :shape="homeClub?.badge.shape ?? 'shield'"
          :split="homeClub?.badge.split ?? 'band'"
          :size="44"
          light
        />
        <div class="col">
          <span class="eyebrow">{{ t('report.fullTime', { day: lm.day + 1, turf: t('career.' + lm.surface) }) }}</span>
          <span class="tname">{{ lm.clubNames[0] }}</span>
        </div>
        <span class="score">{{ score[0] }} · {{ score[1] }}</span>
        <div class="col">
          <span class="eyebrow">{{ t('report.tierLine', { tier: lm.tier, before: ordinal(lm.posBefore), after: ordinal(lm.posAfter) }) }}</span>
          <span class="tname muted">{{ lm.clubNames[1] }}</span>
        </div>
        <Crest
          :colours="awayClub?.colours ?? [lm.colours[1], 0xffffff]"
          :shape="awayClub?.badge.shape ?? 'shield'"
          :split="awayClub?.badge.split ?? 'band'"
          :size="44"
          light
        />
      </div>
      <span class="grow" />
      <div class="actions">
        <button
          class="btn btn-ghost"
          @click="watch"
        >
          {{ t('report.watch') }}
        </button>
        <button
          class="btn btn-ghost"
          @click="exportReplay"
        >
          {{ t('report.export') }}
        </button>
        <button
          class="btn btn-primary"
          @click="app.go('season')"
        >
          {{ t('report.back') }}
        </button>
      </div>
    </header>

    <div class="cols">
      <aside class="sheet">
        <span class="eyebrow">{{ t('report.sheet') }}</span>
        <div
          v-for="r in sheet"
          :key="r.key"
          class="srow"
        >
          <span
            class="mono sa"
            :style="{ color: r.usN >= r.themN ? 'var(--accent-soft)' : 'var(--fg-muted)' }"
          >{{ r.us }}</span>
          <div class="smid">
            <span class="sk">{{ t('report.rows.' + r.key) }}</span>
            <div class="sbar">
              <span
                class="a"
                :style="{ width: Math.round(46 * r.usN / Math.max(1, r.usN + r.themN)) + '%' }"
              /><span class="grow" /><span
                class="b"
                :style="{ width: Math.round(46 * r.themN / Math.max(1, r.usN + r.themN)) + '%' }"
              />
            </div>
          </div>
          <span
            class="mono sb"
            :style="{ color: r.themN > r.usN ? '#e88' : 'var(--fg-muted)' }"
          >{{ r.them }}</span>
        </div>
      </aside>

      <main class="mid">
        <div class="mh"><span class="eyebrow">{{ t('report.momentum') }}</span><span class="sub">{{ t('report.momentumSub') }}</span></div>
        <div class="momentum panel">
          <span
            v-for="(b, i) in mom"
            :key="i"
            class="bucket"
          >
            <span
              class="us"
              :style="{ height: Math.round(62 * b.us / momMax) + '%' }"
            />
            <span
              class="them"
              :style="{ height: Math.round(32 * b.them / momMax) + '%' }"
            />
          </span>
        </div>
        <span class="eyebrow">{{ t('report.keyMoments') }}</span>
        <p
          v-if="!moments.length"
          class="empty"
        >
          {{ t('report.noMoments') }}
        </p>
        <div class="moments">
          <article
            v-for="m in moments"
            :key="m.tick + m.kind"
            class="moment"
            :style="{ borderLeftColor: railColour(m.severity) }"
          >
            <div class="thumb">
              <img
                v-if="thumbs[m.tick]"
                :src="thumbs[m.tick]"
                alt=""
              >
              <span class="mono tl">{{ clockOf(m.tick) }}</span>
            </div>
            <div class="mcol">
              <span class="mtitle">{{ t(m.i18nKey + '.title', m.params) }}</span>
              <span class="mbody">{{ t(m.i18nKey + '.body', m.params) }}</span>
            </div>
          </article>
        </div>
        <div class="hidden-stage">
          <PitchCanvas
            :log="lm.log"
            :colours="lm.colours"
            camera="goalmouth"
            mode="tactical"
            :coach-team="lm.coachTeam"
            :auto-play="false"
            @ready="onThumbReady"
          />
        </div>
      </main>

      <aside class="learn">
        <div class="blk">
          <span class="eyebrow eyebrow-signal">{{ t('report.didWell') }}</span>
          <template v-if="well.length">
            <span class="wtitle">{{ t(well[0]!.i18nKey + '.title', well[0]!.params) }}</span>
            <span class="wbody">{{ t(well[0]!.i18nKey + '.body', well[0]!.params) }}</span>
          </template>
          <span
            v-else
            class="wbody"
          >{{ t('report.didWellNone') }}</span>
        </div>
        <div
          v-if="hints.length"
          class="blk hairline-t"
        >
          <span class="eyebrow eyebrow-signal">{{ t('report.hints') }}</span>
          <button
            v-for="h in hints"
            :key="h.key"
            class="hint"
            @click="app.openAcademy(h.topic)"
          >
            <span class="htext">{{ t(h.i18nKey + '.hint', h.params) }}</span>
            <span class="hgo">{{ t('academy.fromReport') }} →</span>
          </button>
        </div>
        <div class="blk hairline-t">
          <span class="eyebrow">{{ t('report.workOn') }}</span>
          <span
            v-if="!lessons.length"
            class="wbody"
          >{{ t('report.workOnNone') }}</span>
          <div
            v-for="l in lessons"
            :key="l.kind + l.tick"
            class="lesson rail"
          >
            <span class="ltitle">{{ t(l.i18nKey + '.title', l.params) }}</span>
            <span class="lbody">{{ t(l.i18nKey + '.body', l.params) }}</span>
          </div>
        </div>
        <div class="blk hairline-t">
          <span class="eyebrow">{{ t('report.ruleOfMatch') }}</span>
          <div
            v-if="rule?.ruleKey"
            class="rulecard"
          >
            <span class="rtitle">{{ t(rule.ruleKey + '.title') }}</span>
            <span class="rbody">{{ t(rule.i18nKey + '.title', { ...rule.params, foul: t('insight.foul.' + String(rule.params['foul'])) }) }}. {{ t(rule.ruleKey + '.body') }}</span>
            <button
              class="rulelink mono"
              @click="app.openRule(rule!.ruleKey ?? null)"
            >
              {{ t('report.readRule') }}
            </button>
          </div>
          <span
            v-else
            class="wbody"
          >{{ t('report.ruleNone') }}</span>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.report { min-height: 100dvh; display: grid; grid-template-rows: 150px minmax(0, 1fr); background: var(--bg); }
.head { display: flex; align-items: center; gap: 32px; padding: 0 32px; border-bottom: 1px solid var(--hairline); flex-wrap: wrap; }
.teams { display: flex; align-items: center; gap: 20px; flex-wrap: wrap; }
.col { display: flex; flex-direction: column; }
.tname { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: 0.06em; text-transform: uppercase; }
.tname.muted { color: var(--fg-2); }
.score { font-family: var(--font-display); font-size: 66px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; }
.actions { display: flex; gap: 10px; flex-wrap: wrap; }
.cols { display: grid; grid-template-columns: 400px minmax(0, 1fr) 420px; min-height: 0; }
.sheet { border-right: 1px solid var(--hairline); padding: 22px; display: flex; flex-direction: column; gap: 14px; background: var(--panel); overflow: auto; }
.srow { display: grid; grid-template-columns: 44px minmax(0, 1fr) 44px; gap: 10px; align-items: center; }
.sa { font-size: 14px; text-align: right; }
.sb { font-size: 14px; }
.smid { display: flex; flex-direction: column; gap: 4px; }
.sk { font-size: 12.5px; color: var(--fg-muted); text-align: center; }
.sbar { display: flex; height: 4px; gap: 2px; }
.sbar .a { background: var(--accent); border-radius: 2px; }
.sbar .b { background: var(--danger); border-radius: 2px; }
.mid { padding: 22px; display: flex; flex-direction: column; gap: 14px; min-height: 0; overflow: auto; }
.mh { display: flex; align-items: baseline; gap: 12px; }
.sub { font-size: 13px; color: var(--fg-muted); }
.momentum { height: 150px; display: flex; align-items: flex-end; gap: 6px; padding: 12px; }
.bucket { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; height: 100%; gap: 2px; }
.bucket .us { background: var(--accent); border-radius: 2px 2px 0 0; display: block; }
.bucket .them { background: #3a2226; border-radius: 0 0 2px 2px; display: block; }
.moments { display: flex; flex-direction: column; gap: 8px; }
.moment { display: grid; grid-template-columns: 100px minmax(0, 1fr); gap: 14px; background: var(--panel); border: 1px solid var(--hairline); border-left: 2px solid var(--line-strong); border-radius: 8px; padding: 12px 14px; align-items: center; }
.thumb { position: relative; height: 56px; border: 1px solid #1b2530; border-radius: 5px; background: repeating-linear-gradient(135deg, #0d151a 0 8px, #0b1216 8px 16px); overflow: hidden; display: grid; place-items: center; }
.thumb img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.tl { position: relative; font-size: 9px; color: var(--fg-faint); background: rgba(6, 9, 12, 0.7); padding: 1px 4px; border-radius: 2px; }
.mcol { display: flex; flex-direction: column; gap: 3px; }
.mtitle { font-family: var(--font-display); font-size: 18px; font-weight: 600; letter-spacing: 0.02em; }
.mbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.5; }
.hidden-stage { position: absolute; width: 400px; height: 224px; left: -9999px; top: 0; }
.learn { border-left: 1px solid var(--hairline); background: var(--panel); padding: 22px; display: flex; flex-direction: column; gap: 16px; overflow: auto; }
.blk { display: flex; flex-direction: column; gap: 9px; }
.blk.hairline-t { padding-top: 16px; }
.wtitle { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: 0.02em; line-height: 1.15; }
.wbody { font-size: 14px; color: var(--fg-3); line-height: 1.6; }
.hint { display: flex; align-items: baseline; gap: 10px; text-align: left; background: none; border: 0; padding: 7px 0; cursor: pointer; border-bottom: 1px solid var(--line); }
.hint:last-of-type { border-bottom: 0; }
.htext { font-size: 13px; color: var(--fg-2); line-height: 1.5; flex: 1; }
.hgo { font-size: 10.5px; letter-spacing: 0.08em; color: var(--signal); white-space: nowrap; }
.lesson { display: flex; flex-direction: column; gap: 3px; }
.ltitle { font-family: var(--font-display); font-size: 17px; font-weight: 600; }
.lbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.5; }
.rulecard { background: var(--panel-2); border: 1px solid var(--hairline); border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 6px; }
.rtitle { font-family: var(--font-display); font-size: 18px; font-weight: 600; }
.rbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.5; }
.rulelink { font-size: 11px; letter-spacing: 0.1em; color: var(--accent-soft); background: none; border: none; cursor: pointer; text-align: left; padding: 0; }
.empty { font-size: 13.5px; color: var(--fg-dim); }
@media (max-width: 1200px) { .cols { grid-template-columns: 1fr; } .sheet, .learn { border: none; border-top: 1px solid var(--hairline); } .report { grid-template-rows: auto minmax(0, 1fr); } .head { padding: 16px; } .score { font-size: 44px; } }
</style>
