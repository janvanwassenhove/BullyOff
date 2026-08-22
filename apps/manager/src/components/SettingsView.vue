<script setup lang="ts">
/** Settings + About & privacy: language, sound, install, saved careers, intro/onboarding resets, the ADR-006 statement. */
import { onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import { ENGINE_VERSION } from '@bullyoff/engine';
import { SAVE_VERSION } from '@bullyoff/season';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';
import { LOCALES, setLocale, type Locale } from '../i18n';
import { canInstall, promptInstall } from '../pwa';

const { t, locale } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
onMounted(() => { void season.refreshSlots(); });
async function load(slot: string): Promise<void> { if (await season.load(slot)) app.go(season.world?.userClub ? 'season' : 'clubSelect'); }
function exportSave(): void {
  const json = season.exportJson(); if (!json) return;
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = `bullyoff-save-${season.world?.year ?? ''}.json`; a.click(); URL.revokeObjectURL(a.href);
}
async function onImport(ev: Event): Promise<void> { const f = (ev.target as HTMLInputElement).files?.[0]; if (!f) return; season.importJson(await f.text()); }
function replayIntro(): void { try { globalThis.localStorage.removeItem('bullyoff.intro.seen'); } catch { /* ignore */ } app.intro.seen = false; app.go('intro'); }
function resetOnboarding(): void { try { globalThis.localStorage.removeItem('bullyoff.onboarded'); } catch { /* ignore */ } app.go('newCareer'); }
</script>

<template>
  <section class="settings">
    <header class="appbar">
      <button
        class="wordmark"
        @click="app.go(season.world?.userClub ? 'season' : 'title')"
      >
        {{ t('app.title') }}
      </button>
      <span class="vdiv" />
      <span class="eyebrow eyebrow-11">{{ t('settings.title').toUpperCase() }}</span>
      <span class="grow" />
      <button
        class="btn btn-secondary btn-sm"
        @click="app.go(season.world?.userClub ? 'season' : 'title')"
      >
        {{ t('app.back') }}
      </button>
    </header>
    <div class="cols">
      <div class="col">
        <div class="panel blk">
          <span class="eyebrow">{{ t('settings.language') }}</span>
          <div class="chips">
            <button
              v-for="l in LOCALES"
              :key="l.id"
              class="choice"
              :class="{ on: locale === l.id }"
              @click="setLocale(l.id as Locale)"
            >
              {{ l.label }}
            </button>
          </div>
        </div>
        <div class="panel blk">
          <span class="eyebrow">{{ t('settings.sound') }}</span>
          <div class="chips">
            <button
              class="choice"
              :class="{ on: !app.intro.muted }"
              @click="app.intro.muted && app.toggleMuted()"
            >
              {{ t('settings.soundOn') }}
            </button>
            <button
              class="choice"
              :class="{ on: app.intro.muted }"
              @click="!app.intro.muted && app.toggleMuted()"
            >
              {{ t('settings.soundOff') }}
            </button>
          </div>
        </div>
        <div class="panel blk">
          <span class="eyebrow">{{ t('settings.install') }}</span>
          <button
            v-if="canInstall"
            class="btn btn-primary btn-sm"
            @click="promptInstall"
          >
            {{ t('app.install') }}
          </button>
          <span
            v-else
            class="hint"
          >{{ t('settings.notInstallable') }}</span>
        </div>
        <div class="panel blk">
          <span class="eyebrow">{{ t('settings.saves') }}</span>
          <p
            v-if="!season.slots.length"
            class="hint"
          >
            {{ t('settings.noSaves') }}
          </p>
          <div
            v-for="s in season.slots"
            :key="s"
            class="slot"
          >
            <span class="mono">{{ s }}</span>
            <span class="grow" />
            <button
              class="btn btn-secondary btn-sm"
              @click="load(s)"
            >
              {{ t('settings.load') }}
            </button>
            <button
              class="btn btn-secondary btn-sm"
              @click="season.deleteSave(s)"
            >
              {{ t('settings.delete') }}
            </button>
          </div>
          <div class="chips">
            <button
              class="btn btn-secondary btn-sm"
              :disabled="!season.world"
              @click="exportSave"
            >
              {{ t('settings.exportSave') }}
            </button>
            <label class="btn btn-secondary btn-sm">{{ t('settings.importSave') }}<input
              type="file"
              accept="application/json"
              class="sr-only"
              @change="onImport"
            ></label>
          </div>
        </div>
        <div class="panel blk">
          <div class="chips">
            <button
              class="btn btn-secondary btn-sm"
              @click="replayIntro"
            >
              {{ t('settings.replayIntro') }}
            </button>
            <button
              class="btn btn-secondary btn-sm"
              @click="resetOnboarding"
            >
              {{ t('settings.resetOnboarding') }}
            </button>
          </div>
        </div>
      </div>
      <article class="col about">
        <h2 class="display h2">
          {{ t('about.title') }}
        </h2>
        <p>{{ t('about.intro') }}</p>
        <span class="eyebrow">{{ t('about.privacyTitle').toUpperCase() }}</span>
        <ul>
          <li>{{ t('about.privacy1') }}</li>
          <li>{{ t('about.privacy2') }}</li>
          <li>{{ t('about.privacy3') }}</li>
          <li>{{ t('about.privacy4') }}</li>
        </ul>
        <span class="eyebrow">{{ t('about.offlineTitle').toUpperCase() }}</span>
        <p>{{ t('about.offline') }}</p>
        <span class="eyebrow">{{ t('about.creditsTitle').toUpperCase() }}</span>
        <p>{{ t('about.credits') }}</p>
        <p class="mono dim">
          {{ t('about.version', { engine: ENGINE_VERSION, save: SAVE_VERSION }) }} · <a
            href="https://github.com/janvanwassenhove/BullyOff"
            rel="noopener"
            target="_blank"
          >github.com/janvanwassenhove/BullyOff</a>
        </p>
      </article>
    </div>
  </section>
</template>

<style scoped>
.settings { min-height: 100dvh; display: grid; grid-template-rows: 58px minmax(0, 1fr); background: var(--bg); }
.appbar { display: flex; align-items: center; gap: 18px; padding: 0 24px; border-bottom: 1px solid var(--hairline); background: var(--panel-2); }
.wordmark { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 0.16em; color: var(--accent-pale); background: none; border: none; cursor: pointer; padding: 0; }
.vdiv { height: 18px; }
.cols { display: grid; grid-template-columns: 430px minmax(0, 1fr); gap: 24px; padding: 24px; min-height: 0; overflow: auto; }
.col { display: flex; flex-direction: column; gap: 14px; }
.blk { padding: 16px; display: flex; flex-direction: column; gap: 10px; }
.chips { display: flex; gap: 8px; flex-wrap: wrap; }
.hint { font-size: 13px; color: var(--fg-dim); }
.slot { display: flex; align-items: center; gap: 8px; font-size: 13px; }
.about { max-width: 70ch; line-height: 1.55; color: var(--fg-3); }
.h2 { font-size: 26px; color: var(--fg); }
.about ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.dim { font-size: 12px; color: var(--fg-dim); }
@media (max-width: 900px) { .cols { grid-template-columns: 1fr; } }
</style>
