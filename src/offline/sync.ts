import { postOps } from '../api/client';
import type { Bootstrap } from '../api/types';
import { cacheBootstrap, markAttempted, readOutbox, removeFromOutbox } from './outbox';

export interface FlushResult {
  sent: number;
  failed: number;
  bootstrap: Bootstrap | null;
}

let inFlight: Promise<FlushResult> | null = null;

/**
 * Sends everything queued in one request. Runs on load, on `online`, and after
 * every write. Concurrent calls share the same promise so a reconnect that
 * fires several events can't send the same ops twice.
 */
export function flushOutbox(): Promise<FlushResult> {
  if (inFlight) return inFlight;
  inFlight = doFlush().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doFlush(): Promise<FlushResult> {
  const queued = await readOutbox();
  if (!queued.length) return { sent: 0, failed: 0, bootstrap: null };

  const ops = queued.map(({ clientId, op, payload }) => ({ clientId, op, payload }));

  let response;
  try {
    response = await postOps(ops);
  } catch (err) {
    // Network-level failure: nothing reached the Sheet, so keep everything
    // queued and count the attempt.
    await markAttempted(
      queued.map((q) => q.clientId),
      err instanceof Error ? err.message : String(err),
    );
    throw err;
  }

  const results = response.results ?? [];
  const succeeded = results.filter((r) => r.ok).map((r) => r.clientId);
  const failed = results.filter((r) => !r.ok);

  await removeFromOutbox(succeeded);
  if (failed.length) {
    await markAttempted(
      failed.map((r) => r.clientId),
      failed[0].error ?? 'Rejected by the Sheet',
    );
  }

  if (response.data) await cacheBootstrap(response.data);

  return { sent: succeeded.length, failed: failed.length, bootstrap: response.data ?? null };
}
