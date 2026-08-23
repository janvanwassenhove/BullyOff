<script setup lang="ts">
/**
 * The intro "film": six generated stills (public/intro/film-{1..6}.webp) cross-fading with a slow
 * push-in, each with one caption. Ambient mode plays silently behind the landing hero; fullscreen
 * mode is the "watch the intro" experience with captions, a progress strip and a close control.
 * No video file to download, no codec, works offline — a slideshow reads as a film at this pace.
 */
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';

const props = withDefaults(defineProps<{ fullscreen?: boolean; seconds?: number }>(), { fullscreen: false, seconds: 7 });
const emit = defineEmits<{ close: [] }>();
const { t } = useI18n();
const base = import.meta.env.BASE_URL;
const FRAMES = [1, 2, 3, 4, 5, 6];
const index = ref(0);
const reduced = typeof globalThis.matchMedia === 'function' && globalThis.matchMedia('(prefers-reduced-motion: reduce)').matches;
let timer: number | null = null;
const src = (n: number): string => `${base}intro/film-${n}.webp`;
const caption = computed(() => t(`intro.reel.f${FRAMES[index.value] ?? 1}`));

function schedule(): void {
  if (timer !== null) clearTimeout(timer);
  timer = window.setTimeout(() => { index.value = (index.value + 1) % FRAMES.length; schedule(); }, props.seconds * 1000);
}
function onKey(e: KeyboardEvent): void { if (props.fullscreen && (e.key === 'Escape' || e.key === ' ' || e.key === 'Enter')) emit('close'); }
onMounted(() => { schedule(); window.addEventListener('keydown', onKey); });
onBeforeUnmount(() => { if (timer !== null) clearTimeout(timer); window.removeEventListener('keydown', onKey); });
watch(() => props.fullscreen, () => { index.value = 0; schedule(); });
</script>

<template>
  <div
    class="reel"
    :class="{ full: fullscreen }"
    @click="fullscreen && emit('close')"
  >
    <div
      v-for="(n, i) in FRAMES"
      :key="n"
      class="frame"
      :class="{ on: i === index, push: !reduced && i === index, even: i % 2 === 0 }"
      :style="{ backgroundImage: `url(${src(n)})` }"
    />
    <template v-if="fullscreen">
      <div class="vignette" />
      <Transition
        name="cap"
        mode="out-in"
      >
        <p
          :key="index"
          class="caption display"
        >
          {{ caption }}
        </p>
      </Transition>
      <div class="strip">
        <span
          v-for="(n, i) in FRAMES"
          :key="n"
          class="seg"
          :class="{ done: i < index, on: i === index }"
          :style="i === index && !reduced ? { animationDuration: seconds + 's' } : undefined"
        />
      </div>
      <button
        class="close mono"
        @click.stop="emit('close')"
      >
        {{ t('intro.skip') }}
      </button>
    </template>
  </div>
</template>

<style scoped>
.reel { position: absolute; inset: 0; overflow: hidden; background: #06080a; }
.reel.full { position: fixed; inset: 0; width: 100vw; height: 100dvh; z-index: 60; cursor: pointer; }
.frame { position: absolute; inset: -5%; background-size: cover; background-position: center; opacity: 0; transition: opacity 1.6s ease-in-out; transform: scale(1); }
.frame.on { opacity: 1; }
.frame.push { animation: bo-push 9s linear forwards; }
.frame.push.even { animation-name: bo-push-even; }
@keyframes bo-push { from { transform: scale(1) translate(0, 0); } to { transform: scale(1.08) translate(-1.2%, -0.8%); } }
@keyframes bo-push-even { from { transform: scale(1.06) translate(1%, 0.6%); } to { transform: scale(1) translate(0, 0); } }
.vignette { position: absolute; inset: 0; background: linear-gradient(180deg, rgba(6, 8, 10, 0.35), rgba(6, 8, 10, 0) 30%, rgba(6, 8, 10, 0) 60%, rgba(6, 8, 10, 0.9)); pointer-events: none; }
.caption { position: absolute; left: 8%; right: 8%; bottom: 14%; font-size: clamp(22px, 3.4vw, 44px); font-weight: 600; letter-spacing: 0.03em; color: #f2f7fa; text-shadow: 0 2px 18px rgba(0, 0, 0, 0.7); text-align: center; }
.cap-enter-active, .cap-leave-active { transition: opacity 0.6s ease, transform 0.6s ease; }
.cap-enter-from { opacity: 0; transform: translateY(10px); }
.cap-leave-to { opacity: 0; }
.strip { position: absolute; left: 8%; right: 8%; bottom: 8%; display: flex; gap: 6px; }
.seg { flex: 1; height: 3px; background: rgba(242, 247, 250, 0.18); border-radius: 2px; overflow: hidden; position: relative; }
.seg.done { background: var(--accent); }
.seg.on::after { content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 100%; background: var(--accent); transform-origin: left; animation: bo-fill linear forwards; }
@keyframes bo-fill { from { transform: scaleX(0); } to { transform: scaleX(1); } }
.close { position: absolute; right: 28px; top: 24px; font-size: 11px; letter-spacing: 0.14em; color: var(--fg-2); background: rgba(6, 9, 12, 0.55); border: 1px solid rgba(215, 245, 230, 0.35); border-radius: 5px; padding: 8px 14px; cursor: pointer; }
@media (prefers-reduced-motion: reduce) { .frame { transition-duration: 0.01s; } .seg.on::after { animation: none; transform: scaleX(1); } }
</style>
