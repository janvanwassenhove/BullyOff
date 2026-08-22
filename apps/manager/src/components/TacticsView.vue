<script setup lang="ts">
/** Tactics board: the club's standing system/press/mentality/build-up/tempo/rotation/PC variant — what the next match starts with. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { FORMATIONS, MENTALITY_LINE, PRESS_HEIGHT, type FormationId, type Mentality, type PcVariant, type PressId, type TeamTactics } from '@bullyoff/engine';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const club = computed(() => season.userClub);
const tac = computed<TeamTactics | null>(() => club.value?.tactics ?? null);
const FORMATION_IDS: FormationId[] = ['4-3-3', '3-4-3', '4-4-2', '5-3-2', '3-3-3-1', '4-2-3-1'];
const PRESS_IDS: PressId[] = ['full', 'half', 'split', 'zone'];
const MENTALITIES: Mentality[] = ['defensive', 'balanced', 'attacking'];
const PCS: PcVariant[] = ['dragFlick', 'lowHit', 'slipRight', 'slipLeft', 'deflection'];
const tempoWord = (x: number): 'low' | 'normal' | 'high' => (x < 0.4 ? 'low' : x > 0.65 ? 'high' : 'normal');
const TEMPO = { low: 0.25, normal: 0.5, high: 0.8 } as const;

function patch(p: Partial<TeamTactics>): void {
  const c = club.value; if (!c) return;
  Object.assign(c.tactics, p);
  if (p.press) c.tactics.pressHeight = PRESS_HEIGHT[p.press];
  if (p.mentality) c.tactics.defensiveLine = MENTALITY_LINE[p.mentality];
  void season.save().then((at) => { if (at) app.markSaved(at); });
}
const slots = computed(() => (tac.value ? FORMATIONS[tac.value.formation] : []));
</script>

<template>
  <div
    v-if="tac"
    class="tac"
  >
    <div class="board">
      <div class="group">
        <span class="eyebrow">{{ t('coach.formationLabel').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="f in FORMATION_IDS"
            :key="f"
            class="choice"
            :class="{ on: tac.formation === f }"
            @click="patch({ formation: f })"
          >
            {{ f }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.pressLabel').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="p in PRESS_IDS"
            :key="p"
            class="choice"
            :class="{ on: tac.press === p }"
            @click="patch({ press: p })"
          >
            {{ t('coach.press.' + p) }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.mentalityLabel').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="m in MENTALITIES"
            :key="m"
            class="choice"
            :class="{ on: tac.mentality === m }"
            @click="patch({ mentality: m })"
          >
            {{ t('coach.mentality.' + m) }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.buildUpLabel').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="b in (['possession', 'direct', 'wide'] as const)"
            :key="b"
            class="choice"
            :class="{ on: tac.buildUp === b }"
            @click="patch({ buildUp: b })"
          >
            {{ t('coach.buildUp.' + b) }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.tempoLabel').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="w in (['low', 'normal', 'high'] as const)"
            :key="w"
            class="choice"
            :class="{ on: tempoWord(tac.tempo) === w }"
            @click="patch({ tempo: TEMPO[w] })"
          >
            {{ t('coach.tempo.' + w) }}
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.rotateBelow').toUpperCase() }}</span>
        <div class="chips">
          <button
            v-for="r in [0.45, 0.55, 0.65, 0.75]"
            :key="r"
            class="choice"
            :class="{ on: Math.abs(tac.rotateBelowStamina - r) < 0.03 }"
            @click="patch({ rotateBelowStamina: r })"
          >
            {{ Math.round(r * 100) }} %
          </button>
        </div>
      </div>
      <div class="group">
        <span class="eyebrow">{{ t('coach.pcDesigner') }}</span>
        <div class="chips">
          <button
            v-for="v in PCS"
            :key="v"
            class="choice"
            :class="{ on: tac.pcVariant === v }"
            @click="patch({ pcVariant: v })"
          >
            {{ t('coach.pc.' + v) }}
          </button>
        </div>
      </div>
    </div>
    <aside class="preview panel">
      <span class="eyebrow">{{ t('coach.shape') }}</span>
      <span class="display-700 shape">{{ tac.formation }}</span>
      <div class="mini">
        <span
          v-for="(s, i) in slots"
          :key="i"
          class="dotp"
          :class="s.role.toLowerCase()"
          :style="{ left: (s.xp / 91.4) * 100 + '%', top: ((s.y + 27.5) / 55) * 100 + '%' }"
          :title="s.role"
        />
        <span
          class="line"
          :style="{ left: (tac.pressHeight * 100) + '%' }"
        />
      </div>
      <div class="dials">
        <div
          v-for="d in [['press', t('coach.pressShort.' + tac.press), tac.pressHeight], ['mentality', t('coach.mentalityShort.' + tac.mentality), tac.defensiveLine], ['tempo', t('coach.tempoShort.' + tempoWord(tac.tempo)), tac.tempo], ['rotate', Math.round(tac.rotateBelowStamina * 100) + ' %', tac.rotateBelowStamina]]"
          :key="String(d[0])"
          class="dial"
        >
          <div class="dh"><span>{{ t('coach.dials.' + String(d[0])) }}</span><span class="mono val">{{ d[1] }}</span></div>
          <div class="bar bar-3"><i :style="{ width: Number(d[2]) * 100 + '%' }" /></div>
        </div>
      </div>
    </aside>
  </div>
</template>

<style scoped>
.tac { display: grid; grid-template-columns: minmax(0, 1fr) 400px; gap: 24px; padding: 24px; min-height: 0; overflow: auto; }
.board { display: flex; flex-direction: column; gap: 20px; }
.group { display: flex; flex-direction: column; gap: 8px; }
.chips { display: flex; gap: 6px; flex-wrap: wrap; }
.preview { padding: 18px; display: flex; flex-direction: column; gap: 12px; align-self: start; }
.shape { font-size: 30px; }
.mini { position: relative; aspect-ratio: 91.4 / 55; background: repeating-linear-gradient(90deg, var(--turf) 0 10.9%, var(--turf-alt) 10.9% 21.8%); border: 1px solid rgba(240, 255, 248, 0.4); border-radius: 4px; overflow: hidden; }
.mini::before { content: ''; position: absolute; left: 50%; top: 0; bottom: 0; width: 1px; background: rgba(240, 255, 248, 0.4); }
.dotp { position: absolute; width: 10px; height: 10px; border-radius: 50%; transform: translate(-50%, -50%); background: var(--accent-soft); border: 1px solid rgba(240, 255, 248, 0.8); }
.dotp.gk { background: var(--signal); }
.dotp.def { background: #1e78c8; }
.dotp.fwd { background: var(--danger); }
.line { position: absolute; top: 0; bottom: 0; width: 1px; border-left: 1px dashed rgba(127, 227, 176, 0.7); }
.dials { display: flex; flex-direction: column; gap: 10px; }
.dial { display: flex; flex-direction: column; gap: 4px; }
.dh { display: flex; justify-content: space-between; font-size: 12px; color: var(--fg-muted); }
.val { color: var(--accent-pale); }
@media (max-width: 1000px) { .tac { grid-template-columns: 1fr; } }
</style>
