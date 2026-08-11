import { del, get, set, update } from 'idb-keyval';
import type { Bootstrap, Op } from '../api/types';

const OUTBOX_KEY = 'outbox';
const BOOTSTRAP_KEY = 'bootstrap';

export interface QueuedOp extends Op {
  queuedAt: string;
  attempts: number;
  lastError?: string;
  /**
   * The Sheet looked at this and said no. Only ever set from a per-op failure —
   * never from a network error, which says nothing about the write itself.
   */
  rejected?: boolean;
}

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

/**
 * Records a failed attempt. **Never removes anything.**
 *
 * This used to drop an op after five attempts, on the theory that one bad row
 * shouldn't wedge the queue. It also counted network failures, so five moments
 * without signal — five app launches in a dead spot — silently binned every
 * trip waiting to sync. People saw "Saved" and the write was thrown away.
 *
 * A write now leaves the queue when the Sheet accepts it, or when a human
 * discards it on purpose. Nothing else.
 *
 * `rejected` separates the two kinds of failure: the Sheet refused this write
 * (needs a person) versus we couldn't reach the Sheet (keep trying — that is
 * what offline means).
 */
export async function markAttempted(
  clientIds: string[],
  error: string,
  rejected = false,
): Promise<void> {
  const touched = new Set(clientIds);
  await update<QueuedOp[]>(OUTBOX_KEY, (current) =>
    (current ?? []).map((op) =>
      touched.has(op.clientId)
        ? { ...op, attempts: op.attempts + 1, lastError: error, rejected: rejected || op.rejected }
        : op,
    ),
  );
}

/** Clears the rejected flag so a retry starts clean. */
export async function unmarkRejected(clientIds: string[]): Promise<void> {
  const touched = new Set(clientIds);
  await update<QueuedOp[]>(OUTBOX_KEY, (current) =>
    (current ?? []).map((op) =>
      touched.has(op.clientId) ? { ...op, rejected: false, lastError: undefined } : op,
    ),
  );
}

/**
 * One line naming what a queued write was, for when it has to be shown to a
 * person. "completeTrip" tells them nothing; "Trip to Zavial" tells them
 * whether they care.
 */
export function describeOp(op: Op): string {
  const p = op.payload as unknown as Record<string, unknown>;
  const where = (p.destination as string) || '';
  switch (op.op) {
    case 'completeTrip':
      return where ? `Trip to ${where}` : 'A logged trip';
    case 'editTrip':
      return where ? `Edit of the ${where} trip` : 'An edited trip';
    case 'deleteTrip':
      return 'A deleted trip';
    case 'createReservation':
      return where ? `Booking for ${where}` : 'A booking';
    case 'editReservation':
      return where ? `Change to the ${where} booking` : 'A changed booking';
    case 'cancelReservation':
      return 'A cancelled booking';
    case 'joinReservation':
    case 'joinRide':
      return `${p.name as string} ${p.join ? 'joining' : 'leaving'} a trip`;
    case 'logKarma':
      return `Karma: ${(p.action as string) || 'something'}`;
    case 'deleteKarma':
      return 'A removed karma point';
    case 'settleUp':
      return `Settle-up between ${p.from as string} and ${p.to as string}`;
    case 'logPayment':
      return `Payment from ${p.name as string}`;
    case 'requestRide':
      return 'A lift request';
    case 'claimRide':
      return 'A claimed lift';
    case 'cancelRide':
      return 'A cancelled lift';
    case 'logRide':
      return 'A logged lift';
    default:
      return op.op;
  }
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
