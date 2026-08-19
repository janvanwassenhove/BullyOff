<script setup lang="ts">
/**
 * The touchline (Phase 7): a live match in the engine worker, watched through MatchView in
 * director / tactical / coach mode, with the coach's tools — tactics knobs, PC designer,
 * rotation bar, slot swaps — every one a tick-stamped CoachInstruction into the AI. Quarter
 * breaks auto-pause for a briefing. Nothing here simulates; the log grows from the worker.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { FRAME_PLAYER_STRIDE, quarterStats, type CoachInstruction, type Frame, type MatchEvent, type MatchLog, type PcVariant, type QuarterStats, type TeamTactics } from '@bullyoff/engine';
import { createMatchView, type HudState, type MatchView, type ViewMode } from '@bullyoff/render';
import { EngineClient } from '../engine/client';
import type { Coaching } from '../stores/season';

const props = defineProps<{ coaching: Coaching }>();
const emit = defineEmits<{ finished: [log: MatchLog]; abandon: [] }>();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement | null>(null);
const view = shallowRef<MatchView | null>(null);
const client = new EngineClient();
const log = shallowRef<MatchLog | null>(null);
const engineTick = ref(0);         // the worker's clock (ahead of the play head by a small buffer)
const playTick = ref(0);
const hud = ref<HudState>({ score: [0, 0], quarter: 1, clockSeconds: 0, phase: 'pre-match', lastEvent: '' });
const mode = ref<ViewMode>('coach');
const speed = ref(1);
const playing = ref(false);
const ended = ref(false);
const error = ref('');
const briefing = ref<QuarterStats | null>(null);
const tactics = reactive<TeamTactics>({ ...props.coaching.tactics[props.coaching.coachTeam] });
const me = props.coaching.coachTeam;
const stamina = ref<Record<number, number>>({});
const onPitch = ref<Record<number, boolean>>({});
const log$ = ref<string[]>([]);
const subOut = ref<number | null>(null);
const subIn = ref<number | null>(null);
const swapA = ref<number | null>(null);
const swapB = ref<number | null>(null);
const BUFFER = 50; // ticks the worker runs ahead of the play head (2.5 s of match time)

const mine = computed(() => props.coaching.setup.players.filter((p) => p.team === me));
const myOn = computed(() => mine.value.filter((p) => onPitch.value[p.id] ?? (p.onPitch ?? true)));
const myBench = computed(() => mine.value.filter((p) => !(onPitch.value[p.id] ?? (p.onPitch ?? true))));
const myOutfield = computed(() => myOn.value.filter((p) => !p.isGoalkeeper));
const nameOf = (id: number): string => props.coaching.names[id]?.name ?? `#${id}`;
const roleOf = (id: number): string => props.coaching.names[id]?.role ?? '';
const staminaOf = (id: number): number => stamina.value[id] ?? 1;
const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (x: number): string => `${Math.round(x * 100)} %`;

let pumping = false;
let destroyed = false;

async function start(): Promise<void> {
  try {
    const { header, events } = await client.initAi(props.coaching.setup, props.coaching.seed, props.coaching.tactics);
    const l: MatchLog = { header, events: [...events], frames: [] };
    log.value = l;
    // first chunk so the view has frames to draw
    await pump(l, BUFFER);
    if (!canvas.value || destroyed) return;
    const v = await createMatchView(canvas.value, l, { mode: mode.value, live: true, coachTeam: me, autoPauseOn: ['QuarterEnd'], homeColour: props.coaching.colours[0], awayColour: props.coaching.colours[1] });
    v.onFrame((t, h) => { playTick.value = t; hud.value = h; playing.value = v.playing; if (!v.playing && !briefing.value && h.phase === 'break') openBriefing(); });
    view.value = v;
    v.setSpeed(speed.value);
    v.play();
    tickLoop();
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}

async function pump(l: MatchLog, ticks: number): Promise<void> {
  if (pumping || ended.value) return;
  pumping = true;
  try {
    const r = await client.advance(ticks);
    if (view.value) view.value.append(r.events, r.frames); else { l.events.push(...r.events); l.frames.push(...r.frames); }
    engineTick.value = r.toTick;
    absorb(r.events, r.frames);
    if (r.events.some((e) => e.t === 'MatchEnd')) { ended.value = true; }
  } finally { pumping = false; }
}

function absorb(events: readonly MatchEvent[], frames: readonly Frame[]): void {
  const last = frames[frames.length - 1];
  const l = log.value;
  if (last && l) {
    const st: Record<number, number> = { ...stamina.value };
    l.header.playerIds.forEach((id, i) => { st[id] = last.players[i * FRAME_PLAYER_STRIDE + 6] ?? 1; });
    stamina.value = st;
  }
  for (const e of events) {
    if (e.t === 'Substitution') { onPitch.value = { ...onPitch.value, [e.outId]: false, [e.inId]: true }; if (e.team === me) note(t('coach.noteSub', { out: nameOf(e.outId), in: nameOf(e.inId) })); }
    else if (e.t === 'Goal') note(t(e.team === me ? 'coach.noteGoalUs' : 'coach.noteGoalThem', { a: e.score[0], b: e.score[1] }));
    else if (e.t === 'PenaltyCornerAwarded') note(t(e.team === me ? 'coach.notePcUs' : 'coach.notePcThem'));
    else if (e.t === 'Card') note(t('coach.noteCard', { colour: e.colour, name: nameOf(e.playerId) }));
  }
}
function note(s: string): void { log$.value = [`${fmt(hud.value.clockSeconds)} ${s}`, ...log$.value].slice(0, 12); }

function tickLoop(): void {
  if (destroyed) return;
  const v = view.value, l = log.value;
  if (v && l && !ended.value && v.lag < BUFFER && v.playing) void pump(l, BUFFER);
  if (ended.value && v && v.lag <= 0 && l) { finish(l); return; }
  setTimeout(tickLoop, 80);
}

function openBriefing(): void {
  const l = log.value; if (!l) return;
  const qs = quarterStats(l);
  briefing.value = qs[qs.length - 1] ?? null;
}
function resume(): void { briefing.value = null; view.value?.play(); }

async function send(ins: CoachInstruction[]): Promise<void> {
  try {
    const t = await client.instruct(ins.map((i) => ({ ...i, tick: engineTick.value + 1 })));
    Object.assign(tactics, t[me]);
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
function setTactic(k: 'pressHeight' | 'defensiveLine' | 'tempo' | 'rotateBelowStamina' | 'buildUp' | 'pcVariant', val: number | string): void {
  const patch: Partial<TeamTactics> = k === 'buildUp' ? { buildUp: val as TeamTactics['buildUp'] } : k === 'pcVariant' ? { pcVariant: val as PcVariant } : { [k]: Number(val) };
  Object.assign(tactics, patch);
  void send([{ tick: 0, team: me, kind: 'tactics', patch }]);
  note(t('coach.noteTactic', { k: t('coach.' + (k === 'rotateBelowStamina' ? 'rotateBelow' : k)), v: typeof val === 'number' ? pct(val) : val }));
}
function setBattery(role: 'injector' | 'trapper' | 'striker', id: number | null): void {
  const b: NonNullable<TeamTactics['pcBattery']> = {};
  for (const r of ['injector', 'trapper', 'striker'] as const) { const cur = r === role ? id : (tactics.pcBattery?.[r] ?? null); if (cur !== null) b[r] = cur; }
  tactics.pcBattery = b;
  void send([{ tick: 0, team: me, kind: 'tactics', patch: { pcBattery: b } }]);
}
function substitute(): void {
  if (subOut.value === null || subIn.value === null) return;
  void send([{ tick: 0, team: me, kind: 'substitute', outId: subOut.value, inId: subIn.value }]);
  note(t('coach.noteSubReq', { out: nameOf(subOut.value), in: nameOf(subIn.value) }));
  subOut.value = null; subIn.value = null;
}
function swap(): void {
  if (swapA.value === null || swapB.value === null || swapA.value === swapB.value) return;
  void send([{ tick: 0, team: me, kind: 'swapSlots', a: swapA.value, b: swapB.value }]);
  note(t('coach.noteSwap', { a: nameOf(swapA.value), b: nameOf(swapB.value) }));
}
function setMode(m: ViewMode): void { mode.value = m; view.value?.setMode(m); }
function setSpeed(x: number): void { speed.value = x; view.value?.setSpeed(x); }
let finished = false;
function finish(l: MatchLog): void { if (finished) return; finished = true; emit('finished', l); }
async function skipToEnd(): Promise<void> {
  // run the engine to full time in the worker and hand the log over (no more coaching)
  const l = log.value; if (!l) return;
  view.value?.pause();
  try { while (!ended.value) { await pump(l, 2000); } } catch (e) { error.value = e instanceof Error ? e.message : String(e); return; }
  finish(l);
}

onMounted(() => { void start(); });
onBeforeUnmount(() => { destroyed = true; view.value?.destroy(); client.destroy(); });
</script>

<template>
  <div class="coach">
    <div class="stage-col">
      <header class="bar">
        <strong>{{ coaching.title }}</strong>
        <span class="score">{{ hud.score[0] }} – {{ hud.score[1] }}</span>
        <span class="muted">{{ hud.phase }} {{ fmt(hud.clockSeconds) }} · {{ hud.lastEvent }}</span>
        <span class="grow" />
        <span
          v-if="error"
          class="err"
        >{{ error }}</span>
        <button
          class="btn small"
          :disabled="ended"
          @click="view?.toggle()"
        >
          {{ playing ? t('coach.pause') : t('coach.play') }}
        </button>
        <button
          v-for="x in [1, 2, 4]"
          :key="x"
          class="btn small"
          :class="{ active: speed === x }"
          @click="setSpeed(x)"
        >
          {{ x }}×
        </button>
        <button
          v-for="m in (['director', 'tactical', 'coach'] as const)"
          :key="m"
          class="btn small"
          :class="{ active: mode === m }"
          @click="setMode(m)"
        >
          {{ t('viewer.' + m) }}
        </button>
        <button
          class="btn small"
          :disabled="ended"
          @click="skipToEnd"
        >
          {{ t('coach.simToFullTime') }}
        </button>
        <button
          class="btn small"
          @click="emit('abandon')"
        >
          {{ t('coach.leave') }}
        </button>
      </header>
      <div class="stage">
        <canvas
          ref="canvas"
          class="canvas"
        />
        <div
          v-if="briefing"
          class="briefing"
        >
          <h3>{{ t('coach.briefing', { q: briefing.quarter }) }}</h3>
          <table class="grid">
            <thead><tr><th /><th>{{ me === 0 ? t('coach.us') : t('coach.them') }}</th><th>{{ me === 0 ? t('coach.them') : t('coach.us') }}</th></tr></thead>
            <tbody>
              <tr><td>{{ t('coach.goals') }}</td><td>{{ briefing.goals[0] }}</td><td>{{ briefing.goals[1] }}</td></tr>
              <tr><td>{{ t('coach.shots') }}</td><td>{{ briefing.shots[0] }}</td><td>{{ briefing.shots[1] }}</td></tr>
              <tr><td>{{ t('coach.circleEntries') }}</td><td>{{ briefing.circleEntries[0] }}</td><td>{{ briefing.circleEntries[1] }}</td></tr>
              <tr><td>{{ t('coach.pcs') }}</td><td>{{ briefing.pcAwarded[0] }}</td><td>{{ briefing.pcAwarded[1] }}</td></tr>
              <tr><td>{{ t('coach.possession') }}</td><td>{{ pct(briefing.possession[0]) }}</td><td>{{ pct(briefing.possession[1]) }}</td></tr>
              <tr><td>{{ t('coach.tackles') }}</td><td>{{ briefing.tackles[0] }}</td><td>{{ briefing.tackles[1] }}</td></tr>
            </tbody>
          </table>
          <p class="muted small">
            {{ t('coach.briefingHint', { names: myOn.filter((p) => staminaOf(p.id) < 0.6).map((p) => nameOf(p.id)).join(', ') || t('coach.nobody') }) }}
          </p>
          <button
            class="btn primary"
            @click="resume"
          >
            {{ t('coach.resume') }}
          </button>
        </div>
        <div
          v-if="ended"
          class="briefing"
        >
          <h3>{{ t('coach.fullTime', { a: hud.score[0], b: hud.score[1] }) }}</h3>
          <p class="muted small">
            {{ t('coach.recording') }}
          </p>
        </div>
      </div>
      <ul class="ticker">
        <li
          v-for="(s, i) in log$"
          :key="i"
        >
          {{ s }}
        </li>
      </ul>
    </div>

    <aside class="tools">
      <section class="panel">
        <h3>{{ t('coach.tactics') }}</h3>
        <label>{{ t('coach.pressHeight') }} <span class="val">{{ pct(tactics.pressHeight) }}</span><input
          type="range"
          min="0.1"
          max="0.95"
          step="0.05"
          :value="tactics.pressHeight"
          @change="setTactic('pressHeight', Number(($event.target as HTMLInputElement).value))"
        ></label>
        <label>{{ t('coach.defensiveLine') }} <span class="val">{{ pct(tactics.defensiveLine) }}</span><input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          :value="tactics.defensiveLine"
          @change="setTactic('defensiveLine', Number(($event.target as HTMLInputElement).value))"
        ></label>
        <label>{{ t('coach.tempo') }} <span class="val">{{ pct(tactics.tempo) }}</span><input
          type="range"
          min="0.1"
          max="0.9"
          step="0.05"
          :value="tactics.tempo"
          @change="setTactic('tempo', Number(($event.target as HTMLInputElement).value))"
        ></label>
        <label>{{ t('coach.buildUp') }} <select
          :value="tactics.buildUp"
          @change="setTactic('buildUp', ($event.target as HTMLSelectElement).value as TeamTactics['buildUp'])"
        >
          <option value="possession">{{ t('coach.possessionStyle') }}</option><option value="direct">{{ t('coach.direct') }}</option><option value="wide">{{ t('coach.wide') }}</option>
        </select></label>
        <label>{{ t('coach.rotateBelow') }} <span class="val">{{ pct(tactics.rotateBelowStamina) }}</span><input
          type="range"
          min="0.3"
          max="0.9"
          step="0.05"
          :value="tactics.rotateBelowStamina"
          @change="setTactic('rotateBelowStamina', Number(($event.target as HTMLInputElement).value))"
        ></label>
      </section>

      <section class="panel">
        <h3>{{ t('coach.pcDesigner') }}</h3>
        <label>{{ t('coach.variant') }} <select
          :value="tactics.pcVariant"
          @change="setTactic('pcVariant', ($event.target as HTMLSelectElement).value as PcVariant)"
        >
          <option
            v-for="v in ['dragFlick', 'lowHit', 'slipRight', 'slipLeft', 'deflection']"
            :key="v"
            :value="v"
          >
            {{ v }}
          </option>
        </select></label>
        <label
          v-for="r in (['injector', 'trapper', 'striker'] as const)"
          :key="r"
        >{{ t('coach.' + r) }} <select
          :value="tactics.pcBattery?.[r] ?? ''"
          @change="setBattery(r, ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))"
        >
          <option value="">
            {{ t('coach.aiPicks') }}
          </option>
          <option
            v-for="p in myOutfield"
            :key="p.id"
            :value="p.id"
          >
            {{ nameOf(p.id) }} ({{ roleOf(p.id) }})
          </option>
        </select></label>
      </section>

      <section class="panel">
        <h3>{{ t('coach.rotation') }}</h3>
        <ul class="roster">
          <li
            v-for="p in myOn"
            :key="p.id"
            :class="{ sel: subOut === p.id }"
            @click="subOut = p.isGoalkeeper ? subOut : p.id"
          >
            <span class="nm">{{ nameOf(p.id) }} <em>{{ roleOf(p.id) }}</em></span>
            <span
              class="stam"
              :style="{ '--w': staminaOf(p.id) * 100 + '%', '--c': staminaOf(p.id) > 0.6 ? '#2ecc71' : staminaOf(p.id) > 0.35 ? '#f1c40f' : '#e74c3c' }"
            />
          </li>
        </ul>
        <p class="muted small">
          {{ t('coach.bench') }}
        </p>
        <ul class="roster bench">
          <li
            v-for="p in myBench"
            :key="p.id"
            :class="{ sel: subIn === p.id }"
            @click="subIn = p.id"
          >
            <span class="nm">{{ nameOf(p.id) }} <em>{{ roleOf(p.id) }}</em></span>
            <span
              class="stam"
              :style="{ '--w': staminaOf(p.id) * 100 + '%', '--c': '#2ecc71' }"
            />
          </li>
        </ul>
        <button
          class="btn primary"
          :disabled="subOut === null || subIn === null"
          @click="substitute"
        >
          {{ t('coach.substitute', { out: subOut !== null ? nameOf(subOut) : '…', in: subIn !== null ? nameOf(subIn) : '…' }) }}
        </button>
        <div class="swap">
          <select v-model="swapA">
            <option :value="null">
              {{ t('coach.swapWith') }}
            </option>
            <option
              v-for="p in myOutfield"
              :key="p.id"
              :value="p.id"
            >
              {{ nameOf(p.id) }}
            </option>
          </select>
          <select v-model="swapB">
            <option :value="null">
              {{ t('coach.with') }}
            </option>
            <option
              v-for="p in myOutfield"
              :key="p.id"
              :value="p.id"
            >
              {{ nameOf(p.id) }}
            </option>
          </select>
          <button
            class="btn small"
            @click="swap"
          >
            {{ t('coach.swapPositions') }}
          </button>
        </div>
      </section>
    </aside>
  </div>
</template>

<style scoped>
.coach { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: var(--space-3); height: 100%; min-height: 0; }
.stage-col { display: grid; grid-template-rows: auto minmax(0, 1fr) auto; gap: var(--space-2); min-height: 0; }
.bar { display: flex; gap: var(--space-2); align-items: center; flex-wrap: wrap; }
.score { font-weight: 900; font-size: var(--text-lg); }
.grow { flex: 1; }
.stage { position: relative; min-height: 360px; background: #0e1116; border-radius: var(--radius-md); overflow: hidden; }
.canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.briefing { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(10, 14, 18, 0.94); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-3); min-width: 320px; display: flex; flex-direction: column; gap: var(--space-2); }
.ticker { list-style: none; margin: 0; padding: 0; font-size: var(--text-xs); color: var(--color-fg-muted); display: flex; gap: var(--space-3); flex-wrap: wrap; max-height: 3.6em; overflow: hidden; }
.tools { display: flex; flex-direction: column; gap: var(--space-2); overflow: auto; min-height: 0; }
.panel { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-2); display: flex; flex-direction: column; gap: 6px; }
.panel h3 { margin: 0 0 4px; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-fg-muted); }
.panel label { display: grid; grid-template-columns: 1fr auto; gap: 2px 8px; font-size: var(--text-sm); align-items: center; }
.panel label input[type='range'], .panel label select { grid-column: 1 / -1; }
.val { font-family: var(--font-mono); color: var(--color-fg-muted); }
.btn { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 6px 10px; cursor: pointer; font: inherit; }
.btn.primary { background: var(--color-turf-700); border-color: var(--color-turf-500); color: #fff; font-weight: 700; }
.btn.small { padding: 3px 8px; font-size: var(--text-sm); }
.btn.active { border-color: var(--color-turf-500); color: var(--color-turf-100); }
.btn:disabled { opacity: 0.5; cursor: default; }
.roster { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 2px; }
.roster li { display: grid; grid-template-columns: 1fr 70px; gap: 8px; align-items: center; font-size: var(--text-sm); padding: 2px 6px; border-radius: var(--radius-sm); cursor: pointer; }
.roster li:hover { background: var(--color-bg); }
.roster li.sel { outline: 1px solid var(--color-turf-500); }
.roster em { color: var(--color-fg-muted); font-style: normal; font-size: var(--text-xs); }
.stam { display: block; height: 6px; background: rgba(0, 0, 0, 0.4); border-radius: 3px; position: relative; }
.stam::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: var(--w); background: var(--c); border-radius: 3px; }
.swap { display: grid; grid-template-columns: 1fr 1fr; gap: 4px; }
.swap .btn { grid-column: 1 / -1; }
.muted { color: var(--color-fg-muted); }
.small { font-size: var(--text-xs); }
.err { color: var(--color-card-red); font-size: var(--text-sm); }
.grid { border-collapse: collapse; font-size: var(--text-sm); }
.grid th, .grid td { padding: 2px 10px; text-align: right; border-bottom: 1px solid var(--color-border); }
.grid td:first-child { text-align: left; color: var(--color-fg-muted); }
</style>
