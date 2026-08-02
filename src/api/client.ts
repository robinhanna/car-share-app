import type { Bootstrap, Op, PostResponse } from './types';

declare const __API_URL__: string;
declare const __APP_TOKEN__: string;

export const API_URL: string = __API_URL__;
const TOKEN: string = __APP_TOKEN__;

/** In dev with no backend yet, fall back to the mock Sheet. */
const useMock = () => import.meta.env.DEV && API_URL.length === 0;

export const isConfigured = () => API_URL.length > 0 || useMock();

/**
 * Apps Script web apps can't answer a CORS preflight, so every request has to
 * stay a "simple" one: GET, or POST with Content-Type text/plain. Sending JSON
 * with the honest content type is what breaks this integration for most people.
 */
export async function fetchBootstrap(signal?: AbortSignal): Promise<Bootstrap> {
  if (useMock()) return (await import('./mock')).mockBootstrap();
  const res = await fetch(`${API_URL}?action=bootstrap`, { method: 'GET', signal });
  if (!res.ok) throw new Error(`Bootstrap failed: HTTP ${res.status}`);
  const body = await res.json();
  if (!body.ok) throw new Error(body.error || 'Bootstrap failed');
  return body.data as Bootstrap;
}

export async function postOps(ops: Op[], signal?: AbortSignal): Promise<PostResponse> {
  if (useMock()) return (await import('./mock')).mockPost(ops);
  const res = await fetch(API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ token: TOKEN, ops }),
    signal,
  });
  if (!res.ok) throw new Error(`Sync failed: HTTP ${res.status}`);
  const body = (await res.json()) as PostResponse;
  if (!body.ok) throw new Error(body.error || 'Sync failed');
  return body;
}

export function newClientId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
