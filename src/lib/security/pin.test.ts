import { describe, expect, it } from 'vitest';
import { createPinConfig, NO_THROTTLE, registerFailure, verifyPin } from './pin';

describe('device PIN', () => {
  it('verifies only the right PIN and never stores it', async () => {
    const config = await createPinConfig('482915', 5, 1000);
    expect(JSON.stringify(config)).not.toContain('482915');
    expect(await verifyPin('482915', config)).toBe(true);
    expect(await verifyPin('482916', config)).toBe(false);
    expect(await verifyPin('', config)).toBe(false);
    // Same PIN, different salt.
    expect((await createPinConfig('482915', 5, 1000)).hash).not.toBe(config.hash);
  });

  it('rejects PINs that are not 4-8 digits', async () => {
    await expect(createPinConfig('123')).rejects.toThrow('invalid-pin');
    await expect(createPinConfig('12a4')).rejects.toThrow('invalid-pin');
  });

  it('throttles after five failures', () => {
    let t = NO_THROTTLE;
    for (let i = 0; i < 4; i++) t = registerFailure(t, 0);
    expect(t.blockedUntil).toBe(0);
    t = registerFailure(t, 0);
    expect(t.blockedUntil).toBe(30_000);
    t = registerFailure(t, 0);
    expect(t.blockedUntil).toBe(60_000);
  });
});
