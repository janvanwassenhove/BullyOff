<script setup lang="ts">
/** 01 · Title / main menu. Key art at public/title/keyart.webp (1280 × 1260, webp). */
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ENGINE_VERSION } from '@bullyoff/engine';
import { SAVE_VERSION } from '@bullyoff/season';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';

const { t } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const base = import.meta.env.BASE_URL;
const saveMeta = ref<string | null>(null);
const keyArt = ref(true);

onMounted(async () => {
  const doc = await season.peekSave('autosave');
  const w = doc?.world; const uc = w?.userClub;
  if (w && uc) saveMeta.value = t('title.menu.continueMeta', { club: w.clubs[uc]?.name ?? '', year: w.year, day: w.season.day + 1 });
});
async function onContinue(): Promise<void> {
  if (season.world?.userClub) { app.go('season'); return; }
  if (await season.load('autosave')) app.go(season.world?.userClub ? 'season' : 'clubSelect');
}
const items = [
  { n: '01', key: 'continue', go: onContinue },
  { n: '02', key: 'newCareer', go: () => { app.go('newCareer'); } },
  { n: '03', key: 'viewer', go: () => { app.go('viewer'); } },
  { n: '04', key: 'academy', go: () => { app.openAcademy(null); } },
  { n: '05', key: 'rulebook', go: () => { app.go('rulebook'); } },
  { n: '06', key: 'settings', go: () => { app.go('about'); } },
];
</script>

<template>
  <section class="title">
    <div class="wash" />
    <div class="art">
      <img
        v-if="keyArt"
        :src="base + 'title/keyart.webp'"
        alt=""
        @error="keyArt = false"
      >
      <span
        v-else
        class="art-label mono"
      >[ {{ t('title.keyArt') }} ]</span>
    </div>
    <div class="left">
      <div class="brand">
        <span class="mark"><i /></span>
        <span class="eyebrow eyebrow-accent wide">{{ t('title.eyebrow') }}</span>
      </div>
      <h1 class="wordmark">
        BULLY<br>OFF
      </h1>
      <div class="rule" />
      <p class="lede">
        {{ t('title.body') }}
      </p>
      <span class="grow" />
      <nav class="menu">
        <button
          v-for="(m, i) in items"
          :key="m.key"
          class="row"
          :class="{ active: i === 0 && !!saveMeta, dim: m.key === 'settings', disabled: m.key === 'continue' && !saveMeta && !season.world }"
          :disabled="m.key === 'continue' && !saveMeta && !season.world"
          @click="m.go()"
        >
          <span class="idx mono">{{ m.n }}</span>
          <span class="label">{{ t(`title.menu.${m.key}`) }}</span>
          <span class="grow" />
          <span class="meta">{{ m.key === 'continue' ? (saveMeta ?? t('title.menu.noSave')) : t(`title.menu.${m.key}Meta`) }}</span>
        </button>
      </nav>
    </div>
    <div class="version mono">
      <span>{{ t('app.version.engine', { v: ENGINE_VERSION }) }}</span><span>{{ t('app.version.save', { v: SAVE_VERSION }) }}</span><span>{{ t('app.version.offline') }}</span><span>{{ t('app.version.langs') }}</span>
    </div>
  </section>
</template>

<style scoped>
.title { position: relative; min-height: 100dvh; background: #080b0e; overflow: hidden; }
.title::before { content: ''; position: absolute; inset: 0; background: repeating-linear-gradient(102deg, #0c1418 0 3px, #0a1114 3px 7px); opacity: 0.9; }
.wash { position: absolute; right: 0; top: 0; bottom: 0; width: 58%; background: linear-gradient(200deg, rgba(31, 154, 99, 0.22), rgba(30, 120, 200, 0.10) 55%, transparent); }
.art { position: absolute; right: 70px; top: 90px; width: min(640px, 44vw); aspect-ratio: 640 / 590; border: 1px solid #1b2530; border-radius: 8px; background: repeating-linear-gradient(135deg, #0d151a 0 12px, #0b1216 12px 24px); display: grid; place-items: center; overflow: hidden; }
.art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.art-label { font-size: 13px; color: var(--fg-dim); padding: 16px; text-align: center; }
.left { position: absolute; left: 80px; top: 80px; bottom: 52px; width: 520px; display: flex; flex-direction: column; gap: 6px; }
.brand { display: flex; align-items: center; gap: 14px; }
.mark { width: 34px; height: 34px; border-radius: 50%; background: var(--accent); position: relative; overflow: hidden; display: inline-block; }
.mark i { position: absolute; left: 0; right: 0; top: 50%; height: 3px; background: var(--ink); }
.wide { letter-spacing: var(--track-eyebrow-wide); font-size: 11px; }
.wordmark { font-family: var(--font-display); font-size: 92px; font-weight: 700; letter-spacing: 0.06em; line-height: 0.9; color: #f2f7fa; }
.rule { width: 190px; height: 2px; background: var(--accent); margin: 10px 0 4px; }
.lede { font-size: 16px; color: var(--fg-3); max-width: 44ch; line-height: 1.5; }
.menu { display: flex; flex-direction: column; gap: 10px; width: 400px; }
.row { display: flex; align-items: center; gap: 16px; background: var(--panel); border: 1px solid var(--hairline); border-left: 3px solid var(--line-strong); border-radius: 6px; padding: 10px 18px; cursor: pointer; color: var(--fg); font: inherit; text-align: left; }
.row.active { background: #0f1a16; border-color: var(--accent); border-left-color: var(--accent); }
.row.dim .label { color: var(--fg-muted); }
.row.disabled { opacity: 0.5; cursor: default; }
.idx { font-size: 11px; color: var(--fg-dim); }
.label { font-family: var(--font-display); font-size: 23px; font-weight: 600; letter-spacing: 0.08em; }
.meta { font-size: 13px; color: var(--fg-dim); text-align: right; }
.version { position: absolute; right: 70px; bottom: 28px; display: flex; gap: 22px; font-size: 11px; letter-spacing: 0.12em; color: var(--fg-dim); }
@media (max-width: 1100px) {
  .art { position: relative; right: auto; top: auto; width: 100%; max-width: 640px; margin: 24px auto 0; }
  .left { position: relative; left: auto; top: auto; bottom: auto; width: auto; padding: 24px 16px; }
  .wordmark { font-size: 64px; }
  .menu { width: 100%; }
  .version { position: relative; right: auto; bottom: auto; padding: 0 16px 24px; flex-wrap: wrap; }
}
</style>
