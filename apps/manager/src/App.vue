<script setup lang="ts">
import { useAppStore } from './stores/app';

const app = useAppStore();
</script>

<template>
  <main class="shell">
    <h1 class="title">BULLY OFF</h1>
    <p class="sub">Phase {{ app.phase }} — {{ app.phaseTitle }}</p>
    <p class="hint">Deterministic field hockey. Nothing to see yet; the engine comes first.</p>
  </main>
</template>

<style scoped>
.shell {
  min-height: 100dvh;
  display: grid;
  place-content: center;
  text-align: center;
  padding: var(--space-6);
}
.title {
  font-size: var(--text-3xl);
  letter-spacing: 0.18em;
  font-weight: 800;
  color: var(--color-turf-100);
}
.sub {
  margin-top: var(--space-2);
  color: var(--color-fg-muted);
}
.hint {
  margin-top: var(--space-6);
  max-width: 32ch;
  color: var(--color-fg-muted);
  font-size: var(--text-sm);
}
</style>
