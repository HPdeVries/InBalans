/** Screen lock state and auto-lock. Device-level: stored in localStorage, never synced. */
import { writable, get } from 'svelte/store';
import { account } from '../sync/account';
import { wipeDevice } from './reset';
import {
  createPinConfig,
  DEFAULT_AUTO_LOCK,
  NO_THROTTLE,
  registerFailure,
  verifyPin,
  type PinConfig,
  type PinThrottle,
} from './pin';

const CONFIG_KEY = 'inbalans.pin';
const THROTTLE_KEY = 'inbalans.pinThrottle';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: the lock simply is not kept */
  }
}

/** A PIN makes no sense on a shared device: nothing is kept there. */
export const lockSupported = account?.deviceMode !== 'shared';

const initial = lockSupported ? read<PinConfig>(CONFIG_KEY) : null;
export const pinConfig = writable<PinConfig | null>(initial);
/** Locked on every start when a PIN is set. */
export const locked = writable<boolean>(!!initial);

export async function setPin(pin: string, autoLockMinutes = get(pinConfig)?.autoLockMinutes ?? DEFAULT_AUTO_LOCK) {
  const config = await createPinConfig(pin, autoLockMinutes);
  write(CONFIG_KEY, config);
  write(THROTTLE_KEY, null);
  pinConfig.set(config);
}

export function setAutoLock(minutes: number): void {
  const config = get(pinConfig);
  if (!config) return;
  const next = { ...config, autoLockMinutes: minutes };
  write(CONFIG_KEY, next);
  pinConfig.set(next);
}

/** Turning the lock off requires the current PIN. */
export async function removePin(currentPin: string): Promise<boolean> {
  const config = get(pinConfig);
  if (!config || !(await verifyPin(currentPin, config))) return false;
  write(CONFIG_KEY, null);
  write(THROTTLE_KEY, null);
  pinConfig.set(null);
  return true;
}

export function lockNow(): void {
  if (get(pinConfig)) locked.set(true);
}

export function throttle(): PinThrottle {
  return read<PinThrottle>(THROTTLE_KEY) ?? NO_THROTTLE;
}

export type UnlockResult = { ok: true } | { ok: false; blockedUntil: number; failures: number };

export async function unlock(pin: string): Promise<UnlockResult> {
  const config = get(pinConfig);
  if (!config) {
    locked.set(false);
    return { ok: true };
  }
  const t = throttle();
  if (Date.now() < t.blockedUntil) return { ok: false, ...t };
  if (await verifyPin(pin, config)) {
    write(THROTTLE_KEY, null);
    locked.set(false);
    return { ok: true };
  }
  const next = registerFailure(t);
  write(THROTTLE_KEY, next);
  return { ok: false, ...next };
}

/**
 * PIN forgotten: delete the data on this device. With sync the data stays in the account
 * (unsynced changes are pushed first when possible) and comes back after logging in again;
 * without sync the user can restore a backup in the welcome screen.
 */
export async function forgetPinAndWipe(): Promise<void> {
  await wipeDevice();
}

/** Lock after the configured time without use, and when returning to the app after that time. */
export function startAutoLock(): void {
  let lastActivity = Date.now();
  let hiddenAt: number | null = null;
  const limit = () => (get(pinConfig)?.autoLockMinutes ?? DEFAULT_AUTO_LOCK) * 60_000;
  const touch = () => (lastActivity = Date.now());
  for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) window.addEventListener(ev, touch, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (!get(pinConfig)) return;
    if (document.visibilityState === 'hidden') {
      hiddenAt = Date.now();
      if (limit() === 0) lockNow();
    } else if (hiddenAt !== null && Date.now() - hiddenAt >= limit()) {
      lockNow();
    }
  });
  setInterval(() => {
    const ms = limit();
    if (get(pinConfig) && !get(locked) && ms > 0 && Date.now() - lastActivity >= ms) lockNow();
  }, 15_000);
}
