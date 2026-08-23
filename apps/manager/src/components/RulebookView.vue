<script setup lang="ts">
/**
 * The rulebook: the FIH rules the game applies, one card each, deep-linked from the report
 * ("READ THE RULE →"). The selected rule plays as a looping scene on the real pitch renderer
 * (lib/ruleClips.ts) in the stage at the top (the renderer loops it); click any card to see that rule.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RULE_KEYS, type RuleKey } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';
import { ruleClip } from '../lib/ruleClips';
import PitchCanvas from './ui/PitchCanvas.vue';

const { t } = useI18n();
const app = useAppStore();
const isRule = (k: string | null): k is RuleKey => k !== null && (RULE_KEYS as readonly string[]).includes(k);
const selected = ref<RuleKey>(isRule(app.ruleFocus) ? app.ruleFocus : RULE_KEYS[0]);
const clip = computed(() => ruleClip(selected.value));
const cards = ref<HTMLElement | null>(null);
const stage = ref<HTMLElement | null>(null);

function pick(k: RuleKey): void { selected.value = k; app.ruleFocus = k; stage.value?.scrollIntoView({ block: 'start', behavior: 'smooth' }); }
onMounted(() => { if (app.ruleFocus) cards.value?.querySelector<HTMLElement>(`[data-rule="${app.ruleFocus}"]`)?.scrollIntoView({ block: 'center' }); });
watch(() => app.ruleFocus, (k) => { if (isRule(k)) selected.value = k; });
</script>

<template>
  <div class="rb">
    <div class="head">
      <h1 class="display h1">
        {{ t('rules.title') }}
      </h1>
      <span class="sub">{{ t('rules.sub') }}</span>
    </div>
    <section
      ref="stage"
      class="stage panel"
    >
      <div class="scene">
        <PitchCanvas
          :log="clip.log"
          :camera="clip.camera"
          :overlay="clip.overlay"
          mode="tactical"
          :colours="[0x1f9a63, 0xe63946]"
          fit="cover"
          loop
        />
        <span class="eyebrow eyebrow-signal tag">{{ t('rules.stageLabel') }}</span>
      </div>
      <div class="explain">
        <span class="eyebrow">{{ selected.replace('rules.', '').toUpperCase() }}</span>
        <h2 class="rt">
          {{ t(selected + '.title') }}
        </h2>
        <p class="rbody">
          {{ t(selected + '.body') }}
        </p>
        <span class="hint">{{ t('rules.stageHint') }}</span>
      </div>
    </section>
    <div
      ref="cards"
      class="cards"
    >
      <button
        v-for="k in RULE_KEYS"
        :key="k"
        class="panel card"
        :class="{ focus: k === selected }"
        :data-rule="k"
        @click="pick(k)"
      >
        <span class="eyebrow">{{ k.replace('rules.', '').toUpperCase() }}</span>
        <h2 class="rt">
          {{ t(k + '.title') }}
        </h2>
        <p class="rbody">
          {{ t(k + '.body') }}
        </p>
      </button>
    </div>
  </div>
</template>

<style scoped>
.rb { padding: 24px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.h1 { font-size: 28px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.stage { display: grid; grid-template-columns: minmax(0, 3fr) minmax(280px, 2fr); gap: 0; overflow: hidden; scroll-margin-top: 16px; }
.scene { position: relative; aspect-ratio: 16 / 9; min-height: 240px; background: #08120e; }
.tag { position: absolute; left: 14px; top: 12px; background: rgba(6, 9, 12, 0.6); padding: 4px 8px; border-radius: 4px; }
.explain { padding: 20px 22px; display: flex; flex-direction: column; gap: 8px; border-left: 1px solid var(--hairline); }
.hint { margin-top: auto; font-size: 12px; color: var(--fg-dim); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.card { padding: 16px; display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer; color: inherit; font: inherit; }
.card.focus { border-color: var(--signal); }
.rt { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.02em; }
.rbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.55; }
@media (max-width: 900px) { .stage { grid-template-columns: 1fr; } .explain { border-left: none; border-top: 1px solid var(--hairline); } }
</style>
