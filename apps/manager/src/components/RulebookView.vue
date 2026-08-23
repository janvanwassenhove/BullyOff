<script setup lang="ts">
/**
 * The rulebook: the FIH rules the game applies, one card each, deep-linked from the report
 * ("READ THE RULE →"). The selected rule plays as a looping scene in the stage at the top, in the
 * view that actually shows it: rules about where the ball and the players are run on the real pitch
 * renderer (lib/ruleClips.ts); rules about the stick face, the ball height or a card are drawn from
 * the sideline with figures (lib/ruleFigures.ts). Nine rules have both — the stroke needs the flick
 * and the cleared circle — so those get a pair of chips to switch. Where a video explains the
 * situation better than either, the card links to it (lib/ruleVideos.ts).
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { RULE_KEYS, type RuleKey } from '@bullyoff/insight';
import { useAppStore } from '../stores/app';
import { ruleClip } from '../lib/ruleClips';
import { figureScene } from '../lib/ruleFigures';
import { ruleVideo, videoUrl } from '../lib/ruleVideos';
import PitchCanvas from './ui/PitchCanvas.vue';
import RuleFigure from './ui/RuleFigure.vue';

const { t } = useI18n();
const app = useAppStore();
const isRule = (k: string | null): k is RuleKey => k !== null && (RULE_KEYS as readonly string[]).includes(k);
const selected = ref<RuleKey>(isRule(app.ruleFocus) ? app.ruleFocus : RULE_KEYS[0]);
const figure = computed(() => figureScene(selected.value));
const clip = computed(() => ruleClip(selected.value));
const video = computed(() => ruleVideo(selected.value));
/** Which view is up. A rule with figures opens on them; the pitch is a chip away. */
const view = ref<'figure' | 'pitch'>(figure.value ? 'figure' : 'pitch');
const showFigure = computed(() => !!figure.value && view.value === 'figure');
watch(figure, (f) => { view.value = f ? 'figure' : 'pitch'; });
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
        <RuleFigure
          v-if="showFigure && figure"
          :key="selected"
          :scene="figure"
        />
        <PitchCanvas
          v-else
          :key="selected + ':pitch'"
          :log="clip.log"
          :camera="clip.camera"
          :overlay="clip.overlay"
          mode="tactical"
          :colours="[0x1f9a63, 0xe63946]"
          fit="cover"
          loop
        />
        <div
          v-if="figure"
          class="chips"
        >
          <button
            class="chip chip-mode"
            :class="{ on: view === 'figure' }"
            @click="view = 'figure'"
          >
            {{ t('rules.view.figures') }}
          </button>
          <button
            class="chip chip-mode"
            :class="{ on: view === 'pitch' }"
            @click="view = 'pitch'"
          >
            {{ t('rules.view.pitch') }}
          </button>
        </div>
        <span
          v-else
          class="eyebrow eyebrow-signal tag"
        >{{ t('rules.stageLabel') }}</span>
      </div>
      <div class="explain">
        <span class="eyebrow">{{ selected.replace('rules.', '').toUpperCase() }}</span>
        <h2 class="rt">
          {{ t(selected + '.title') }}
        </h2>
        <p class="rbody">
          {{ t(selected + '.body') }}
        </p>
        <a
          v-if="video"
          class="video"
          :href="videoUrl(video)"
          target="_blank"
          rel="noopener noreferrer"
        >
          <span class="eyebrow eyebrow-signal">▶ {{ t('rules.video') }}</span>
          <span class="vtitle">{{ video.title }}</span>
          <span class="vmeta mono">{{ video.channel }} · {{ t('rules.videoNote') }}</span>
        </a>
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
.chips { position: absolute; left: 12px; top: 10px; display: flex; gap: 6px; }
.video { margin-top: 14px; display: flex; flex-direction: column; gap: 3px; padding: 12px 14px; border: 1px solid var(--hairline); border-left: 3px solid var(--signal); border-radius: 6px; background: var(--panel-2); text-decoration: none; color: inherit; }
.video:hover { border-color: var(--signal); }
.vtitle { font-size: 13.5px; color: var(--fg-2); line-height: 1.4; }
.vmeta { font-size: 10px; letter-spacing: 0.1em; color: var(--fg-dim); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 12px; }
.card { padding: 16px; display: flex; flex-direction: column; gap: 6px; text-align: left; cursor: pointer; color: inherit; font: inherit; }
.card.focus { border-color: var(--signal); }
.rt { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.02em; }
.rbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.55; }
@media (max-width: 900px) { .stage { grid-template-columns: 1fr; } .explain { border-left: none; border-top: 1px solid var(--hairline); } }
</style>
