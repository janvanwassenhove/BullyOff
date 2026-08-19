<script setup lang="ts">
/** First-run onboarding (Phase 9): three screens that sell the fictional world in a minute; shown once (localStorage). */
import { ref } from 'vue';

const emit = defineEmits<{ done: [] }>();
const step = ref(0);
const STEPS = ['s1', 's2', 's3'] as const;
function next(): void { if (step.value < 2) step.value++; else emit('done'); }
</script>

<template>
  <div
    class="backdrop"
    role="dialog"
    aria-modal="true"
    :aria-label="$t(`onboarding.${STEPS[step]}Title`)"
  >
    <section class="card">
      <div class="dots">
        <span
          v-for="(s, i) in STEPS"
          :key="s"
          class="dot"
          :class="{ on: i === step }"
        />
      </div>
      <h2>{{ $t(`onboarding.${STEPS[step]}Title`) }}</h2>
      <p>{{ $t(`onboarding.${STEPS[step]}`) }}</p>
      <div class="row">
        <button
          class="btn"
          @click="emit('done')"
        >
          {{ $t('onboarding.skip') }}
        </button>
        <span class="grow" />
        <button
          class="btn primary"
          @click="next"
        >
          {{ step < 2 ? $t('onboarding.next') : $t('onboarding.start') }}
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; inset: 0; background: rgba(5, 8, 11, 0.78); display: grid; place-items: center; z-index: 50; padding: var(--space-3); }
.card { background: var(--color-bg-elevated); border: 1px solid var(--color-border); border-radius: var(--radius-md); padding: var(--space-4); max-width: 460px; width: 100%; display: flex; flex-direction: column; gap: var(--space-2); }
.card h2 { margin: 0; }
.card p { margin: 0; line-height: 1.5; color: var(--color-fg-muted); }
.dots { display: flex; gap: 6px; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: var(--color-border); }
.dot.on { background: var(--color-turf-500); }
.row { display: flex; gap: var(--space-2); align-items: center; margin-top: var(--space-2); }
.grow { flex: 1; }
.btn { background: var(--color-bg); color: var(--color-fg); border: 1px solid var(--color-border); border-radius: var(--radius-sm); padding: 8px 14px; cursor: pointer; font: inherit; }
.btn.primary { background: var(--color-turf-700); border-color: var(--color-turf-500); color: #fff; font-weight: 700; }
</style>
