<script setup lang="ts">
import { ENGINE_VERSION } from '@bullyoff/engine';
import { SAVE_VERSION } from '@bullyoff/season';
</script>

<template>
  <article class="about">
    <h2>{{ $t('about.title') }}</h2>
    <p>{{ $t('about.intro') }}</p>
    <h3>{{ $t('about.privacyTitle') }}</h3>
    <ul>
      <li>{{ $t('about.privacy1') }}</li>
      <li>{{ $t('about.privacy2') }}</li>
      <li>{{ $t('about.privacy3') }}</li>
      <li>{{ $t('about.privacy4') }}</li>
    </ul>
    <h3>{{ $t('about.offlineTitle') }}</h3>
    <p>{{ $t('about.offline') }}</p>
    <h3>{{ $t('about.creditsTitle') }}</h3>
    <p>{{ $t('about.credits') }}</p>
    <p class="muted">
      {{ $t('about.version', { engine: ENGINE_VERSION, save: SAVE_VERSION }) }} · <a
        href="https://github.com/janvanwassenhove/BullyOff"
        rel="noopener"
        target="_blank"
      >github.com/janvanwassenhove/BullyOff</a>
    </p>
  </article>
</template>

<style scoped>
.about { max-width: 70ch; line-height: 1.55; display: flex; flex-direction: column; gap: var(--space-2); }
.about h2 { margin: 0; }
.about h3 { margin: var(--space-2) 0 0; font-size: var(--text-sm); text-transform: uppercase; letter-spacing: 0.06em; color: var(--color-fg-muted); }
.about ul { margin: 0; padding-left: 18px; display: flex; flex-direction: column; gap: 6px; }
.muted { color: var(--color-fg-muted); font-size: var(--text-sm); }
a { color: var(--color-turf-100); }
</style>
