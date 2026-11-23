/** Whether the first-start wizard has been completed or skipped on this device. */
const KEY = 'inbalans.onboarded';

export function isOnboarded(): boolean {
  try {
    return localStorage.getItem(KEY) === '1';
  } catch {
    return true;
  }
}

export function markOnboarded(): void {
  try {
    localStorage.setItem(KEY, '1');
  } catch {
    /* ignore */
  }
}

export function resetOnboarding(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
