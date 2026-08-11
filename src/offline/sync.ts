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

  const allIds = queued.map((q) => q.clientId);

  let response;
  try {
    response = await postOps(ops);
  } catch (err) {
    // Couldn't reach the Sheet. That says nothing about the writes themselves,
    // so they stay queued and unrejected — this is the ordinary offline path.
    await markAttempted(allIds, err instanceof Error ? err.message : String(err));
    throw err;
  }

  // A batch rejected outright — a bad token, or doPost throwing — comes back
  // with no `results` at all. That used to fall straight through as
  // { sent: 0, failed: 0 }: the queue sat there and the app reported success.
  if (response.ok === false) {
    const error = response.error ?? 'The Sheet rejected the whole batch.';
    await markAttempted(allIds, error);
    throw new Error(error);
  }

  const results = response.results ?? [];
  const succeeded = results.filter((r) => r.ok).map((r) => r.clientId);
  const failed = results.filter((r) => !r.ok);

  await removeFromOutbox(succeeded);
  if (failed.length) {
    // Per-op refusal: the Sheet read this one and said no. Flagged for a person
    // to look at rather than retried into the void.
    await Promise.all(
      failed.map((r) => markAttempted([r.clientId], r.error ?? 'Rejected by the Sheet', true)),
    );
  }

  if (response.data) await cacheBootstrap(response.data);

  return { sent: succeeded.length, failed: failed.length, bootstrap: response.data ?? null };
}
