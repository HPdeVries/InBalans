/** Browser detection, install state and persistent storage, used to give advice that fits the device. */
import { writable } from 'svelte/store';

export type Browser = 'edge' | 'chrome' | 'samsung' | 'firefox' | 'safari-ios' | 'safari-mac' | 'other';

export function detectBrowser(ua = navigator.userAgent, platform = navigator.platform, touchPoints = navigator.maxTouchPoints): Browser {
  const iOS = /iPhone|iPad|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
  // On iOS every browser uses Safari's engine and installing works through Safari's share menu.
  if (iOS) return 'safari-ios';
  if (/Edg\//.test(ua)) return 'edge';
  if (/SamsungBrowser\//.test(ua)) return 'samsung';
  if (/Firefox\//.test(ua)) return 'firefox';
  if (/Chrome\//.test(ua)) return 'chrome';
  if (/Safari\//.test(ua) && /Macintosh/.test(ua)) return 'safari-mac';
  return 'other';
}

/** Running as an installed app (home screen / desktop app window). */
export function isInstalled(): boolean {
  return (
    matchMedia?.('(display-mode: standalone)').matches ||
    matchMedia?.('(display-mode: window-controls-overlay)').matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Whether persistent storage is granted: null = unknown / not supported. */
export const persisted = writable<boolean | null>(null);
export const storageSupported = typeof navigator !== 'undefined' && !!navigator.storage?.persist;

export async function checkPersisted(): Promise<boolean | null> {
  const value = storageSupported ? await navigator.storage.persisted().catch(() => null) : null;
  persisted.set(value);
  return value;
}

/**
 * Ask the browser. Chrome and Edge decide silently (usually only for installed or often used sites),
 * Firefox asks the user. The answer is only yes or no, never a reason.
 */
export async function requestPersisted(): Promise<boolean> {
  if (!storageSupported) {
    persisted.set(null);
    return false;
  }
  const value = (await navigator.storage.persisted().catch(() => false)) || (await navigator.storage.persist().catch(() => false));
  persisted.set(value);
  return value;
}

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

/** The browser's install offer (Chrome, Edge, Samsung), kept so we can show our own install button. */
export const installPrompt = writable<BeforeInstallPromptEvent | null>(null);
export const installed = writable<boolean>(false);

export async function promptInstall(): Promise<boolean> {
  let event: BeforeInstallPromptEvent | null = null;
  installPrompt.update((e) => ((event = e), e));
  if (!event) return false;
  await (event as BeforeInstallPromptEvent).prompt();
  const { outcome } = await (event as BeforeInstallPromptEvent).userChoice;
  installPrompt.set(null);
  return outcome === 'accepted';
}

/** Called once at start. After installing, persistent storage is asked again automatically. */
export function watchInstall(): void {
  installed.set(isInstalled());
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt.set(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    installed.set(true);
    installPrompt.set(null);
    // Give the browser a moment to register the installation.
    setTimeout(() => void requestPersisted(), 1000);
  });
  void checkPersisted();
}
