<script setup lang="ts">
/** Club page: identity, honours, facilities and the amateur budget — all from the world. */
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { clubPlayers } from '@bullyoff/season';
import { useSeasonStore } from '../stores/season';
import Crest from './ui/Crest.vue';

const { t } = useI18n();
const season = useSeasonStore();
const hex = (c: number): string => '#' + c.toString(16).padStart(6, '0');
const club = computed(() => season.userClub);
const world = computed(() => season.world);
const counts = computed(() => (club.value && world.value ? { squad: clubPlayers(world.value, club.value.id).length, youth: clubPlayers(world.value, club.value.id, true).length - clubPlayers(world.value, club.value.id).length } : { squad: 0, youth: 0 }));
const euro = (n: number): string => `€ ${Math.round(n / 1000)} k`;
</script>

<template>
  <div
    v-if="club && world"
    class="club"
  >
    <div
      class="bannerk"
      :style="{ background: hex(club.colours[0]) }"
    >
      <div class="stripes" />
      <div class="bk">
        <Crest
          :colours="club.colours"
          :shape="club.badge.shape"
          :split="club.badge.split"
          :size="56"
          light
        />
        <div class="bcol">
          <span
            class="eyebrow"
            :style="{ color: hex(club.colours[1]), opacity: 0.8 }"
          >{{ club.town.toUpperCase() }} · {{ t('career.est', { year: club.founded }).toUpperCase() }}{{ club.nickname ? ' · "' + club.nickname.toUpperCase() + '"' : '' }}</span>
          <span
            class="bname"
            :style="{ color: hex(club.colours[1]) }"
          >{{ club.name }}</span>
        </div>
      </div>
    </div>
    <div class="grid">
      <div class="panel p">
        <span class="eyebrow">{{ t('career.titles') }}</span>
        <span class="display-700 big">{{ club.honours.titles.length }}</span>
        <span class="mono small">{{ club.honours.titles.join(' · ') || '—' }}</span>
      </div>
      <div class="panel p">
        <span class="eyebrow">{{ t('career.squadLevel') }}</span>
        <span class="display-700 big">{{ (club.level / 4).toFixed(1) }}</span>
        <span class="mono small">{{ counts.squad }} + {{ counts.youth }} · {{ t('hub.tier', { n: club.tier }) }}</span>
      </div>
      <div class="panel p">
        <span class="eyebrow">{{ t('career.facilities') }}</span>
        <span class="display-700 big">{{ club.facilities }}/5</span>
        <span class="mono small">{{ t('career.' + club.surface) }}</span>
      </div>
      <div class="panel p wide">
        <span class="eyebrow">{{ t('club.budget') }}</span>
        <div class="fin">
          <span>{{ t('club.membership') }}</span><span class="mono r">{{ euro(club.finances.membershipIncome) }}</span>
          <span>{{ t('club.sponsor') }}</span><span class="mono r">{{ euro(club.finances.sponsorIncome) }}</span>
          <span>{{ t('club.facilities') }}</span><span class="mono r">−{{ euro(club.finances.facilityCosts) }}</span>
          <span>{{ t('club.coaching') }}</span><span class="mono r">−{{ euro(club.finances.coachingCosts) }}</span>
          <span>{{ t('club.travel') }}</span><span class="mono r">−{{ euro(club.finances.travelCosts) }}</span>
          <span class="strong">{{ t('club.balance') }}</span><span
            class="mono r strong"
            :style="{ color: club.finances.balance < 0 ? 'var(--danger)' : 'var(--accent-soft)' }"
          >{{ euro(club.finances.balance) }}</span>
        </div>
      </div>
      <div class="panel p wide">
        <span class="eyebrow">{{ t('career.kit') }}</span>
        <div class="swatches">
          <span
            class="sw"
            :style="{ background: hex(club.colours[0]) }"
          /><span
            class="sw"
            :style="{ background: hex(club.colours[1]) }"
          /><span
            class="sw"
            style="background: #0f2b23"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.club { display: flex; flex-direction: column; min-height: 0; overflow: auto; }
.bannerk { height: 200px; position: relative; overflow: hidden; flex: none; }
.stripes { position: absolute; inset: 0; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0 14px, transparent 14px 28px); }
.bk { position: absolute; left: 24px; bottom: 20px; display: flex; align-items: flex-end; gap: 14px; }
.bcol { display: flex; flex-direction: column; gap: 2px; }
.bname { font-family: var(--font-display); font-size: 30px; font-weight: 700; letter-spacing: 0.04em; line-height: 1; text-transform: uppercase; }
.grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; padding: 24px; }
.p { padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.wide { grid-column: span 3; }
.big { font-size: 34px; }
.small { font-size: 11px; color: var(--fg-dim); letter-spacing: 0.08em; }
.fin { display: grid; grid-template-columns: 1fr auto; gap: 6px 18px; font-size: 14px; color: var(--fg-3); max-width: 420px; }
.r { text-align: right; color: var(--fg-2); }
.strong { color: var(--fg); font-weight: 500; }
.swatches { display: flex; gap: 8px; }
.sw { width: 34px; height: 34px; border-radius: 5px; border: 1px solid rgba(255, 255, 255, 0.14); }
@media (max-width: 800px) { .grid { grid-template-columns: 1fr; } .wide { grid-column: auto; } }
</style>
