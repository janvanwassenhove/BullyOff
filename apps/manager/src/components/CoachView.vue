<script setup lang="ts">
/**
 * The touchline — instrument panel (design direction 1b). Rows 52 / pitch / 118; left rail SHAPE +
 * four dials; centre pitch (channels overlay, camera chips); right rail LIVE; bottom MATCH LOG +
 * DECISION · 8s. The match lives in the engine worker; every coach action is a tick-stamped
 * CoachInstruction into the AI; the worker runs a small buffer ahead so the bench stays responsive.
 * A timed decision that runs out leaves the AI's own choice standing — the log stays deterministic.
 */
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef } from 'vue';
import { useI18n } from 'vue-i18n';
import { FRAME_PLAYER_STRIDE, MENTALITY_LINE, PRESS_HEIGHT, quarterStats, type CoachInstruction, type FormationId, type Frame, type MatchEvent, type MatchLog, type Mentality, type PcVariant, type PressId, type QuarterStats, type TeamTactics } from '@bullyoff/engine';
import { analyse, type Finding } from '@bullyoff/insight';
import { createMatchView, type CameraChoice, type HudState, type MatchView, type OverlayId } from '@bullyoff/render';
import { inCircle } from '@bullyoff/shared';
import { EngineClient } from '../engine/client';
import type { Coaching } from '../stores/season';
import { clockOf, eventLine, LOGGED } from '../lib/eventText';

const props = defineProps<{ coaching: Coaching }>();
const emit = defineEmits<{ finished: [log: MatchLog, instructions: CoachInstruction[]]; abandon: [] }>();
const { t } = useI18n();

const canvas = ref<HTMLCanvasElement | null>(null);
const view = shallowRef<MatchView | null>(null);
const client = new EngineClient();
const log = shallowRef<MatchLog | null>(null);
const engineTick = ref(0);
const playTick = ref(0);
const hud = ref<HudState>({ score: [0, 0], quarter: 1, clockSeconds: 0, phase: 'pre-match', lastEvent: '' });
const camera = ref<CameraChoice>('full');
const overlay = ref<OverlayId>('channels');
const speed = ref(1);
const playing = ref(false);
const ended = ref(false);
const error = ref('');
const briefing = ref<QuarterStats | null>(null);
const tactics = reactive<TeamTactics>({ ...props.coaching.tactics[props.coaching.coachTeam] });
const me = props.coaching.coachTeam;
const them: 0 | 1 = me === 0 ? 1 : 0;
const stamina = ref<Record<number, number>>({});
const onPitch = ref<Record<number, boolean>>({});
const lines = ref<{ tick: number; text: string; colour: string }[]>([]);
const sent = ref<CoachInstruction[]>([]);
const drawer = ref(false);
const subOut = ref<number | null>(null);
const subIn = ref<number | null>(null);
const decision = ref<{ key: 'pc' | 'read'; until: number; finding?: Finding } | null>(null);
const decisionLeft = ref(0);
const BUFFER = 50;
const CAMS: CameraChoice[] = ['full', 'broadcast', 'circle', 'director'];
const FORMATION_IDS: FormationId[] = ['4-3-3', '3-4-3', '4-4-2', '5-3-2', '3-3-3-1', '4-2-3-1'];
const PRESS_IDS: PressId[] = ['full', 'half', 'split', 'zone'];
const MENTALITIES: Mentality[] = ['defensive', 'balanced', 'attacking'];
const PCS: PcVariant[] = ['dragFlick', 'lowHit', 'slipRight', 'slipLeft', 'deflection'];
const tempoWord = (x: number): 'low' | 'normal' | 'high' => (x < 0.4 ? 'low' : x > 0.65 ? 'high' : 'normal');
const TEMPO = { low: 0.25, normal: 0.5, high: 0.8 } as const;

const mine = computed(() => props.coaching.setup.players.filter((p) => p.team === me));
const myOn = computed(() => mine.value.filter((p) => onPitch.value[p.id] ?? (p.onPitch ?? true)));
const myBench = computed(() => mine.value.filter((p) => !(onPitch.value[p.id] ?? (p.onPitch ?? true))));
const myOutfield = computed(() => myOn.value.filter((p) => !p.isGoalkeeper));
const nameOf = (id: number): string => props.coaching.names[id]?.name ?? `#${id}`;
const roleOf = (id: number): string => props.coaching.names[id]?.role ?? '';
const staminaOf = (id: number): number => stamina.value[id] ?? 1;
const names = computed<Record<number, string>>(() => { const o: Record<number, string> = {}; for (const [k, v] of Object.entries(props.coaching.names)) o[Number(k)] = v.name; return o; });
const fmt = (s: number): string => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const pct = (x: number): string => `${Math.round(x * 100)} %`;
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const progress = computed(() => Math.min(100, (100 * hud.value.clockSeconds) / (60 * 60)));
const dials = computed(() => [
  { k: 'press', v: t('coach.pressShort.' + tactics.press), w: tactics.pressHeight },
  { k: 'mentality', v: t('coach.mentalityShort.' + tactics.mentality), w: tactics.defensiveLine },
  { k: 'tempo', v: t('coach.tempoShort.' + tempoWord(tactics.tempo)), w: tactics.tempo },
  { k: 'rotate', v: pct(tactics.rotateBelowStamina), w: tactics.rotateBelowStamina },
]);

let pumping = false, destroyed = false, finished = false, lastRead = 0;

async function start(): Promise<void> {
  try {
    const { header, events } = await client.initAi(props.coaching.setup, props.coaching.seed, props.coaching.tactics);
    const l: MatchLog = { header, events: [...events], frames: [] };
    log.value = l;
    await pump(l, BUFFER);
    if (!canvas.value || destroyed) return;
    const v = await createMatchView(canvas.value, l, { mode: 'coach', camera: camera.value, overlay: overlay.value, live: true, coachTeam: me, autoPauseOn: ['QuarterEnd'], homeColour: props.coaching.colours[0], awayColour: props.coaching.colours[1] });
    v.onFrame((tk, h) => { playTick.value = tk; hud.value = h; playing.value = v.playing; if (!v.playing && !briefing.value && h.phase === 'break') openBriefing(); });
    view.value = v; v.setSpeed(speed.value); v.play();
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
    if (r.events.some((e) => e.t === 'MatchEnd')) ended.value = true;
  } finally { pumping = false; }
}
function absorb(events: readonly MatchEvent[], frames: readonly Frame[]): void {
  const last = frames[frames.length - 1]; const l = log.value;
  if (last && l) { const st: Record<number, number> = { ...stamina.value }; l.header.playerIds.forEach((id, i) => { st[id] = last.players[i * FRAME_PLAYER_STRIDE + 6] ?? 1; }); stamina.value = st; }
  for (const e of events) {
    if (e.t === 'Substitution') onPitch.value = { ...onPitch.value, [e.outId]: false, [e.inId]: true };
    if (LOGGED.includes(e.t)) { const ln = eventLine(e, t, props.coaching.shorts, names.value); if (ln) lines.value = [{ tick: e.tick, ...ln }, ...lines.value].slice(0, 40); }
    if (e.t === 'PenaltyCornerAwarded' && e.team === me) decision.value = { key: 'pc', until: performance.now() + 8000 };
  }
}
function tickLoop(): void {
  if (destroyed) return;
  const v = view.value, l = log.value;
  if (v && l && !ended.value && v.lag < BUFFER && v.playing) void pump(l, BUFFER);
  if (ended.value && v && v.lag <= 0 && l) { finish(l); return; }
  if (decision.value) { decisionLeft.value = Math.max(0, Math.ceil((decision.value.until - performance.now()) / 1000)); if (decisionLeft.value === 0) decision.value = null; }
  // the coach read every ~6 s of wall time from the log so far
  if (l && performance.now() - lastRead > 6000) { lastRead = performance.now(); const f = analyse(l, sent.value, me, { upToTick: engineTick.value, names: names.value }).find((x) => x.section === 'coachRead'); if (f && !decision.value) decision.value = { key: 'read', until: performance.now() + 12000, finding: f }; }
  setTimeout(tickLoop, 80);
}
function openBriefing(): void { const l = log.value; if (!l) return; const qs = quarterStats(l); briefing.value = qs[qs.length - 1] ?? null; }
function resume(): void { briefing.value = null; view.value?.play(); }
async function send(ins: CoachInstruction[]): Promise<void> {
  try {
    const stamped = ins.map((i) => ({ ...i, tick: engineTick.value + 1 }));
    const tac = await client.instruct(stamped);
    sent.value = [...sent.value, ...stamped];
    Object.assign(tactics, tac[me]);
  } catch (e) { error.value = e instanceof Error ? e.message : String(e); }
}
function setTactic(k: 'formation' | 'press' | 'mentality' | 'tempo' | 'rotateBelowStamina' | 'buildUp' | 'pcVariant', val: number | string): void {
  const patch: Partial<TeamTactics> =
    k === 'buildUp' ? { buildUp: val as TeamTactics['buildUp'] }
      : k === 'pcVariant' ? { pcVariant: val as PcVariant }
        : k === 'formation' ? { formation: val as FormationId }
          : k === 'press' ? { press: val as PressId, pressHeight: PRESS_HEIGHT[val as PressId] }
            : k === 'mentality' ? { mentality: val as Mentality, defensiveLine: MENTALITY_LINE[val as Mentality] }
              : k === 'tempo' ? { tempo: TEMPO[val as keyof typeof TEMPO] }
                : { rotateBelowStamina: Number(val) };
  Object.assign(tactics, patch);
  void send([{ tick: 0, team: me, kind: 'tactics', patch }]);
  const shown = k === 'rotateBelowStamina' ? pct(Number(val)) : k === 'formation' ? String(val) : t(`coach.${k}.${String(val)}`);
  note(t('coach.noteTactic', { k: t('coach.' + (k === 'rotateBelowStamina' ? 'rotateBelow' : k + 'Label')), v: shown }));
}
function cycle(k: 'press' | 'mentality' | 'tempo' | 'rotate'): void {
  if (k === 'press') setTactic('press', PRESS_IDS[(PRESS_IDS.indexOf(tactics.press) + 1) % PRESS_IDS.length] ?? 'half');
  else if (k === 'mentality') setTactic('mentality', MENTALITIES[(MENTALITIES.indexOf(tactics.mentality) + 1) % 3] ?? 'balanced');
  else if (k === 'tempo') { const w = tempoWord(tactics.tempo); setTactic('tempo', w === 'low' ? 'normal' : w === 'normal' ? 'high' : 'low'); }
  else { const r = tactics.rotateBelowStamina; setTactic('rotateBelowStamina', r >= 0.75 ? 0.45 : Math.round((r + 0.1) * 100) / 100); }
}
function decide(v: PcVariant): void { setTactic('pcVariant', v); decision.value = null; }
function setBattery(role: 'injector' | 'trapper' | 'striker', id: number | null): void {
  const b: NonNullable<TeamTactics['pcBattery']> = {};
  for (const r of ['injector', 'trapper', 'striker'] as const) { const cur = r === role ? id : (tactics.pcBattery?.[r] ?? null); if (cur !== null) b[r] = cur; }
  tactics.pcBattery = b; void send([{ tick: 0, team: me, kind: 'tactics', patch: { pcBattery: b } }]);
}
function substitute(): void {
  if (subOut.value === null || subIn.value === null) return;
  void send([{ tick: 0, team: me, kind: 'substitute', outId: subOut.value, inId: subIn.value }]);
  note(t('coach.noteSubReq', { out: nameOf(subOut.value), in: nameOf(subIn.value) }));
  subOut.value = null; subIn.value = null;
}
function rotateTired(): void {
  const tired = [...myOutfield.value].sort((a, b) => staminaOf(a.id) - staminaOf(b.id)).slice(0, 3);
  const fresh = [...myBench.value].filter((p) => !p.isGoalkeeper).sort((a, b) => staminaOf(b.id) - staminaOf(a.id));
  const ins: CoachInstruction[] = [];
  tired.forEach((out, i) => { const inn = fresh[i]; if (inn && staminaOf(out.id) < 0.7) ins.push({ tick: 0, team: me, kind: 'substitute', outId: out.id, inId: inn.id }); });
  if (ins.length) { void send(ins); note(t('coach.rotate', { n: ins.length })); }
}
function note(s: string): void { lines.value = [{ tick: engineTick.value, text: s, colour: 'var(--signal)' }, ...lines.value].slice(0, 40); }
function setSpeed(x: number): void { speed.value = x; view.value?.setSpeed(x); }
function setCamera(c: CameraChoice): void { camera.value = c; view.value?.setCamera(c); }
function setOverlay(o: OverlayId): void { overlay.value = o; view.value?.setOverlay(o); }
function finish(l: MatchLog): void { if (finished) return; finished = true; emit('finished', l, sent.value); }
async function skipToEnd(): Promise<void> {
  const l = log.value; if (!l) return; view.value?.pause();
  try { while (!ended.value) await pump(l, 2000); } catch (e) { error.value = e instanceof Error ? e.message : String(e); return; }
  finish(l);
}
const liveStats = computed(() => {
  const l = log.value; if (!l) return [];
  const teamOf = new Map<number, number>(l.header.playerIds.map((id, i) => [id, l.header.teams[i] ?? 0]));
  const ev = l.events;
  const cnt = (pred: (e: MatchEvent) => boolean): number => ev.filter(pred).length;
  const touches = [cnt((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === me), cnt((e) => (e.t === 'BallStruck' || e.t === 'BallTrapped') && e.team === them)];
  const poss = Math.round((100 * (touches[0] ?? 0)) / Math.max(1, (touches[0] ?? 0) + (touches[1] ?? 0)));
  const entries = (tm: number): number => cnt((e) => e.t === 'CircleEntry' && e.lastTouch !== null && teamOf.get(e.lastTouch) === tm && (e.end === 1 ? 0 : 1) === tm);
  const shots = (tm: number): number => cnt((e) => e.t === 'BallStruck' && e.team === tm && e.x !== undefined && e.y !== undefined && inCircle({ x: e.x, y: e.y }, tm === 0 ? 1 : -1) && !(e.kind === 'push' && e.speed < 5));
  return [
    { k: 'possession', v: `${poss} %` }, { k: 'circleEntries', v: `${entries(me)} – ${entries(them)}` }, { k: 'shots', v: `${shots(me)} – ${shots(them)}` },
    { k: 'pcs', v: `${cnt((e) => e.t === 'PenaltyCornerAwarded' && e.team === me)} – ${cnt((e) => e.t === 'PenaltyCornerAwarded' && e.team === them)}` },
    { k: 'tacklesWon', v: `${cnt((e) => e.t === 'Tackle' && e.tacklerTeam === me && e.outcome === 'won')} – ${cnt((e) => e.t === 'Tackle' && e.tacklerTeam === them && e.outcome === 'won')}` },
  ];
});
const theirStyle = computed(() => t(props.coaching.tactics[them].mentality === 'defensive' ? 'coach.pcLow' : 'coach.pcHigh'));
onMounted(() => { void start(); });
onBeforeUnmount(() => { destroyed = true; view.value?.destroy(); client.destroy(); });
</script>

<template>
  <section class="touchline">
    <header class="top">
      <span
        class="kit"
        :style="{ background: hex(coaching.colours[0]) }"
      />
      <span
        class="tn"
        :class="{ mine: me === 0 }"
      >{{ coaching.clubNames[0].toUpperCase() }}</span>
      <span class="score">{{ hud.score[0] }} · {{ hud.score[1] }}</span>
      <span
        class="tn muted"
        :class="{ mine: me === 1 }"
      >{{ coaching.clubNames[1].toUpperCase() }}</span>
      <span
        class="kit"
        :style="{ background: hex(coaching.colours[1]) }"
      />
      <span class="you mono"><span
        class="kit small"
        :style="{ background: hex(coaching.colours[me]) }"
      />{{ t('coach.youAre') }}</span>
      <span class="grow" />
      <span
        v-if="error"
        class="err mono"
      >{{ error }}</span>
      <span class="mono q">{{ hud.phase.toUpperCase() }}</span>
      <span class="mono clock">{{ fmt(hud.clockSeconds) }}</span>
      <span class="prog"><i :style="{ width: progress + '%' }" /></span>
      <button
        class="tbtn mono"
        :disabled="ended"
        @click="view?.toggle()"
      >
        {{ playing ? t('coach.pause') : t('coach.play') }}
      </button>
      <button
        v-for="x in [1, 2, 4]"
        :key="x"
        class="chip chip-11 cbtn"
        :class="{ 'chip-on': speed === x }"
        @click="setSpeed(x)"
      >
        {{ x }}×
      </button>
      <button
        class="chip chip-11 cbtn"
        :disabled="ended"
        @click="skipToEnd"
      >
        {{ t('coach.simToFullTime') }}
      </button>
      <button
        class="chip chip-11 cbtn"
        @click="emit('abandon')"
      >
        {{ t('coach.leave') }}
      </button>
    </header>

    <div class="mid">
      <aside class="rail left">
        <span class="eyebrow">{{ t('coach.shape') }}</span>
        <button
          class="shape display-700"
          @click="drawer = !drawer"
        >
          {{ tactics.formation }}
        </button>
        <button
          v-for="d in dials"
          :key="d.k"
          class="dial"
          @click="cycle(d.k as 'press' | 'mentality' | 'tempo' | 'rotate')"
        >
          <span class="dh"><span>{{ t('coach.dials.' + d.k) }}</span><span class="mono val">{{ d.v }}</span></span>
          <span class="bar bar-3"><i :style="{ width: d.w * 100 + '%' }" /></span>
        </button>
        <span class="grow" />
        <button
          class="btn btn-secondary btn-xs"
          @click="drawer = !drawer"
        >
          {{ t('coach.tactics') }}
        </button>
        <button
          class="btn btn-pale btn-xs"
          :disabled="!myBench.length"
          @click="rotateTired"
        >
          {{ t('coach.rotate', { n: 3 }) }}
        </button>
      </aside>

      <div class="stage">
        <canvas
          ref="canvas"
          class="canvas"
        />
        <span class="ovl-label mono">{{ t('sim.overlays.' + overlay) }} · {{ t('coach.press.' + tactics.press).toUpperCase() }}</span>
        <div class="ovl-tr">
          <button
            v-for="c in CAMS"
            :key="c"
            class="chip chip-mode"
            :class="{ on: camera === c }"
            @click="setCamera(c)"
          >
            {{ t('sim.cams.' + c) }}
          </button>
          <button
            v-for="o in (['none', 'press', 'channels'] as const)"
            :key="o"
            class="chip chip-mode"
            :class="{ on: overlay === o }"
            @click="setOverlay(o)"
          >
            {{ t('sim.overlays.' + o) }}
          </button>
        </div>

        <div
          v-if="briefing"
          class="modal"
        >
          <h3 class="mh">
            {{ t('coach.briefing', { q: briefing.quarter }) }}
          </h3>
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
          <p class="mbody">
            {{ t('coach.briefingHint', { names: myOn.filter((p) => staminaOf(p.id) < 0.6).map((p) => nameOf(p.id)).join(', ') || t('coach.nobody') }) }}
          </p>
          <button
            class="btn btn-primary btn-md"
            @click="resume"
          >
            {{ t('coach.resume') }}
          </button>
        </div>
        <div
          v-if="ended"
          class="modal"
        >
          <h3 class="mh">
            {{ t('coach.fullTime', { a: hud.score[0], b: hud.score[1] }) }}
          </h3>
          <p class="mbody">
            {{ t('coach.recording') }}
          </p>
        </div>

        <div
          v-if="drawer"
          class="drawer"
        >
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.formationLabel').toUpperCase() }}</span>
            <div class="chips">
              <button
                v-for="f in FORMATION_IDS"
                :key="f"
                class="choice"
                :class="{ on: tactics.formation === f }"
                @click="setTactic('formation', f)"
              >
                {{ f }}
              </button>
            </div>
          </div>
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.pressLabel').toUpperCase() }}</span>
            <div class="chips">
              <button
                v-for="p in PRESS_IDS"
                :key="p"
                class="choice"
                :class="{ on: tactics.press === p }"
                @click="setTactic('press', p)"
              >
                {{ t('coach.press.' + p) }}
              </button>
            </div>
          </div>
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.mentalityLabel').toUpperCase() }}</span>
            <div class="chips">
              <button
                v-for="m in MENTALITIES"
                :key="m"
                class="choice"
                :class="{ on: tactics.mentality === m }"
                @click="setTactic('mentality', m)"
              >
                {{ t('coach.mentality.' + m) }}
              </button>
            </div>
          </div>
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.buildUpLabel').toUpperCase() }}</span>
            <div class="chips">
              <button
                v-for="b in (['possession', 'direct', 'wide'] as const)"
                :key="b"
                class="choice"
                :class="{ on: tactics.buildUp === b }"
                @click="setTactic('buildUp', b)"
              >
                {{ t('coach.buildUp.' + b) }}
              </button>
            </div>
          </div>
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.pcDesigner') }}</span>
            <div class="chips">
              <button
                v-for="v in PCS"
                :key="v"
                class="choice"
                :class="{ on: tactics.pcVariant === v }"
                @click="setTactic('pcVariant', v)"
              >
                {{ t('coach.pc.' + v) }}
              </button>
            </div>
            <div class="chips">
              <label
                v-for="r in (['injector', 'trapper', 'striker'] as const)"
                :key="r"
                class="sel"
              >{{ t('coach.' + r) }} <select
                class="ui"
                :value="tactics.pcBattery?.[r] ?? ''"
                @change="setBattery(r, ($event.target as HTMLSelectElement).value === '' ? null : Number(($event.target as HTMLSelectElement).value))"
              >
                <option value="">{{ t('coach.aiPicks') }}</option>
                <option
                  v-for="p in myOutfield"
                  :key="p.id"
                  :value="p.id"
                >{{ nameOf(p.id) }} ({{ roleOf(p.id) }})</option>
              </select></label>
            </div>
          </div>
          <div class="dgroup">
            <span class="eyebrow">{{ t('coach.rotation') }}</span>
            <div class="roster">
              <button
                v-for="p in myOn"
                :key="p.id"
                class="rrow"
                :class="{ sel: subOut === p.id }"
                :disabled="p.isGoalkeeper"
                @click="subOut = p.id"
              >
                <span class="nm">{{ nameOf(p.id) }} <em>{{ roleOf(p.id) }}</em></span>
                <span class="bar"><i :style="{ width: staminaOf(p.id) * 100 + '%', background: staminaOf(p.id) > 0.6 ? 'var(--accent)' : staminaOf(p.id) > 0.35 ? 'var(--signal)' : 'var(--danger)' }" /></span>
              </button>
            </div>
            <span class="eyebrow">{{ t('coach.bench') }}</span>
            <div class="roster">
              <button
                v-for="p in myBench"
                :key="p.id"
                class="rrow"
                :class="{ sel: subIn === p.id }"
                @click="subIn = p.id"
              >
                <span class="nm">{{ nameOf(p.id) }} <em>{{ roleOf(p.id) }}</em></span>
                <span class="bar"><i :style="{ width: staminaOf(p.id) * 100 + '%' }" /></span>
              </button>
            </div>
            <button
              class="btn btn-primary btn-sm"
              :disabled="subOut === null || subIn === null"
              @click="substitute"
            >
              {{ t('coach.substitute', { out: subOut !== null ? nameOf(subOut) : '…', in: subIn !== null ? nameOf(subIn) : '…' }) }}
            </button>
          </div>
          <button
            class="btn btn-secondary btn-sm"
            @click="drawer = false"
          >
            ✕
          </button>
        </div>
      </div>

      <aside class="rail right">
        <span class="eyebrow">{{ t('coach.live') }}</span>
        <div
          v-for="s in liveStats"
          :key="s.k"
          class="lstat"
        >
          <span class="lk">{{ t('coach.stats.' + s.k) }}</span><span class="mono lv">{{ s.v }}</span>
        </div>
        <span class="eyebrow legs">{{ t('coach.legs') }}</span>
        <div
          v-for="p in [...myOutfield].sort((a, b) => staminaOf(a.id) - staminaOf(b.id)).slice(0, 4)"
          :key="p.id"
          class="leg"
        >
          <span class="ln">{{ nameOf(p.id) }}</span>
          <span class="bar"><i :style="{ width: staminaOf(p.id) * 100 + '%', background: staminaOf(p.id) > 0.6 ? 'var(--accent)' : staminaOf(p.id) > 0.35 ? 'var(--signal)' : 'var(--danger)' }" /></span>
        </div>
      </aside>
    </div>

    <footer class="bottom">
      <div class="matchlog">
        <span class="eyebrow">{{ t('coach.matchLog') }}</span>
        <div
          v-for="l in lines.slice(0, 3)"
          :key="l.tick + l.text"
          class="lrow"
        >
          <span class="mono lt">{{ clockOf(l.tick) }}</span><span :style="{ color: l.colour }">{{ l.text }}</span>
        </div>
      </div>
      <div class="decision">
        <template v-if="decision?.key === 'pc'">
          <span class="eyebrow eyebrow-signal">{{ t('coach.decision', { s: decisionLeft }) }}</span>
          <span class="dtext">{{ t('coach.pcCall', { style: theirStyle }) }}</span>
          <div class="dbtns">
            <button
              class="btn btn-primary btn-xs"
              @click="decide('dragFlick')"
            >
              {{ t('coach.flick') }}
            </button>
            <button
              class="btn btn-secondary btn-xs"
              @click="decide('slipRight')"
            >
              {{ t('coach.slip') }}
            </button>
          </div>
        </template>
        <template v-else-if="decision?.finding">
          <span class="eyebrow eyebrow-signal"><span class="dot bo-pulse" />{{ t('coach.coachRead') }}</span>
          <span class="dtitle">{{ t(decision.finding.i18nKey + '.title', decision.finding.params) }}</span>
          <span class="dtext">{{ t(decision.finding.i18nKey + '.body', decision.finding.params) }}</span>
          <div
            v-if="decision.finding.kind === 'readNoShots'"
            class="dbtns"
          >
            <button
              class="btn btn-primary btn-xs"
              @click="setTactic('buildUp', 'wide'); decision = null"
            >
              {{ t('coach.goWide') }}
            </button>
            <button
              class="btn btn-secondary btn-xs"
              @click="decision = null"
            >
              {{ t('coach.holdShape') }}
            </button>
          </div>
        </template>
        <template v-else>
          <span class="eyebrow">{{ t('coach.decisionIdle') }}</span>
          <span class="dtext">{{ t('coach.decisionWaiting') }}</span>
        </template>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.touchline { height: 100dvh; display: grid; grid-template-rows: 52px minmax(0, 1fr) 118px; background: var(--bg); }
.top { display: flex; align-items: center; gap: 12px; padding: 0 16px; background: var(--panel-2); border-bottom: 1px solid var(--hairline); }
.kit { width: 12px; height: 12px; border-radius: 2px; border: 1px solid rgba(255, 255, 255, 0.25); display: inline-block; }
.kit.small { width: 9px; height: 9px; }
.tn { font-family: var(--font-display); font-size: 16px; font-weight: 600; letter-spacing: 0.1em; }
.tn.muted { color: var(--fg-muted); }
.tn.mine { text-decoration: underline; text-decoration-color: var(--accent); text-underline-offset: 4px; }
.score { font-family: var(--font-display); font-size: 26px; font-weight: 700; letter-spacing: 0.06em; line-height: 1; }
.you { display: inline-flex; align-items: center; gap: 6px; font-size: 10px; letter-spacing: 0.12em; color: var(--fg-dim); border: 1px solid var(--hairline); border-radius: 4px; padding: 3px 7px; }
.q { font-size: 11px; letter-spacing: 0.14em; color: var(--fg-muted); }
.clock { font-size: 15px; letter-spacing: 0.04em; }
.prog { width: 120px; height: 4px; background: #1b2127; border-radius: 2px; position: relative; overflow: hidden; display: inline-block; }
.prog i { position: absolute; left: 0; top: 0; bottom: 0; background: var(--accent); border-radius: 2px; }
.tbtn { font-size: 13px; color: var(--fg); background: none; border: none; cursor: pointer; }
.cbtn { background: transparent; cursor: pointer; }
.err { color: var(--danger); font-size: 11px; }
.mid { display: grid; grid-template-columns: 172px minmax(0, 1fr) 172px; min-height: 0; }
.rail { padding: 12px; display: flex; flex-direction: column; gap: 10px; background: var(--panel); min-height: 0; overflow: auto; }
.rail.left { border-right: 1px solid var(--hairline); }
.rail.right { border-left: 1px solid var(--hairline); gap: 9px; }
.shape { font-size: 30px; letter-spacing: 0.04em; background: none; border: none; color: var(--fg); cursor: pointer; text-align: left; padding: 0; }
.dial { display: flex; flex-direction: column; gap: 4px; background: none; border: none; padding: 0; cursor: pointer; color: var(--fg-muted); font: inherit; text-align: left; }
.dh { display: flex; justify-content: space-between; font-size: 12px; }
.val { color: var(--accent-pale); }
.stage { position: relative; background: #0f2b23; overflow: hidden; }
.canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.ovl-label { position: absolute; left: 10px; top: 10px; font-size: 10px; letter-spacing: 0.16em; color: rgba(215, 245, 230, 0.62); background: rgba(6, 9, 12, 0.6); border-radius: 3px; padding: 3px 6px; }
.ovl-tr { position: absolute; right: 10px; top: 10px; display: flex; gap: 5px; flex-wrap: wrap; justify-content: flex-end; max-width: 60%; }
.chip { cursor: pointer; }
.modal { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: rgba(10, 14, 18, 0.95); border: 1px solid var(--hairline); border-radius: 10px; padding: 18px; min-width: 320px; display: flex; flex-direction: column; gap: 10px; }
.mh { font-family: var(--font-display); font-size: 24px; font-weight: 600; letter-spacing: 0.02em; }
.mbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.5; }
.grid { border-collapse: collapse; font-size: 13px; }
.grid th, .grid td { padding: 3px 10px; text-align: right; border-bottom: 1px solid var(--row-line); }
.grid td:first-child { text-align: left; color: var(--fg-muted); }
.drawer { position: absolute; left: 10px; top: 40px; bottom: 10px; width: min(420px, 90%); background: rgba(11, 15, 19, 0.96); border: 1px solid var(--hairline); border-radius: 10px; padding: 14px; display: flex; flex-direction: column; gap: 12px; overflow: auto; }
.dgroup { display: flex; flex-direction: column; gap: 6px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.sel { font-size: 12px; color: var(--fg-muted); display: flex; flex-direction: column; gap: 3px; }
.roster { display: flex; flex-direction: column; gap: 2px; }
.rrow { display: grid; grid-template-columns: 1fr 70px; gap: 8px; align-items: center; font-size: 13px; padding: 2px 6px; border-radius: 4px; background: none; border: none; color: var(--fg); cursor: pointer; text-align: left; font: inherit; }
.rrow.sel { outline: 1px solid var(--accent); }
.rrow:disabled { opacity: 0.5; cursor: default; }
.rrow em { color: var(--fg-dim); font-style: normal; font-size: 11px; }
.lstat { display: flex; justify-content: space-between; align-items: baseline; font-size: 13px; border-bottom: 1px solid var(--hairline-soft); padding-bottom: 5px; }
.lk { color: var(--fg-muted); }
.lv { color: var(--fg); }
.legs { margin-top: 6px; }
.leg { display: grid; grid-template-columns: 1fr 54px; gap: 9px; align-items: center; }
.ln { font-size: 12px; color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.bottom { border-top: 1px solid var(--hairline); background: var(--panel-2); display: grid; grid-template-columns: minmax(0, 1fr) 260px; }
.matchlog { padding: 10px 14px; display: flex; flex-direction: column; gap: 6px; min-width: 0; overflow: hidden; }
.lrow { display: flex; gap: 10px; font-size: 13px; align-items: baseline; }
.lt { font-size: 12px; color: var(--fg-dim); }
.decision { border-left: 1px solid var(--hairline); padding: 10px 14px; display: flex; flex-direction: column; gap: 7px; }
.dtitle { font-family: var(--font-display); font-size: 17px; font-weight: 600; line-height: 1.15; }
.dtext { font-size: 13.5px; color: var(--fg-2); line-height: 1.45; }
.dbtns { display: flex; gap: 6px; }
.dbtns .btn { flex: 1; }
.dot { background: var(--signal); margin-right: 6px; }
@media (max-width: 900px) {
  .touchline { grid-template-rows: 52px minmax(0, 1fr) auto; }
  .mid { grid-template-columns: 1fr; grid-template-rows: minmax(300px, 1fr) auto; }
  .rail.left { display: none; }
  .rail.right { border-left: none; border-top: 1px solid var(--hairline); flex-direction: row; flex-wrap: wrap; }
  .bottom { grid-template-columns: 1fr; }
  .decision { border-left: none; border-top: 1px solid var(--hairline); }
  .dbtns .btn { padding: 15px 0; font-size: 17px; }
}
</style>
