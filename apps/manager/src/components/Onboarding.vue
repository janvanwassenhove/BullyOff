<script setup lang="ts">
/**
 * 02 · First-run onboarding — three cards (453 × 400): progress bars, a 126 px illustration
 * (public/onboarding/{world,season,bench}.webp, 906 × 252), title, body, SKIP / NEXT / LET'S GO.
 * Shown once; the caller persists `bullyoff.onboarded`.
 */
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const emit = defineEmits<{ done: [] }>();
const { t } = useI18n();
const step = ref(0);
const base = import.meta.env.BASE_URL;
const STEPS = ['s1', 's2', 's3'] as const;
const ART = ['world', 'season', 'bench'] as const;
const broken = ref<Record<string, boolean>>({});
function next(): void { if (step.value < 2) step.value++; else emit('done'); }
</script>

<template>
  <div
    class="backdrop"
    role="dialog"
    aria-modal="true"
    :aria-label="t(`onboarding.${STEPS[step]}Title`)"
  >
    <section class="card">
      <div class="bars">
        <span
          v-for="(s, i) in STEPS"
          :key="s"
          class="bar-i"
          :class="{ on: i === step }"
        />
      </div>
      <div class="art">
        <img
          v-if="!broken[ART[step] ?? 'world']"
          :src="`${base}onboarding/${ART[step]}.webp`"
          alt=""
          @error="broken[ART[step] ?? 'world'] = true"
        >
        <span
          v-else
          class="mono art-label"
        >[ {{ t(`onboarding.art.${step}`) }} ]</span>
      </div>
      <h2 class="h">
        {{ t(`onboarding.${STEPS[step]}Title`) }}
      </h2>
      <p class="b">
        {{ t(`onboarding.${STEPS[step]}`) }}
      </p>
      <span class="grow" />
      <div class="row">
        <button
          class="skip mono"
          @click="emit('done')"
        >
          {{ t('onboarding.skip') }}
        </button>
        <span class="grow" />
        <button
          class="btn btn-sm"
          :class="step < 2 ? 'btn-pale' : 'btn-primary'"
          style="font-size: 16px; padding: 11px 22px; border-radius: 6px"
          @click="next"
        >
          {{ step < 2 ? t('onboarding.next') : t('onboarding.start') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(5, 8, 11, 0.82); display: grid; place-items: center; z-index: 50; padding: 16px; }
.card { width: min(92vw, 453px); max-height: 86dvh; overflow: auto; min-height: 0; background: var(--panel); border: 1px solid var(--hairline); border-radius: 12px; padding: 26px; display: flex; flex-direction: column; gap: 14px; }
.bars { display: flex; gap: 6px; }
.bar-i { width: 22px; height: 3px; border-radius: 2px; background: var(--hairline); }
.bar-i.on { background: var(--accent); }
.art { height: 126px; border: 1px solid #1b2530; border-radius: 8px; background: repeating-linear-gradient(135deg, #0d151a 0 10px, #0b1216 10px 20px); display: grid; place-items: center; overflow: hidden; }
.art img { width: 100%; height: 100%; object-fit: cover; display: block; }
.art-label { font-size: 11px; color: var(--fg-dim); }
.h { font-family: var(--font-display); font-size: 30px; font-weight: 600; letter-spacing: 0.03em; line-height: 1.1; }
.b { font-size: 15px; color: var(--fg-3); line-height: 1.55; }
.row { display: flex; align-items: center; gap: 12px; }
.skip { font-size: 11px; letter-spacing: 0.14em; color: var(--fg-dim); background: none; border: none; cursor: pointer; padding: 0; }
</style>
