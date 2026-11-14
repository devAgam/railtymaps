import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { motisGet, RouterError, usageLast24h } from '../lib/motis';

describe('fair-use budget', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('only counts searches from the last 24 hours', async () => {
    const now = Date.now();
    await fakeBrowser.storage.local.set({ usage: [now - 25 * 3600_000, now - 3600_000, now - 60_000] });
    expect(await usageLast24h()).toBe(2);
  });

  it('stops sending trip searches at the daily limit', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await fakeBrowser.storage.local.set({ usage: Array.from({ length: 700 }, () => Date.now()) });
    await expect(
      motisGet('https://api.transitous.org', '/api/v6/plan', new URLSearchParams(), { heavy: true }),
    ).rejects.toBeInstanceOf(RouterError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
