import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Op } from '../api/types';

// idb-keyval wants a real IndexedDB. The logic under test is the queue's own
// rules, so an in-memory stand-in is enough and keeps the test honest about
// what it's checking.
const store = new Map<string, unknown>();
vi.mock('idb-keyval', () => ({
  get: async (k: string) => store.get(k),
  set: async (k: string, v: unknown) => void store.set(k, v),
  del: async (k: string) => void store.delete(k),
  update: async (k: string, fn: (v: unknown) => unknown) => void store.set(k, fn(store.get(k))),
}));

const postOps = vi.fn();
vi.mock('../api/client', () => ({
  postOps: (...args: unknown[]) => postOps(...args),
  newClientId: () => 'id',
  isConfigured: () => true,
  fetchBootstrap: async () => null,
}));

const { enqueue, readOutbox } = await import('./outbox');
const { flushOutbox } = await import('./sync');

const trip = (clientId: string): Op => ({
  clientId,
  op: 'completeTrip',
  payload: { destination: 'Zavial' } as Op['payload'],
});

beforeEach(async () => {
  store.clear();
  postOps.mockReset();
});

describe('the outbox never throws a write away', () => {
  // The bug this exists for: markAttempted used to drop an op after five failed
  // attempts, and network failures counted. Five app launches without signal
  // silently binned every trip waiting to sync, after the person had seen
  // "Saved". Nothing about that is acceptable, so it gets a test.
  it('survives five consecutive network failures', async () => {
    await enqueue(trip('a'));
    await enqueue(trip('b'));
    postOps.mockRejectedValue(new Error('Failed to fetch'));

    for (let i = 0; i < 5; i++) {
      await flushOutbox().catch(() => {});
    }

    const queued = await readOutbox();
    expect(queued.map((q) => q.clientId)).toEqual(['a', 'b']);
    expect(queued[0].attempts).toBe(5);
    // A network failure says nothing about the write itself.
    expect(queued[0].rejected).toBeFalsy();
  });

  it('keeps a write the Sheet refused, and flags it for a person', async () => {
    await enqueue(trip('a'));
    postOps.mockResolvedValue({
      ok: true,
      results: [{ clientId: 'a', ok: false, error: 'Trip not found: a' }],
    });

    await flushOutbox();

    const [queued] = await readOutbox();
    expect(queued.clientId).toBe('a');
    expect(queued.rejected).toBe(true);
    expect(queued.lastError).toBe('Trip not found: a');
  });

  it('keeps everything when the whole batch is rejected', async () => {
    // A bad token comes back as { ok: false } with no results at all. That used
    // to report { sent: 0, failed: 0 } — a phantom success over a stuck queue.
    await enqueue(trip('a'));
    postOps.mockResolvedValue({ ok: false, error: 'Bad token' });

    await expect(flushOutbox()).rejects.toThrow('Bad token');

    const queued = await readOutbox();
    expect(queued).toHaveLength(1);
    expect(queued[0].rejected).toBeFalsy();
  });

  it('removes a write once the Sheet has taken it', async () => {
    await enqueue(trip('a'));
    await enqueue(trip('b'));
    postOps.mockResolvedValue({
      ok: true,
      results: [
        { clientId: 'a', ok: true },
        { clientId: 'b', ok: true },
      ],
    });

    const result = await flushOutbox();

    expect(result.sent).toBe(2);
    expect(await readOutbox()).toHaveLength(0);
  });

  it('keeps the good ones and holds back only the refused one', async () => {
    await enqueue(trip('a'));
    await enqueue(trip('b'));
    postOps.mockResolvedValue({
      ok: true,
      results: [
        { clientId: 'a', ok: true },
        { clientId: 'b', ok: false, error: 'Unknown op' },
      ],
    });

    await flushOutbox();

    const queued = await readOutbox();
    expect(queued.map((q) => q.clientId)).toEqual(['b']);
    expect(queued[0].rejected).toBe(true);
  });
});
