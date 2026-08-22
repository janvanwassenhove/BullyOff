<script setup lang="ts">
/**
 * The shell: one screen at a time from the app store (no router dependency), the
 * PWA banners, and the first-run onboarding overlay. Every screen is a component;
 * the hub screens share HubShell (app bar + club bar).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from './stores/app';
import { useSeasonStore } from './stores/season';
import { applyUpdate, needRefresh, offlineReady, setupPwa } from './pwa';
import IntroView from './components/IntroView.vue';
import TitleView from './components/TitleView.vue';
import NewCareerView from './components/NewCareerView.vue';
import ClubSelectView from './components/ClubSelectView.vue';
import HubShell from './components/HubShell.vue';
import CoachView from './components/CoachView.vue';
import ReportView from './components/ReportView.vue';
import MatchSimView from './components/MatchSimView.vue';
import SettingsView from './components/SettingsView.vue';
import Onboarding from './components/Onboarding.vue';
import type { CoachInstruction, MatchLog } from '@bullyoff/engine';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const ONBOARD_KEY = 'bullyoff.onboarded';
const onboarding = ref(false);

onMounted(() => {
  setupPwa();
  void season.refreshSlots();
});
// first-run onboarding shows once, the first time the player heads for a new career
watch(() => app.screen, (s) => {
  // each screen is a fresh page: never inherit the previous screen's scroll offset
  try { globalThis.scrollTo({ top: 0 }); } catch { /* non-browser */ }
  if (s !== 'newCareer') return;
  try { onboarding.value = globalThis.localStorage.getItem(ONBOARD_KEY) !== '1'; } catch { onboarding.value = false; }
});
function onboarded(): void { onboarding.value = false; try { globalThis.localStorage.setItem(ONBOARD_KEY, '1'); } catch { /* ignore */ } }

async function onFinished(log: MatchLog, instructions: CoachInstruction[]): Promise<void> {
  await season.finishCoaching(log, instructions);
  app.go('report');
}
const hubScreen = computed(() => (app.inHub ? app.screen : 'season'));
</script>

<template>
  <div
    class="shell"
    :class="{ ink: app.screen === 'intro' || app.screen === 'title' }"
  >
    <p
      v-if="needRefresh"
      class="banner"
    >
      {{ t('app.updateAvailable') }}
      <button
        class="btn btn-sm btn-primary"
        @click="applyUpdate"
      >
        {{ t('app.reload') }}
      </button>
    </p>
    <p
      v-else-if="offlineReady"
      class="banner"
    >
      {{ t('app.offlineReady') }}
    </p>

    <Transition
      name="fade"
      mode="out-in"
    >
      <IntroView
        v-if="app.screen === 'intro'"
        key="intro"
      />
      <TitleView
        v-else-if="app.screen === 'title'"
        key="title"
      />
      <NewCareerView
        v-else-if="app.screen === 'newCareer'"
        key="newCareer"
      />
      <ClubSelectView
        v-else-if="app.screen === 'clubSelect'"
        key="clubSelect"
      />
      <CoachView
        v-else-if="app.screen === 'coach' && season.coaching"
        :key="'coach' + season.coaching.fixtureId"
        :coaching="season.coaching"
        @finished="onFinished"
        @abandon="season.abandonCoaching(); app.go('season')"
      />
      <ReportView
        v-else-if="app.screen === 'report'"
        key="report"
      />
      <MatchSimView
        v-else-if="app.screen === 'viewer'"
        key="viewer"
      />
      <SettingsView
        v-else-if="app.screen === 'about'"
        key="about"
      />
      <HubShell
        v-else
        :key="'hub'"
        :screen="hubScreen"
      />
    </Transition>

    <Onboarding
      v-if="onboarding"
      @done="onboarded"
    />
  </div>
</template>

<style scoped>
.shell { min-height: 100dvh; background: var(--bg); display: flex; flex-direction: column; }
.shell.ink { background: var(--ink); }
.banner { margin: 0; background: var(--panel-2); border-bottom: 1px solid var(--accent); padding: 6px 16px; font-size: 13px; display: flex; gap: var(--space-2); align-items: center; color: var(--fg-2); }
</style>
