/**
 * Device PIN for the screen lock. The PIN is never stored: only a salted PBKDF2 hash.
 * This is a screen lock, not encryption: it stops someone who picks up the device,
 * the data itself stays readable for anyone with access to the browser profile.
 */

export interface PinConfig {
  salt: string;
  hash: string;
  iterations: number;
  /** Minutes without use before locking; 0 = as soon as the app is left. */
  autoLockMinutes: number;
}

export interface PinThrottle {
  failures: number;
  /** Epoch ms until which no attempt is accepted. */
  blockedUntil: number;
}

export const PIN_PATTERN = /^\d{4,8}$/;
export const AUTO_LOCK_OPTIONS = [0, 1, 5, 15, 60] as const;
export const DEFAULT_AUTO_LOCK = 5;
const ITERATIONS = 310_000;
/** Free attempts before waiting is required. */
const FREE_ATTEMPTS = 5;

const enc = new TextEncoder();

function toHex(bytes: Uint8Array): string {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

async function derive(pin: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', enc.encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
  return toHex(new Uint8Array(bits));
}

export async function createPinConfig(pin: string, autoLockMinutes = DEFAULT_AUTO_LOCK, iterations = ITERATIONS): Promise<PinConfig> {
  if (!PIN_PATTERN.test(pin)) throw new Error('invalid-pin');
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: toHex(salt), hash: await derive(pin, salt, iterations), iterations, autoLockMinutes };
}

export async function verifyPin(pin: string, config: PinConfig): Promise<boolean> {
  const hash = await derive(pin, fromHex(config.salt), config.iterations);
  let diff = hash.length ^ config.hash.length;
  for (let i = 0; i < Math.min(hash.length, config.hash.length); i++) diff |= hash.charCodeAt(i) ^ config.hash.charCodeAt(i);
  return diff === 0;
}

/** After 5 wrong attempts: wait 30 s, doubling per further failure, at most 1 hour. */
export function registerFailure(t: PinThrottle, now = Date.now()): PinThrottle {
  const failures = t.failures + 1;
  const wait = failures < FREE_ATTEMPTS ? 0 : Math.min(30_000 * 2 ** (failures - FREE_ATTEMPTS), 3_600_000);
  return { failures, blockedUntil: now + wait };
}

export const NO_THROTTLE: PinThrottle = { failures: 0, blockedUntil: 0 };
