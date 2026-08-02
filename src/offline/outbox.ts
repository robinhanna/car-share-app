import { del, get, set, update } from 'idb-keyval';
import type { Bootstrap, Op } from '../api/types';

const OUTBOX_KEY = 'outbox';
const BOOTSTRAP_KEY = 'bootstrap';

export interface QueuedOp extends Op {
  queuedAt: string;
  attempts: number;
  lastError?: string;
}

/** Given up on after this many failed sync attempts, so one bad row can't wedge the queue. */
export const MAX_ATTEMPTS = 5;

export async function enqueue(op: Op): Promise<void> {
  await update<QueuedOp[]>(OUTBOX_KEY, (current) => [
    ...(current ?? []),
    { ...op, queuedAt: new Date().toISOString(), attempts: 0 },
  ]);
}

export async function readOutbox(): Promise<QueuedOp[]> {
  return (await get<QueuedOp[]>(OUTBOX_KEY)) ?? [];
}

export async function removeFromOutbox(clientIds: string[]): Promise<void> {
  if (!clientIds.length) return;
  const drop = new Set(clientIds);
  await update<QueuedOp[]>(OUTBOX_KEY, (current) =>
    (current ?? []).filter((op) => !drop.has(op.clientId)),
  );
}

export async function markAttempted(clientIds: string[], error: string): Promise<void> {
  const touched = new Set(clientIds);
  await update<QueuedOp[]>(OUTBOX_KEY, (current) =>
    (current ?? [])
      .map((op) =>
        touched.has(op.clientId)
          ? { ...op, attempts: op.attempts + 1, lastError: error }
          : op,
      )
      .filter((op) => op.attempts < MAX_ATTEMPTS),
  );
}

export async function cacheBootstrap(data: Bootstrap): Promise<void> {
  await set(BOOTSTRAP_KEY, data);
}

export async function readCachedBootstrap(): Promise<Bootstrap | null> {
  return (await get<Bootstrap>(BOOTSTRAP_KEY)) ?? null;
}

/** Drops this device's queue and cached copy — used by the testing reset. */
export async function clearLocal(): Promise<void> {
  await Promise.all([del(OUTBOX_KEY), del(BOOTSTRAP_KEY)]);
}
