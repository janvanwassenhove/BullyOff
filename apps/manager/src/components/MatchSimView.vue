<script setup lang="ts">
/**
 * 07 · Match simulation — engine view. Score bar / pitch (camera + overlays) / transport with a
 * scrub bar and event markers; left rail: phase of play + engine inputs; right rail: live stats
 * + event log; LEARN THIS PHASE from the analyser. Replays: the last user match, a quick AI match
 * or a §6.2 scenario, or a loaded .replay.json. Presentation only — the log is never touched.
 */
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { FRAME_PLAYER_STRIDE, TICK_HZ, type MatchEvent, type MatchLog } from '@bullyoff/engine';
import { analyse } from '@bullyoff/insight';
import type { CameraChoice, HudState, MatchView, OverlayId, ViewMode } from '@bullyoff/render';
import { inCircle } from '@bullyoff/shared';
import { useAppStore } from '../stores/app';
import { useMatchStore } from '../stores/match';
import { useSeasonStore } from '../stores/season';
import { clockOf, eventLine, LOGGED } from '../lib/eventText';
import PitchCanvas from './ui/PitchCanvas.vue';

const { t } = useI18n();
const app = useAppStore();
const match = useMatchStore();
const season = useSeasonStore();
const view = shallowRef<MatchView | null>(null);
const tick = ref(0);
const hud = ref<HudState>({ score: [0, 0], quarter: 1, clockSeconds: 0, phase: '', lastEvent: '' });
const mode = ref<ViewMode>('tactical');
const camera = ref<CameraChoice>('broadcast');
const overlay = ref<OverlayId>('none');
const speed = ref(1);
const SCENARIOS = ['outlet-under-press', 'high-press-vs-deep-block', 'baseline-entry', 'two-v-one', 'three-v-two', 'pc-dragFlick', 'pc-lowHit', 'pc-slipRight', 'pc-deflection', 'pc-one-man-down', 'last-two-minutes', 'counter-attack', 'long-corner'];
const CAMS: CameraChoice[] = ['full', 'broadcast', 'circle', 'goalmouth', 'behindGoal', 'director'];

const last = computed(() => season.lastMatch);
const log = computed<MatchLog | null>(() => match.log);
const shorts = computed<[string, string]>(() => (match.source === 'last' && last.value ? last.value.shorts : ['HOME', 'AWAY']));
const colours = computed<[number, number]>(() => match.colours ?? [0x1d3557, 0xe63946]);
const coachTeam = computed<0 | 1>(() => (match.source === 'last' && last.value ? last.value.coachTeam : 0));
const names = computed<Record<number, string>>(() => (match.source === 'last' && last.value ? last.value.names : {}));
const lastTick = computed(() => view.value?.lastTick ?? (log.value?.events[log.value.events.length - 1]?.tick ?? 1));

onMounted(() => { if (!match.log && last.value) showLast(); });
function showLast(): void { if (!last.value) return; match.setLog(last.value.log, 'last', last.value.colours); }
function onReady(v: MatchView): void { view.value = v; v.setSpeed(speed.value); }
function onFrame(tk: number, h: HudState): void { tick.value = tk; hud.value = h; }
function setSpeed(x: number): void { speed.value = x; view.value?.setSpeed(x); }
function simToFt(): void { view.value?.seek(lastTick.value); view.value?.pause(); }
function seek(ev: Event): void { view.value?.seek(Number((ev.target as HTMLInputElement).value)); }
function setMode(m: ViewMode): void { mode.value = m; if (m === 'director') camera.value = 'director'; else if (camera.value === 'director') camera.value = 'full'; }
watch(camera, (c) => { if (c === 'director') mode.value = 'director'; else if (mode.value === 'director') mode.value = 'tactical'; });

/** Live stats up to the play head (derived from the log only). */
const live = computed(() => {
  const l = log.value; if (!l) return [];
  const upTo = tick.value;
  const teamOf = new Map<number, number>(l.header.playerIds.map((id, i) => [id, l.header.teams[i] ?? 0]));
  const ev = l.events.filter((e) => e.tick <= upTo);
  const me = coachTeam.value, them = me === 0 ? 1 : 0;
  const cnt = (pred: (e: MatchEvent) => boolean): number => ev.filter(pred).length;
  const touches = [cnt((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === me), cnt((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === them)];
  const poss = Math.round((100 * (touches[0] ?? 0)) / Math.max(1, (touches[0] ?? 0) + (touches[1] ?? 0)));
  const entries = (tm: number): number => cnt((e) => e.t === 'CircleEntry' && e.lastTouch !== null && teamOf.get(e.lastTouch) === tm && (e.end === 1 ? 0 : 1) === tm);
  const shots = (tm: number): number => cnt((e) => e.t === 'BallStruck' && e.team === tm && e.x !== undefined && e.y !== undefined && inCircle({ x: e.x, y: e.y }, tm === 0 ? 1 : -1) && !(e.kind === 'push' && e.speed < 5));
  const f = [...l.frames].reverse().find((fr) => fr.tick <= upTo);
  const stamina = (tm: number): number => { if (!f) return 100; let s = 0, n = 0; l.header.playerIds.forEach((id, i) => { if (teamOf.get(id) !== tm) return; const y = f.players[i * FRAME_PLAYER_STRIDE + 1] ?? 0; if (Math.abs(y) > 29) return; s += f.players[i * FRAME_PLAYER_STRIDE + 6] ?? 1; n++; }); return n ? Math.round((100 * s) / n) : 100; };
  const row = (k: string, a: number, b: number, suffix = ''): { k: string; a: string; b: string; aw: number; bw: number } => ({ k, a: `${a}${suffix}`, b: `${b}${suffix}`, aw: Math.round((44 * a) / Math.max(1, a + b)), bw: Math.round((44 * b) / Math.max(1, a + b)) });
  return [
    row('possession', poss, 100 - poss, ' %'),
    row('circleEntries', entries(me), entries(them)),
    row('shots', shots(me), shots(them)),
    row('pcs', cnt((e) => e.t === 'PenaltyCornerAwarded' && e.team === me), cnt((e) => e.t === 'PenaltyCornerAwarded' && e.team === them)),
    row('tacklesWon', cnt((e) => e.t === 'Tackle' && e.tacklerTeam === me && e.outcome === 'won'), cnt((e) => e.t === 'Tackle' && e.tacklerTeam === them && e.outcome === 'won')),
    row('stamina', stamina(me), stamina(them), ' %'),
  ];
});
const logLines = computed(() => {
  const l = log.value; if (!l) return [];
  return l.events.filter((e) => e.tick <= tick.value && LOGGED.includes(e.t)).slice(-9).reverse().map((e) => ({ tick: e.tick, ...(eventLine(e, t, shorts.value, names.value) ?? { text: e.t, colour: 'var(--fg-muted)' }) }));
});
const markers = computed(() => {
  const l = log.value; if (!l) return [];
  const me = coachTeam.value;
  return l.events.filter((e) => e.t === 'Goal' || e.t === 'PenaltyCornerAwarded' || e.t === 'Card' || e.t === 'Substitution').map((e) => ({
    tick: e.tick, left: (100 * e.tick) / Math.max(1, lastTick.value),
    colour: e.t === 'Goal' ? (e.team === me ? 'var(--accent)' : 'var(--danger)') : e.t === 'PenaltyCornerAwarded' ? 'var(--signal)' : 'var(--fg-muted)',
  }));
});
const phase = computed(() => {
  const l = log.value; if (!l) return null;
  const ins = match.source === 'last' && last.value ? last.value.instructions : [];
  const f = analyse(l, ins, coachTeam.value, { upToTick: Math.max(1, Math.floor(tick.value)), names: names.value });
  return { phase: f.find((x) => x.section === 'phase') ?? null, read: f.find((x) => x.section === 'coachRead') ?? null, rule: f.find((x) => x.section === 'rule') ?? null };
});
const inputs = computed(() => {
  const l = log.value; if (!l) return [];
  const tac = last.value && match.source === 'last' ? null : null;
  void tac;
  const club = season.userClub;
  return [
    ['profile', t('viewer.' + l.header.profile)], ['turf', t('viewer.' + l.header.surface)],
    ['formation', club?.tactics.formation ?? '4-3-3'], ['press', club ? t('coach.press.' + club.tactics.press) : '—'],
    ['mentality', club ? t('coach.mentality.' + club.tactics.mentality) : '—'], ['tempo', club ? t('coach.tempo.' + (club.tactics.tempo < 0.4 ? 'low' : club.tactics.tempo > 0.65 ? 'high' : 'normal')) : '—'],
    ['rotate', club ? `${Math.round(club.tactics.rotateBelowStamina * 100)} %` : '—'], ['tickRate', `${TICK_HZ} Hz`],
  ];
});
const quarterMarks = computed(() => { const l = log.value; if (!l) return []; return l.events.filter((e): e is Extract<MatchEvent, { t: 'QuarterStart' }> => e.t === 'QuarterStart').map((e) => ({ q: e.quarter, tick: e.tick })); });
async function onFile(ev: Event): Promise<void> { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; match.loadJson(await f.text(), f.name); }
function download(): void { const json = match.exportReplay(); if (!json) return; const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `bullyoff-${match.seed}.replay.json`; a.click(); URL.revokeObjectURL(a.href); }
const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
</script>

<template>
  <section class="sim">
    <header class="scorebar">
      <span
        class="kit-rail"
        :style="{ background: '#' + colours[0].toString(16).padStart(6, '0') }"
      />
      <div class="teams">
        <span class="tname">{{ shorts[0] }}</span>
        <span class="score">{{ hud.score[0] }}</span><span class="dotsep">·</span><span class="score away">{{ hud.score[1] }}</span>
        <span class="tname muted">{{ shorts[1] }}</span>
      </div>
      <span
        class="kit-rail"
        :style="{ background: '#' + colours[1].toString(16).padStart(6, '0') }"
      />
      <div class="clockgrp">
        <div class="col"><span class="mono clock">{{ fmt(hud.clockSeconds) }}</span><span class="eyebrow">{{ hud.phase.toUpperCase() }} · {{ view?.playing ? t('sim.play') : t('sim.paused') }}</span></div>
        <span class="vdiv" />
        <div class="col"><span class="mono tickt">{{ t('sim.tick', { n: Math.floor(tick).toLocaleString() }) }}</span><span class="eyebrow">{{ t('sim.seed', { seed: log?.header.seed ?? '—', turf: (log?.header.surface ?? '').toUpperCase() }) }}</span></div>
      </div>
      <span class="grow" />
      <button
        class="btn btn-secondary btn-sm"
        @click="app.go(season.world?.userClub ? 'season' : 'title')"
      >
        {{ t('app.back') }}
      </button>
      <div class="modes">
        <button
          v-for="m in (['director', 'tactical', 'coach'] as const)"
          :key="m"
          class="chip chip-11"
          :class="{ 'chip-on': mode === m }"
          @click="setMode(m)"
        >
          {{ t('viewer.' + m).toUpperCase() }}
        </button>
      </div>
    </header>

    <div class="body">
      <aside class="rail left">
        <div class="blk">
          <span class="eyebrow">{{ t('sim.phase') }}</span>
          <template v-if="phase?.phase">
            <span class="ptitle">{{ t(phase.phase.i18nKey + '.title', phase.phase.params) }}</span>
            <span class="pbody">{{ t(phase.phase.i18nKey + '.body', phase.phase.params) }}</span>
          </template>
        </div>
        <div class="blk hairline-t">
          <span class="eyebrow">{{ t('sim.inputs') }}</span>
          <div
            v-for="[k, v] in inputs"
            :key="k"
            class="kv"
          >
            <span class="k">{{ t('sim.inputKeys.' + k) }}</span><span class="mono v">{{ v }}</span>
          </div>
        </div>
        <div class="blk hairline-t">
          <span class="eyebrow eyebrow-accent">{{ t('sim.deterministic') }}</span>
          <span class="det">{{ t('sim.deterministicBody') }}</span>
        </div>
      </aside>

      <div class="pitchwrap">
        <PitchCanvas
          v-if="log"
          :log="log"
          :colours="colours"
          :camera="camera"
          :overlay="overlay"
          :mode="mode"
          :coach-team="coachTeam"
          @ready="onReady"
          @frame="onFrame"
        />
        <div
          v-else
          class="emptyp"
        >
          <p>{{ t('sim.empty') }}</p>
          <div class="emptyctl">
            <label class="small">{{ t('sim.profile') }} <select
              v-model="match.profile"
              class="ui"
            ><option value="mens">{{ t('viewer.mens') }}</option><option value="womens">{{ t('viewer.womens') }}</option></select></label>
            <label class="small">{{ t('sim.turf') }} <select
              v-model="match.surface"
              class="ui"
            ><option value="watered">{{ t('viewer.watered') }}</option><option value="dry">{{ t('viewer.dry') }}</option><option value="wet">{{ t('viewer.wet') }}</option></select></label>
            <label class="small">{{ t('sim.seedLabel') }} <input
              v-model.number="match.seed"
              class="ui"
              type="number"
            ></label>
          </div>
          <div class="emptyctl">
            <button
              class="btn btn-primary btn-md"
              :disabled="match.busy"
              @click="match.simulate()"
            >
              {{ t('sim.simulate') }}
            </button>
            <select
              v-model="match.scenarioId"
              class="ui"
            >
              <option
                v-for="s in SCENARIOS"
                :key="s"
                :value="s"
              >
                {{ s }}
              </option>
            </select>
            <button
              class="btn btn-secondary"
              :disabled="match.busy"
              @click="match.runScenario()"
            >
              {{ t('sim.scenario') }}
            </button>
            <label class="btn btn-secondary">{{ t('sim.load') }}<input
              type="file"
              accept="application/json"
              class="sr-only"
              @change="onFile"
            ></label>
            <button
              v-if="last"
              class="btn btn-secondary"
              @click="showLast"
            >
              {{ t('hub.watch') }}
            </button>
          </div>
          <p
            v-if="match.error"
            class="err"
          >
            {{ match.error }}
          </p>
        </div>
        <div
          v-if="log"
          class="ovl-tl"
        >
          <button
            v-for="o in (['none', 'press', 'channels', 'circle'] as const)"
            :key="o"
            class="chip chip-mode"
            :class="{ on: overlay === o }"
            @click="overlay = o"
          >
            {{ t('sim.overlays.' + o) }}
          </button>
        </div>
        <div
          v-if="log"
          class="ovl-tr"
        >
          <span class="eyebrow">{{ t('sim.cameraLabel') }}</span>
          <div class="camchips">
            <button
              v-for="c in CAMS"
              :key="c"
              class="chip chip-mode"
              :class="{ on: camera === c }"
              @click="camera = c"
            >
              {{ t('sim.cams.' + c) }}
            </button>
          </div>
        </div>
      </div>

      <aside class="rail right">
        <div class="blk">
          <span class="eyebrow">{{ t('sim.live') }}</span>
          <div
            v-for="s in live"
            :key="s.k"
            class="stat"
          >
            <div class="statrow"><span class="mono a">{{ s.a }}</span><span class="sk">{{ t('coach.stats.' + s.k) }}</span><span class="mono b">{{ s.b }}</span></div>
            <div class="sbar">
              <span
                class="sa"
                :style="{ width: s.aw + '%' }"
              /><span class="grow" /><span
                class="sb"
                :style="{ width: s.bw + '%' }"
              />
            </div>
          </div>
        </div>
        <div class="blk hairline-t">
          <span class="eyebrow">{{ t('sim.eventLog') }}</span>
          <div
            v-for="l in logLines"
            :key="l.tick + l.text"
            class="logrow"
          >
            <span class="mono lt">{{ clockOf(l.tick) }}</span><span
              class="ls"
              :style="{ color: l.colour }"
            >{{ l.text }}</span>
          </div>
        </div>
      </aside>
    </div>

    <footer class="transport">
      <div class="tcol">
        <div class="trow">
          <button
            class="tbtn mono"
            @click="view?.toggle()"
          >
            {{ view?.playing ? '⏸' : '▶' }}
          </button>
          <button
            v-for="x in [1, 2, 4]"
            :key="x"
            class="chip chip-11"
            :class="{ 'chip-on': speed === x }"
            @click="setSpeed(x)"
          >
            {{ x }}×
          </button>
          <button
            class="chip chip-11"
            @click="simToFt"
          >
            {{ t('sim.speeds.ft') }}
          </button>
          <span class="vdiv" />
          <button
            v-for="q in quarterMarks"
            :key="q.q"
            class="qmark mono"
            :class="{ on: hud.quarter === q.q }"
            @click="view?.seek(q.tick)"
          >
            Q{{ q.q }}
          </button>
          <span class="grow" />
          <span class="mono dim small">{{ t('sim.clockOf', { a: fmt(hud.clockSeconds), b: '60:00' }) }}</span>
        </div>
        <div class="scrub">
          <div class="track" />
          <div
            class="fill"
            :style="{ width: (100 * tick / Math.max(1, lastTick)) + '%' }"
          />
          <span
            v-for="(m, i) in markers"
            :key="i"
            class="mk"
            :style="{ left: m.left + '%' }"
          ><i :style="{ background: m.colour }" /><b :style="{ background: m.colour }" /></span>
          <div
            class="head"
            :style="{ left: (100 * tick / Math.max(1, lastTick)) + '%' }"
          />
          <input
            class="range"
            type="range"
            min="0"
            :max="lastTick"
            step="1"
            :value="Math.floor(tick)"
            @input="seek"
          >
        </div>
        <div class="legend mono">
          <span><i style="background: var(--accent)" />{{ t('sim.legend.ourGoal') }}</span>
          <span><i style="background: var(--danger)" />{{ t('sim.legend.theirs') }}</span>
          <span><i style="background: var(--signal)" />{{ t('sim.legend.pc') }}</span>
          <span><i style="background: var(--fg-muted)" />{{ t('sim.legend.cardSub') }}</span>
          <span class="grow" />
          <button
            class="chip chip-11"
            :disabled="!log"
            @click="download"
          >
            {{ t('sim.export') }}
          </button>
        </div>
      </div>
      <div class="learn">
        <span class="eyebrow eyebrow-signal">{{ t('sim.learn') }}</span>
        <template v-if="phase?.read">
          <span class="ltitle">{{ t(phase.read.i18nKey + '.title', phase.read.params) }}</span>
          <span class="lbody">{{ t(phase.read.i18nKey + '.body', phase.read.params) }}</span>
        </template>
        <template v-else-if="phase?.phase">
          <span class="ltitle">{{ t(phase.phase.i18nKey + '.title', phase.phase.params) }}</span>
          <span class="lbody">{{ t(phase.phase.i18nKey + '.body', phase.phase.params) }}</span>
        </template>
        <button
          class="rulelink mono"
          @click="app.openRule(phase?.rule?.ruleKey ?? 'rules.circle')"
        >
          {{ t('sim.openRulebook') }}
        </button>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.sim { min-height: 100dvh; display: grid; grid-template-rows: 64px minmax(0, 1fr) auto; background: var(--bg); }
.scorebar { display: flex; align-items: stretch; border-bottom: 1px solid var(--hairline); background: var(--panel-2); }
.teams { display: flex; align-items: center; gap: 14px; padding: 0 20px; }
.tname { font-family: var(--font-display); font-size: 17px; font-weight: 600; letter-spacing: 0.1em; }
.tname.muted { color: var(--fg-muted); }
.score { font-family: var(--font-display); font-size: 34px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; }
.score.away { color: var(--fg-2); }
.dotsep { color: #3d4852; }
.clockgrp { display: flex; align-items: center; gap: 14px; border-left: 1px solid var(--hairline); padding: 0 20px; }
.col { display: flex; flex-direction: column; }
.clock { font-size: 16px; letter-spacing: 0.04em; }
.tickt { font-size: 12px; color: var(--accent-soft); }
.vdiv { height: 30px; align-self: center; }
.modes { display: flex; gap: 6px; align-items: center; padding: 0 20px; }
.chip { cursor: pointer; background: transparent; }
.body { display: grid; grid-template-columns: 264px minmax(0, 1fr) 300px; min-height: 0; }
.rail { background: var(--panel); padding: 18px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.rail.left { border-right: 1px solid var(--hairline); }
.rail.right { border-left: 1px solid var(--hairline); }
.blk { display: flex; flex-direction: column; gap: 9px; }
.blk.hairline-t { padding-top: 16px; }
.ptitle { font-family: var(--font-display); font-size: 26px; font-weight: 600; letter-spacing: 0.02em; line-height: 1.1; }
.pbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.55; }
.kv { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; border-bottom: 1px solid var(--row-line); padding-bottom: 6px; }
.k { color: var(--fg-muted); }
.v { color: var(--accent-pale); }
.det { font-size: 12.5px; color: var(--fg-muted); line-height: 1.5; }
.pitchwrap { position: relative; background: #08120e; min-height: 360px; }
.emptyp { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; color: var(--fg-3); padding: 24px; text-align: center; }
.emptyctl { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; justify-content: center; }
.small { font-size: 13px; color: var(--fg-muted); display: inline-flex; gap: 6px; align-items: center; }
.ovl-tl { position: absolute; left: 20px; top: 18px; display: flex; gap: 6px; }
.ovl-tr { position: absolute; right: 20px; top: 18px; display: flex; flex-direction: column; gap: 6px; align-items: flex-end; }
.camchips { display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; }
.stat { display: flex; flex-direction: column; gap: 4px; }
.statrow { display: flex; justify-content: space-between; font-size: 13px; }
.a { color: var(--accent-soft); }
.b { color: var(--fg-2); }
.sk { color: var(--fg-muted); }
.sbar { display: flex; height: 3px; gap: 2px; }
.sa { background: var(--accent); border-radius: 2px; }
.sb { background: var(--danger); border-radius: 2px; }
.logrow { display: grid; grid-template-columns: 44px minmax(0, 1fr); gap: 9px; align-items: baseline; font-size: 13px; }
.lt { font-size: 11px; color: var(--fg-dim); }
.ls { line-height: 1.4; }
.transport { border-top: 1px solid var(--hairline); background: var(--panel-2); display: grid; grid-template-columns: minmax(0, 1fr) 340px; }
.tcol { padding: 14px 20px; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
.trow { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
.tbtn { font-size: 13px; color: var(--fg); background: none; border: none; cursor: pointer; }
.qmark { font-size: 11px; letter-spacing: 0.12em; color: var(--fg-dim); background: none; border: none; cursor: pointer; }
.qmark.on { color: var(--accent-soft); }
.dim { color: var(--fg-dim); }
.scrub { position: relative; height: 34px; }
.track { position: absolute; left: 0; right: 0; top: 15px; height: 4px; background: #171d23; border-radius: 2px; }
.fill { position: absolute; left: 0; top: 15px; height: 4px; background: var(--accent); border-radius: 2px; }
.mk { position: absolute; top: 0; display: flex; flex-direction: column; align-items: center; gap: 2px; transform: translateX(-50%); pointer-events: none; }
.mk i { width: 2px; height: 13px; display: block; }
.mk b { width: 8px; height: 8px; border-radius: 2px; display: block; }
.head { position: absolute; top: 6px; width: 2px; height: 22px; background: #f2f7fa; transform: translateX(-50%); pointer-events: none; }
.range { position: absolute; inset: 0; width: 100%; opacity: 0; cursor: pointer; margin: 0; }
.legend { display: flex; gap: 16px; font-size: 10px; letter-spacing: 0.1em; color: var(--fg-faint); align-items: center; flex-wrap: wrap; }
.legend i { display: inline-block; width: 7px; height: 7px; border-radius: 2px; margin-right: 5px; }
.learn { border-left: 1px solid var(--hairline); padding: 14px 20px; display: flex; flex-direction: column; gap: 7px; }
.ltitle { font-family: var(--font-display); font-size: 19px; font-weight: 600; line-height: 1.15; }
.lbody { font-size: 13px; color: var(--fg-3); line-height: 1.5; }
.rulelink { font-size: 11px; letter-spacing: 0.1em; color: var(--accent-soft); background: none; border: none; cursor: pointer; text-align: left; padding: 0; margin-top: 2px; }
.err { color: var(--danger); font-size: 13px; }
@media (max-width: 1100px) { .body { grid-template-columns: 1fr; } .rail.left { display: none; } .rail.right { border-left: none; border-top: 1px solid var(--hairline); } .transport { grid-template-columns: 1fr; } .learn { border-left: none; border-top: 1px solid var(--hairline); } }
</style>
