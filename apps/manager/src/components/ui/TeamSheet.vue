<script setup lang="ts">
/**
 * The team sheet you sign before kick-off: the eleven as they will actually take the field, the
 * bench, and anyone you picked who cannot play this Saturday — replaced by the assistant, said out
 * loud here rather than discovered at the first whistle. Last stop before the touchline.
 */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSeasonStore } from '../../stores/season';

const emit = defineEmits<{ start: []; edit: []; tactics: []; close: [] }>();
const { t } = useI18n();
const season = useSeasonStore();

const sheet = computed(() => season.sheet);
const next = computed(() => season.nextOpponent);
const club = computed(() => season.userClub);
const tac = computed(() => club.value?.tactics ?? null);
const plan = computed(() => (tac.value
  ? t('sheet.plan', { formation: tac.value.formation, press: t('coach.pressShort.' + tac.value.press), mentality: t('coach.mentalityShort.' + tac.value.mentality) })
  : ''));
</script>

<template>
  <div
    class="scrim"
    @click.self="emit('close')"
  >
    <div class="card panel">
      <header class="head">
        <div class="hcol">
          <span class="eyebrow eyebrow-accent">{{ t('sheet.title') }}</span>
          <h2 class="display h2">
            {{ club?.name }}
          </h2>
          <span class="opp">{{ next ? (next.away ? t('sheet.away', { opp: next.name }) : t('sheet.home', { opp: next.name })) : '' }}</span>
        </div>
        <span class="grow" />
        <span class="chip chip-11 mono">{{ plan }}</span>
      </header>

      <div class="lists">
        <div class="col">
          <span class="eyebrow">{{ t('sheet.eleven') }}</span>
          <div
            v-for="(r, i) in sheet.starters"
            :key="r.id"
            class="row"
          >
            <span class="mono slot">{{ season.slotRoles[i] }}</span>
            <span class="nm">{{ r.name }}</span>
            <span
              v-if="r.captain"
              class="mono cap"
            >{{ t('squad.captain') }}</span>
            <span class="grow" />
            <span class="mono ovr">{{ r.ovr }}</span>
          </div>
        </div>
        <div class="col">
          <span class="eyebrow">{{ t('sheet.bench') }}</span>
          <div
            v-for="r in sheet.bench"
            :key="r.id"
            class="row"
          >
            <span class="mono slot">{{ r.role }}</span>
            <span class="nm">{{ r.name }}</span>
            <span class="grow" />
            <span class="mono ovr">{{ r.ovr }}</span>
          </div>
          <template v-if="sheet.missing.length">
            <span class="eyebrow eyebrow-signal miss">{{ t('sheet.missing') }}</span>
            <div
              v-for="r in sheet.missing"
              :key="r.id"
              class="row out"
            >
              <span class="mono slot">{{ r.role }}</span>
              <span class="nm">{{ r.name }}</span>
              <span class="grow" />
              <span class="mono why">{{ r.injured > 0 ? t('squad.out', { d: r.injured }) : t('squad.absent') }}</span>
            </div>
            <span class="hint">{{ t('sheet.missingHint') }}</span>
          </template>
        </div>
      </div>

      <footer class="acts">
        <button
          class="btn btn-ghost btn-sm"
          @click="emit('close')"
        >
          {{ t('sheet.cancel') }}
        </button>
        <span class="grow" />
        <button
          class="btn btn-secondary btn-sm"
          @click="emit('edit')"
        >
          {{ t('sheet.edit') }}
        </button>
        <button
          class="btn btn-secondary btn-sm"
          @click="emit('tactics')"
        >
          {{ t('sheet.tactics') }}
        </button>
        <button
          class="btn btn-primary btn-md"
          @click="emit('start')"
        >
          {{ t('sheet.start') }}
        </button>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.scrim { position: fixed; inset: 0; z-index: 50; background: rgba(6, 8, 10, 0.72); display: grid; place-items: center; padding: 24px; }
.card { width: min(860px, 100%); max-height: 88dvh; overflow: auto; padding: 24px 26px; display: flex; flex-direction: column; gap: 18px; border-left: 3px solid var(--accent); }
.head { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
.hcol { display: flex; flex-direction: column; gap: 2px; }
.h2 { font-size: 26px; letter-spacing: 0.03em; }
.opp { font-size: 14px; color: var(--fg-muted); }
.lists { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 22px; }
.col { display: flex; flex-direction: column; gap: 4px; }
.row { display: flex; align-items: center; gap: 10px; padding: 5px 0; border-bottom: 1px solid var(--row-line); font-size: 14px; }
.row.out { opacity: 0.75; }
.slot { font-size: 10.5px; letter-spacing: 0.08em; color: var(--accent-soft); width: 34px; }
.row.out .slot { color: var(--fg-dim); }
.nm { color: var(--fg-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.cap { font-size: 10px; color: var(--accent-soft); }
.ovr { font-size: 12.5px; color: var(--fg); }
.why { font-size: 11px; color: var(--signal); }
.miss { margin-top: 12px; }
.hint { font-size: 11.5px; color: var(--fg-dim); margin-top: 4px; }
.acts { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
@media (max-width: 720px) { .lists { grid-template-columns: 1fr; } }
</style>
