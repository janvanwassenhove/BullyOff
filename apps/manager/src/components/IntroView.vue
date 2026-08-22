<script setup lang="ts">
/**
 * 00 · Intro landing — a cinematic way in with exactly one obvious next action.
 * The film is a muted looping <video> with a poster (public/intro/film.mp4 +
 * public/intro/poster.webp); until the assets exist the poster frame alone plays
 * with a slow push-in. prefers-reduced-motion shows the poster only. Skip fires
 * on click, any key or a scroll.
 */
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppStore } from '../stores/app';
import { useSeasonStore } from '../stores/season';
import { LOCALES, setLocale, type Locale } from '../i18n';
import Crest from './ui/Crest.vue';

const { t, locale } = useI18n();
const app = useAppStore();
const season = useSeasonStore();
const base = import.meta.env.BASE_URL;
const video = ref<HTMLVideoElement | null>(null);
const hasFilm = ref(true);
const continueCard = ref<{ club: string; colours: [number, number]; shape: string; split: string; year: number; day: number; time: string } | null>(null);

const reduced = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
const steps = computed(() => [0, 1, 2].map((i) => ({ n: i + 1, title: t(`intro.steps.${i}.title`), body: t(`intro.steps.${i}.body`) })));
const stepColours = ['var(--accent)', 'var(--accent-soft)', 'var(--signal)'];

async function loadContinue(): Promise<void> {
  const doc = await season.peekSave('autosave');
  if (!doc?.world.userClub) return;
  const w = doc.world; if (!w.userClub) return; const c = w.clubs[w.userClub];
  if (!c) return;
  const d = new Date(doc.createdAt);
  continueCard.value = { club: c.name, colours: c.colours, shape: c.badge.shape, split: c.badge.split, year: w.year, day: w.season.day + 1, time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` };
}
async function onContinue(): Promise<void> { if (await season.load('autosave')) { app.skipIntro(); app.go('season'); } }
function start(): void { app.skipIntro(); app.go('newCareer'); }
function onKey(): void { app.skipIntro(); }
function onScroll(): void { if (window.scrollY > 40) app.skipIntro(); }
function watchFilm(): void { app.intro.filmPlaying = true; const v = video.value; if (v) { v.muted = app.intro.muted; void v.play(); } }
function toggleSound(): void { app.toggleMuted(); if (video.value) video.value.muted = app.intro.muted; }
function pickLocale(ev: Event): void { setLocale((ev.target as HTMLSelectElement).value as Locale); }

onMounted(() => {
  void loadContinue();
  window.addEventListener('keydown', onKey);
  window.addEventListener('scroll', onScroll, { passive: true });
  const v = video.value;
  if (v && !reduced) { v.muted = true; v.play().catch(() => { hasFilm.value = false; }); }
});
onBeforeUnmount(() => { window.removeEventListener('keydown', onKey); window.removeEventListener('scroll', onScroll); });
</script>

<template>
  <section class="intro">
    <div class="film">
      <video
        v-if="!reduced"
        ref="video"
        class="video"
        :poster="base + 'intro/poster.webp'"
        :src="base + 'intro/film.mp4'"
        loop
        playsinline
        muted
        preload="metadata"
        @error="hasFilm = false"
      />
      <img
        v-else
        class="video"
        :src="base + 'intro/poster.webp'"
        alt=""
      >
      <div
        class="still"
        :class="{ kenburns: !reduced }"
        :style="{ backgroundImage: `url(${base}intro/poster.webp)` }"
      />
      <button
        v-if="!app.intro.filmPlaying"
        class="playbtn"
        :aria-label="t('intro.watch')"
        @click="watchFilm"
      >
        <span class="tri" />
      </button>
      <div class="scrim" />
    </div>

    <header class="top">
      <span class="mark"><i /></span>
      <span class="wordmark">{{ t('app.title') }}</span>
      <span class="grow" />
      <label class="ctl">
        <span class="sr-only">{{ t('app.language') }}</span>
        <select
          class="ctl-select"
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
        class="ctl"
        @click="toggleSound"
      >
        {{ app.intro.muted ? t('intro.muted') : t('intro.unmuted') }}
      </button>
      <button
        class="ctl ctl-strong"
        @click="app.skipIntro()"
      >
        {{ t('intro.skip') }}
      </button>
    </header>

    <div class="hero">
      <div class="headline">
        <span class="eyebrow eyebrow-accent wide">{{ t('intro.eyebrow') }}</span>
        <h1 class="h1">
          {{ t('intro.headline') }}
        </h1>
        <p class="lede">
          {{ t('intro.body') }}
        </p>
        <div class="ctas">
          <button
            class="btn btn-primary btn-hero"
            @click="start"
          >
            {{ t('intro.start') }}
          </button>
          <button
            class="btn btn-ghost btn-md"
            @click="watchFilm"
          >
            {{ t('intro.watch') }}
          </button>
          <span class="support">{{ t('intro.support') }}</span>
        </div>
      </div>
      <div class="side">
        <span class="eyebrow">{{ t('intro.pickUp') }}</span>
        <button
          v-if="continueCard"
          class="continue"
          @click="onContinue"
        >
          <Crest
            :colours="continueCard.colours"
            :shape="continueCard.shape"
            :split="continueCard.split"
            :size="30"
          />
          <span class="ccol">
            <span class="cname">{{ continueCard.club }}</span>
            <span class="cmeta mono">{{ t('intro.continueMeta', { year: continueCard.year, day: continueCard.day, time: continueCard.time }) }}</span>
          </span>
          <span class="grow" />
          <span class="carrow">{{ t('intro.continue') }}</span>
        </button>
        <div class="tiles">
          <button
            class="tile"
            @click="app.skipIntro(); app.go('viewer')"
          >
            {{ t('intro.quickMatch') }}
          </button>
          <button
            class="tile"
            @click="app.skipIntro(); app.go('rulebook')"
          >
            {{ t('intro.learnRules') }}
          </button>
        </div>
      </div>
    </div>

    <footer class="steps">
      <div
        v-for="(s, i) in steps"
        :key="s.n"
        class="step"
      >
        <span
          class="num"
          :style="{ color: stepColours[i] }"
        >{{ s.n }}</span>
        <span class="scol">
          <span class="stitle">{{ s.title }}</span>
          <span class="sbody">{{ s.body }}</span>
        </span>
      </div>
      <div class="trust">
        <span>{{ t('intro.trust.offline') }}</span>
        <span>{{ t('intro.trust.noReal') }}</span>
        <span>{{ t('intro.trust.langs') }}</span>
      </div>
    </footer>
  </section>
</template>

<style scoped>
.intro { position: relative; min-height: 100dvh; background: var(--ink); overflow: hidden; display: grid; grid-template-rows: auto 1fr auto; }
.film { position: absolute; left: 0; right: 0; top: 0; height: min(560px, 62dvh); border-bottom: 1px solid #1b2530; background: repeating-linear-gradient(135deg, #0e171c 0 14px, #0b1216 14px 28px); overflow: hidden; }
.video { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
.still { position: absolute; inset: -4%; background-size: cover; background-position: center; opacity: 0.92; }
.still.kenburns { animation: bo-kenburns 45s ease-in-out infinite alternate; }
@keyframes bo-kenburns { from { transform: scale(1); } to { transform: scale(1.08) translate(-1%, -1%); } }
.video:not([poster=""]) ~ .still { opacity: 0; }
.playbtn { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: 64px; height: 64px; border-radius: 50%; border: 1px solid rgba(215, 245, 230, 0.4); background: rgba(6, 9, 12, 0.5); display: grid; place-items: center; cursor: pointer; }
.tri { width: 0; height: 0; border-left: 16px solid rgba(215, 245, 230, 0.85); border-top: 10px solid transparent; border-bottom: 10px solid transparent; margin-left: 5px; }
.scrim { position: absolute; left: 0; right: 0; bottom: 0; height: 60%; background: linear-gradient(180deg, rgba(6, 8, 10, 0), rgba(6, 8, 10, 0.86) 70%, #06080a); pointer-events: none; }
.top { position: relative; z-index: 2; display: flex; align-items: center; gap: 14px; padding: 32px 40px 0; }
.mark { width: 28px; height: 28px; border-radius: 50%; background: var(--accent); position: relative; overflow: hidden; display: inline-block; }
.mark i { position: absolute; left: 0; right: 0; top: 50%; height: 3px; background: var(--ink); }
.wordmark { font-family: var(--font-display); font-size: 18px; font-weight: 700; letter-spacing: 0.16em; color: #f2f7fa; }
.ctl { font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.12em; color: var(--fg-muted); border: 1px solid var(--line-strong); border-radius: 5px; padding: 7px 12px; background: transparent; cursor: pointer; }
.ctl-strong { color: var(--fg-2); }
.ctl-select { font: inherit; letter-spacing: inherit; color: inherit; background: transparent; border: none; padding: 0; cursor: pointer; }
.hero { position: relative; z-index: 2; display: flex; align-items: flex-end; gap: 48px; padding: clamp(200px, 42dvh, 360px) 40px 0; }
.headline { display: flex; flex-direction: column; gap: 14px; max-width: 620px; }
.wide { letter-spacing: var(--track-eyebrow-wide); font-size: 11px; }
.h1 { font-family: var(--font-display); font-size: clamp(44px, 6vw, 76px); font-weight: 700; letter-spacing: 0.03em; line-height: 0.95; color: #f2f7fa; white-space: pre-line; }
.lede { font-size: 17px; color: var(--fg-3); line-height: 1.55; max-width: 52ch; }
.ctas { display: flex; align-items: center; gap: 14px; margin-top: 6px; flex-wrap: wrap; }
.support { font-size: 13px; color: var(--fg-dim); max-width: 16ch; line-height: 1.4; }
.side { flex: 1; display: flex; flex-direction: column; gap: 10px; padding-bottom: 6px; min-width: 280px; }
.continue { display: flex; align-items: center; gap: 14px; text-align: left; background: rgba(11, 15, 19, 0.9); border: 1px solid var(--hairline); border-left: 3px solid var(--accent); border-radius: 8px; padding: 14px 16px; cursor: pointer; color: var(--fg); font: inherit; }
.ccol { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.cname { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.03em; }
.cmeta { font-size: 11px; letter-spacing: 0.1em; color: var(--fg-muted); }
.carrow { font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: 0.08em; color: var(--accent-soft); }
.tiles { display: flex; gap: 10px; }
.tile { flex: 1; font-family: var(--font-display); font-size: 15px; font-weight: 600; letter-spacing: 0.08em; color: var(--fg-2); background: rgba(11, 15, 19, 0.85); border: 1px solid var(--hairline); border-radius: 7px; padding: 12px 14px; cursor: pointer; text-align: left; }
.steps { position: relative; z-index: 2; display: flex; align-items: stretch; gap: 14px; padding: 24px 40px 34px; }
.step { flex: 1; background: rgba(11, 15, 19, 0.86); border: 1px solid var(--hairline); border-radius: 9px; padding: 14px 16px; display: flex; gap: 14px; align-items: flex-start; }
.num { font-family: var(--font-display); font-size: 26px; font-weight: 700; line-height: 1; }
.scol { display: flex; flex-direction: column; gap: 3px; }
.stitle { font-family: var(--font-display); font-size: 18px; font-weight: 600; letter-spacing: 0.03em; }
.sbody { font-size: 13.5px; color: var(--fg-muted); line-height: 1.45; }
.trust { width: 210px; display: flex; flex-direction: column; justify-content: center; gap: 5px; padding-left: 6px; border-left: 1px solid #1b2530; font-family: var(--font-mono); font-size: 10px; letter-spacing: 0.14em; color: var(--fg-faint); }
@media (max-width: 900px) {
  .hero { flex-direction: column; align-items: stretch; padding-top: 46dvh; }
  .steps { flex-direction: column; }
  .trust { width: auto; border-left: none; padding-left: 0; flex-direction: row; flex-wrap: wrap; gap: 12px; }
  .top { padding: 16px 16px 0; flex-wrap: wrap; }
  .hero, .steps { padding-left: 16px; padding-right: 16px; }
}
</style>
