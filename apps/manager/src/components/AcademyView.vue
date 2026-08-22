<script setup lang="ts">
/**
 * The academy: four topics, each walked one step at a time. Deep-linked from the report's coach
 * hints ("LEARN THIS →"), the same way the rulebook is deep-linked from a rule call.
 */
import { computed, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ACADEMY, topic as topicById, type TopicId } from '../lib/academy';
import { useAppStore } from '../stores/app';
import AcademyDiagram from './ui/AcademyDiagram.vue';

const { t } = useI18n();
const app = useAppStore();

const open = ref<TopicId | null>(app.academyFocus);
const i = ref(0);
// a deep link from the report opens the wizard straight on that topic
watch(() => app.academyFocus, (f) => { if (f) { open.value = f; i.value = 0; } });

const current = computed(() => (open.value ? topicById(open.value) ?? null : null));
const steps = computed(() => current.value?.steps ?? []);
const step = computed(() => steps.value[i.value] ?? null);
const last = computed(() => i.value >= steps.value.length - 1);

function start(id: TopicId): void { open.value = id; i.value = 0; }
function close(): void { open.value = null; app.academyFocus = null; }
function next(): void { if (last.value) close(); else i.value++; }
function prev(): void { if (i.value > 0) i.value--; }
</script>

<template>
  <div class="ac">
    <div class="head">
      <h1 class="display h1">
        {{ t('academy.title') }}
      </h1>
      <span class="sub">{{ t('academy.sub') }}</span>
    </div>

    <div
      v-if="!current"
      class="cards"
    >
      <article
        v-for="tp in ACADEMY"
        :key="tp.id"
        class="panel card"
      >
        <span class="eyebrow">{{ t('academy.steps', { n: tp.steps.length }) }}</span>
        <h2 class="ct">
          {{ t('academy.' + tp.id + '.title') }}
        </h2>
        <p class="cbody">
          {{ t('academy.' + tp.id + '.sub') }}
        </p>
        <button
          class="btn btn-primary"
          @click="start(tp.id)"
        >
          {{ t('academy.open') }}
        </button>
      </article>
    </div>

    <section
      v-else-if="step"
      class="panel wiz"
    >
      <header class="wh">
        <span class="eyebrow">{{ t('academy.' + current.id + '.title') }}</span>
        <span class="grow" />
        <span class="mono count">{{ t('academy.step', { n: i + 1, total: steps.length }) }}</span>
        <button
          class="btn btn-ghost"
          @click="close"
        >
          {{ t('academy.close') }}
        </button>
      </header>

      <div class="body">
        <AcademyDiagram
          :view="step.view"
          :markers="step.markers"
          :arrows="step.arrows"
        />
        <div class="text">
          <h2 class="st">
            {{ t('academy.' + current.id + '.steps.' + step.id + '.title') }}
          </h2>
          <p class="sb">
            {{ t('academy.' + current.id + '.steps.' + step.id + '.body') }}
          </p>
          <div class="legend">
            <span><i class="dot us" />{{ t('academy.legend.us') }}</span>
            <span><i class="dot them" />{{ t('academy.legend.them') }}</span>
            <span><i class="dot ball" />{{ t('academy.legend.ball') }}</span>
            <span><i class="ln pass" />{{ t('academy.legend.pass') }}</span>
            <span><i class="ln run" />{{ t('academy.legend.run') }}</span>
          </div>
        </div>
      </div>

      <footer class="wf">
        <button
          class="btn btn-ghost"
          :disabled="i === 0"
          @click="prev"
        >
          {{ t('academy.prev') }}
        </button>
        <div class="dots">
          <i
            v-for="(s, n) in steps"
            :key="s.id"
            class="pip"
            :class="{ on: n === i, done: n < i }"
          />
        </div>
        <button
          class="btn btn-primary"
          @click="next"
        >
          {{ last ? t('academy.finish') : t('academy.next') }}
        </button>
      </footer>
    </section>
  </div>
</template>

<style scoped>
.ac { padding: 24px; display: flex; flex-direction: column; gap: 16px; min-height: 0; overflow: auto; }
.head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
.h1 { font-size: 28px; letter-spacing: 0.04em; }
.sub { font-size: 14px; color: var(--fg-muted); }
.cards { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 12px; }
.card { padding: 16px; display: flex; flex-direction: column; gap: 8px; align-items: flex-start; }
.ct { font-family: var(--font-display); font-size: 19px; font-weight: 600; letter-spacing: 0.02em; }
.cbody { font-size: 13.5px; color: var(--fg-3); line-height: 1.55; flex: 1; }
.wiz { padding: 16px; display: flex; flex-direction: column; gap: 14px; max-width: 1040px; }
.wh { display: flex; align-items: center; gap: 10px; }
.count { font-size: 12px; color: var(--fg-muted); }
.grow { flex: 1; }
.body { display: grid; grid-template-columns: minmax(280px, 1.15fr) 1fr; gap: 18px; align-items: start; }
.st { font-family: var(--font-display); font-size: 21px; font-weight: 600; margin-bottom: 8px; }
.sb { font-size: 14.5px; color: var(--fg-2); line-height: 1.6; }
.legend { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 14px; font-size: 11.5px; color: var(--fg-muted); }
.legend span { display: inline-flex; align-items: center; gap: 5px; }
.dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; }
.dot.us { background: var(--accent); } .dot.them { background: var(--danger); } .dot.ball { background: var(--fg-1); width: 6px; height: 6px; }
.ln { width: 14px; height: 0; border-top: 2px solid var(--fg-2); display: inline-block; }
.ln.run { border-top-style: dashed; }
.wf { display: flex; align-items: center; gap: 12px; }
.dots { display: flex; gap: 6px; flex: 1; justify-content: center; }
.pip { width: 7px; height: 7px; border-radius: 50%; background: var(--line-strong); }
.pip.on { background: var(--signal); } .pip.done { background: var(--accent-soft, var(--accent)); }
@media (max-width: 780px) { .body { grid-template-columns: 1fr; } }
</style>
