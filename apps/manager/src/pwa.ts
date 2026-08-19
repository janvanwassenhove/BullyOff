/**
 * PWA glue (Phase 9): service-worker registration with an explicit update prompt (never a silent
 * reload mid-match), offline-ready notice, and the browser's install prompt when it offers one.
 */
import { ref } from 'vue';
import { registerSW } from 'virtual:pwa-register';

export const offlineReady = ref(false);
export const needRefresh = ref(false);
export const canInstall = ref(false);

let updateSW: ((reload?: boolean) => Promise<void>) | null = null;
let deferredInstall: { prompt(): Promise<void> } | null = null;

export function setupPwa(): void {
  if (!('serviceWorker' in navigator)) return;
  updateSW = registerSW({
    immediate: true,
    onOfflineReady() { offlineReady.value = true; setTimeout(() => { offlineReady.value = false; }, 6000); },
    onNeedRefresh() { needRefresh.value = true; },
  });
  window.addEventListener('beforeinstallprompt', (e: Event) => {
    e.preventDefault();
    deferredInstall = e as unknown as { prompt(): Promise<void> };
    canInstall.value = true;
  });
  window.addEventListener('appinstalled', () => { canInstall.value = false; deferredInstall = null; });
}

export async function applyUpdate(): Promise<void> { needRefresh.value = false; await updateSW?.(true); }
export async function promptInstall(): Promise<void> { if (deferredInstall) { await deferredInstall.prompt(); canInstall.value = false; deferredInstall = null; } }
