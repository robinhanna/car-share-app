import { useEffect, useState } from 'preact/hooks';
import { fetchBootstrap, isConfigured, newClientId, postOps } from '../api/client';
import type { Bootstrap, Op, OpName, OpPayload } from '../api/types';
import {
  cacheBootstrap,
  clearLocal,
  enqueue,
  readCachedBootstrap,
  readOutbox,
  type QueuedOp,
} from '../offline/outbox';
import { flushOutbox } from '../offline/sync';

export interface AppState {
  bootstrap: Bootstrap | null;
  pending: QueuedOp[];
  loading: boolean;
  syncing: boolean;
  online: boolean;
  error: string | null;
  /** true once we've shown something — cached or live — so the UI can stop spinning. */
  ready: boolean;
}

let state: AppState = {
  bootstrap: null,
  pending: [],
  loading: true,
  syncing: false,
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  error: null,
  ready: false,
};

const listeners = new Set<(s: AppState) => void>();

function setState(patch: Partial<AppState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn(state));
}

export function useApp(): AppState {
  const [local, setLocal] = useState(state);
  useEffect(() => {
    listeners.add(setLocal);
    setLocal(state);
    return () => {
      listeners.delete(setLocal);
    };
  }, []);
  return local;
}

async function refreshPending() {
  setState({ pending: await readOutbox() });
}

/** Cache first so the app is usable instantly and offline, then go to the network. */
export async function init(): Promise<void> {
  const cached = await readCachedBootstrap();
  if (cached) setState({ bootstrap: cached, ready: true });
  await refreshPending();

  if (!isConfigured()) {
    setState({ loading: false, ready: true, error: 'API_URL is not set for this build.' });
    return;
  }

  window.addEventListener('online', () => {
    setState({ online: true });
    void sync();
  });
  window.addEventListener('offline', () => setState({ online: false }));

  await sync();
  setState({ loading: false });
}

/** Push whatever is queued, then pull fresh data. */
export async function sync(): Promise<void> {
  if (!isConfigured() || !navigator.onLine) return;
  setState({ syncing: true, error: null });
  try {
    const flushed = await flushOutbox();
    await refreshPending();

    if (flushed.bootstrap) {
      setState({ bootstrap: flushed.bootstrap, ready: true });
    } else {
      const fresh = await fetchBootstrap();
      await cacheBootstrap(fresh);
      setState({ bootstrap: fresh, ready: true });
    }
    if (flushed.failed) setState({ error: `${flushed.failed} change(s) were rejected by the Sheet.` });
  } catch (err) {
    setState({ error: err instanceof Error ? err.message : String(err) });
  } finally {
    setState({ syncing: false, loading: false });
  }
}

/**
 * Every write goes through here: queued locally first, then flushed. The screen
 * that calls this can navigate away immediately — nothing depends on the
 * request succeeding.
 */
export async function queueOp(op: OpName, payload: OpPayload): Promise<string> {
  const clientId = newClientId();
  const entry: Op = { clientId, op, payload };
  await enqueue(entry);
  await refreshPending();
  void sync();
  return clientId;
}

export function getState(): AppState {
  return state;
}

/**
 * Testing only: clears the Sheet's three log tabs and this device's local state.
 *
 * Deliberately not routed through the outbox — a destructive action queued up to
 * fire whenever a phone next finds signal is exactly the wrong behaviour. It
 * runs now, online, or not at all. The backend takes a backup before clearing.
 */
export async function resetAllData(): Promise<{ cleared: unknown; backup: string }> {
  if (!navigator.onLine) throw new Error('Reset needs a connection.');

  const response = await postOps([
    { clientId: newClientId(), op: 'resetTestData', payload: { confirm: 'RESET' } },
  ]);

  const result = response.results?.[0];
  if (!result?.ok) throw new Error(result?.error ?? 'Reset was rejected.');

  await clearLocal();
  setState({ bootstrap: null, pending: [], ready: false, loading: true });
  await sync();

  return result.data as { cleared: unknown; backup: string };
}
