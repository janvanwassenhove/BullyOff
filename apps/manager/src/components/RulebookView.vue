<script setup lang="ts">
/** The rulebook: the FIH rules the engine applies, one card each, deep-linked from the report ("READ THE RULE →"). */
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { RULE_KEYS } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';

const { t } = useI18n();
const app = useAppStore();
const focus = computed(() => app.ruleFocus);
const cards = ref<HTMLElement | null>(null);
onMounted(() => { if (focus.value) cards.value?.querySelector<HTMLElement>(`[data-rule="${focus.value}"]`)?.scrollIntoView({ block: 'center' }); });
</script>

<template>
  <div class="rb">
    <div class="head">
      <h1 class="display h1">
        {{ t('rules.title') }}
      </h1>
      <span class="sub">{{ t('rules.sub') }}</span>
    </div>
    <div
      ref="cards"
      class="cards"
    >
      <article
        v-for="k in RULE_KEYS"
        :key="k"
        class="panel card"
        :class="{ focus: k === focus }"
        :data-rule="k"
      >
        <span class="eyebrow">{{ k.replace('rules.', '').toUpperCase() }}</span>
        <h2 class="rt">
          {{ t(k + '.title') }}
        </h2>
        <p class="rbody">
          {{ t(k + '.body') }}
        </p>
      </article>
    </div>
  </div>
</template>

<style scoped>
.rb { padding: 24px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.h1 { font-size: 28px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.card { padding: 16px; display: flex; flex-direction: column; gap: 6px; }
.card.focus { border-color: var(--signal); }
.rt { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.02em; }
.rbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.55; }
</style>
