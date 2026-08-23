<script setup lang="ts">
/**
 * The season-hub family: 58 px app bar (wordmark, nav, saved status, locale) + 96 px club bar
 * (crest, club, tier/season/day/position, next fixture, actions) + the screen underneath.
 */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore, type Screen } from '../stores/app';
import { useSeasonStore } from '../stores/season';
import { LOCALES, setLocale, type Locale } from '../i18n';
import Crest from './ui/Crest.vue';
import TeamSheet from './ui/TeamSheet.vue';
import SeasonHub from './SeasonHub.vue';
import SquadView from './SquadView.vue';
import TacticsView from './TacticsView.vue';
import ClubView from './ClubView.vue';
import RulebookView from './RulebookView.vue';
import AcademyView from './AcademyView.vue';

const props = defineProps<{ screen: Screen }>();
const { t, locale } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const NAV: { key: Screen; label: string }[] = [
  { key: 'season', label: 'app.nav.season' }, { key: 'squad', label: 'app.nav.squad' }, { key: 'tactics', label: 'app.nav.tactics' }, { key: 'club', label: 'app.nav.club' }, { key: 'rulebook', label: 'app.nav.rulebook' }, { key: 'academy', label: 'app.nav.academy' },
];
/** Screens that are about a club you manage: without one they have nothing to show. */
const CAREER_ONLY: Screen[] = ['season', 'squad', 'tactics', 'club'];
const hasCareer = computed(() => !!season.world?.userClub);
const locked = (k: Screen): boolean => CAREER_ONLY.includes(k) && !hasCareer.value;
const hasSave = ref(false);
const club = computed(() => season.userClub);
const ordinal = (n: number): string => (n <= 0 ? '—' : n <= 3 ? t(`ordinal.${n}`) : t('ordinal.n', { n }));
const next = computed(() => season.nextOpponent);
const finished = computed(() => season.world?.season.finished ?? false);
onMounted(async () => {
  if (!season.world) await season.load('autosave');
  hasSave.value = !!(await season.peekSave('autosave'))?.world.userClub;
});
async function continueCareer(): Promise<void> { if (await season.load('autosave')) app.go(season.world?.userClub ? 'season' : 'clubSelect'); }

async function saveNow(): Promise<void> { const at = await season.save(); if (at) app.markSaved(at); }
async function simDay(): Promise<void> { await season.playDay(); await saveNow(); }
async function simToEnd(): Promise<void> { await season.playToEnd(); await saveNow(); }
async function nextSeason(): Promise<void> { await season.nextSeason(); await saveNow(); }
const signing = ref(false);
function coach(): void { signing.value = true; }
function kickOff(): void { signing.value = false; season.startCoaching(); if (season.coaching) app.go('coach'); }
function pickLocale(ev: Event): void { setLocale((ev.target as HTMLSelectElement).value as Locale); }
</script>

<template>
  <div class="hub">
    <header class="appbar">
      <button
        class="wordmark"
        @click="app.go('title')"
      >
        {{ t('app.title') }}
      </button>
      <span class="vdiv" />
      <nav class="nav">
        <button
          v-for="n in NAV"
          :key="n.key"
          class="navi"
          :class="{ on: props.screen === n.key, lock: locked(n.key) }"
          :disabled="locked(n.key)"
          :title="locked(n.key) ? t('hub.noCareer.locked') : undefined"
          @click="app.go(n.key)"
        >
          {{ t(n.label) }}
        </button>
      </nav>
      <span class="grow" />
      <button
        class="status mono"
        :title="t('app.save')"
        @click="saveNow"
      >
        {{ app.savedClock ? t('app.saved', { time: app.savedClock }) : t('app.unsaved') }}
      </button>
      <button
        class="status mono"
        @click="app.go('viewer')"
      >
        {{ t('app.nav.viewer').toUpperCase() }}
      </button>
      <label class="status mono">
        <span class="sr-only">{{ t('app.language') }}</span>
        <select
          class="loc"
          :value="locale"
          @change="pickLocale"
        >
          <option
            v-for="l in LOCALES"
            :key="l.id"
            :value="l.id"
          >
            {{ l.id.toUpperCase() }}
          </option>
        </select>
      </label>
      <button
        class="status mono"
        @click="app.go('about')"
      >
        ⚙
      </button>
    </header>

    <div
      v-if="club && season.world"
      class="clubbar"
    >
      <Crest
        :colours="club.colours"
        :shape="club.badge.shape"
        :split="club.badge.split"
        :size="34"
      />
      <div class="ccol">
        <span class="cname">{{ club.name }}</span>
        <span class="cmeta mono">{{ t('hub.tier', { n: club.tier }) }} · {{ t('hub.season', { year: season.world.year }) }} · {{ t('hub.day', { d: season.world.season.day + 1, n: season.world.season.days }) }} · {{ ordinal(season.userPosition) }}</span>
      </div>
      <span class="vdiv tall" />
      <div class="nextcol">
        <span
          v-if="finished"
          class="eyebrow eyebrow-signal"
        >{{ t('hub.finished') }}</span>
        <template v-else-if="next">
          <span class="eyebrow eyebrow-signal">{{ next.away ? t('hub.nextAway', { day: next.day + 1 }) : t('hub.nextHome', { day: next.day + 1 }) }}</span>
          <span class="scout">{{ next.played ? t('hub.scout', { club: next.name, goals: next.goals, conceded: next.conceded, played: next.played }) : t('hub.scoutNone', { club: next.name }) }}</span>
        </template>
        <span
          v-else
          class="eyebrow"
        >{{ t('hub.nextNone') }}</span>
      </div>
      <span class="grow" />
      <button
        v-if="season.todaysUserFixture && !finished"
        class="btn btn-primary btn-md"
        :disabled="season.busy"
        @click="coach"
      >
        {{ t('hub.coach') }}
      </button>
      <button
        v-if="!finished"
        class="btn btn-secondary"
        :disabled="season.busy"
        @click="simDay"
      >
        {{ t('hub.simDay') }}
      </button>
      <button
        v-if="!finished"
        class="btn btn-secondary"
        :disabled="season.busy"
        @click="simToEnd"
      >
        {{ season.busy && season.progress ? `${season.progress.label} · ${Math.round(100 * season.progress.done / season.progress.total)} %` : t('hub.simToEnd') }}
      </button>
      <button
        v-if="finished"
        class="btn btn-primary btn-md"
        :disabled="season.busy"
        @click="nextSeason"
      >
        {{ t('hub.nextSeason') }}
      </button>
    </div>

    <div
      v-else
      class="clubbar startbar"
    >
      <span class="mark"><i /></span>
      <div class="ccol">
        <span class="cname">{{ t('hub.noCareer.title') }}</span>
        <span class="cmeta mono">{{ t('hub.noCareer.meta') }}</span>
      </div>
      <span class="grow" />
      <button
        v-if="hasSave"
        class="btn btn-secondary"
        @click="continueCareer"
      >
        {{ t('hub.noCareer.continue') }}
      </button>
      <button
        v-if="season.world && !hasCareer"
        class="btn btn-primary btn-md"
        @click="app.go('clubSelect')"
      >
        {{ t('hub.noCareer.pick') }}
      </button>
      <button
        v-else
        class="btn btn-primary btn-md"
        @click="app.go('newCareer')"
      >
        {{ t('hub.noCareer.start') }}
      </button>
    </div>

    <TeamSheet
      v-if="signing"
      @start="kickOff"
      @edit="signing = false; app.go('squad')"
      @tactics="signing = false; app.go('tactics')"
      @close="signing = false"
    />

    <main class="content">
      <div
        v-if="locked(props.screen)"
        class="empty"
      >
        <div class="panel ecard">
          <span class="eyebrow eyebrow-signal">{{ t('hub.noCareer.title') }}</span>
          <h2 class="display eh">
            {{ t('hub.noCareer.headline') }}
          </h2>
          <p class="ebody">
            {{ t('hub.noCareer.body') }}
          </p>
          <div class="acts">
            <button
              class="btn btn-primary btn-md"
              @click="app.go('newCareer')"
            >
              {{ t('hub.noCareer.start') }}
            </button>
            <button
              v-if="hasSave"
              class="btn btn-secondary"
              @click="continueCareer"
            >
              {{ t('hub.noCareer.continue') }}
            </button>
            <button
              class="btn btn-ghost"
              @click="app.go('rulebook')"
            >
              {{ t('app.nav.rulebook') }}
            </button>
            <button
              class="btn btn-ghost"
              @click="app.go('academy')"
            >
              {{ t('app.nav.academy') }}
            </button>
          </div>
        </div>
      </div>
      <SeasonHub v-else-if="props.screen === 'season'" />
      <SquadView v-else-if="props.screen === 'squad'" />
      <TacticsView v-else-if="props.screen === 'tactics'" />
      <ClubView v-else-if="props.screen === 'club'" />
      <AcademyView v-else-if="app.screen === 'academy'" />
      <RulebookView v-else />
    </main>
  </div>
</template>

<style scoped>
.hub { min-height: 100dvh; display: grid; grid-template-rows: 58px auto minmax(0, 1fr); background: var(--bg); }
.appbar { display: flex; align-items: center; gap: 18px; padding: 0 24px; border-bottom: 1px solid var(--hairline); background: var(--panel-2); }
.wordmark { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 0.16em; color: var(--accent-pale); background: none; border: none; cursor: pointer; padding: 0; }
.vdiv { height: 18px; }
.vdiv.tall { height: 44px; }
.nav { display: flex; gap: 14px; }
.navi { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; color: var(--fg-muted); background: none; border: none; border-bottom: 2px solid transparent; padding: 18px 2px; cursor: pointer; }
.navi.on { color: var(--fg); border-bottom-color: var(--accent); }
.navi.lock { color: var(--fg-faint); cursor: not-allowed; }
.startbar { min-height: 76px; }
.startbar .mark { width: 34px; height: 34px; border-radius: 50%; background: var(--panel-2); border: 1px solid var(--line-strong); position: relative; overflow: hidden; display: inline-block; }
.startbar .mark i { position: absolute; left: 0; right: 0; top: 50%; height: 2px; background: var(--fg-dim); }
.empty { display: grid; place-items: center; padding: 40px 24px; }
.ecard { max-width: 560px; padding: 26px 28px; display: flex; flex-direction: column; gap: 10px; border-left: 3px solid var(--accent); }
.eh { font-size: 24px; letter-spacing: 0.03em; }
.ebody { font-size: 14.5px; color: var(--fg-3); line-height: 1.55; }
.acts { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 8px; }
.status { font-size: 11px; letter-spacing: 0.12em; color: var(--fg-dim); background: none; border: none; cursor: pointer; }
.loc { font: inherit; letter-spacing: inherit; color: inherit; background: transparent; border: none; cursor: pointer; }
.clubbar { display: flex; align-items: center; gap: 20px; padding: 14px 24px; border-bottom: 1px solid var(--hairline); background: var(--panel); min-height: 96px; flex-wrap: wrap; }
.ccol { display: flex; flex-direction: column; gap: 1px; }
.cname { font-family: var(--font-display); font-size: 22px; font-weight: 600; letter-spacing: 0.04em; line-height: 1.1; }
.cmeta { font-size: 11px; letter-spacing: 0.12em; color: var(--fg-muted); }
.nextcol { display: flex; flex-direction: column; gap: 2px; }
.scout { font-size: 15px; color: var(--fg-2); }
.content { min-height: 0; display: grid; }
@media (max-width: 900px) { .appbar { padding: 0 12px; gap: 10px; overflow-x: auto; } .navi { padding: 14px 2px; font-size: 13px; } .clubbar { padding: 12px; gap: 12px; } }
</style>
