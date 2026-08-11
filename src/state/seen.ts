/**
 * What each phone has already been told about.
 *
 * Maps a reservation id to the `updated` timestamp its owner last acknowledged.
 * A booking whose `updated` has moved past that is one the driver changed since
 * you last looked — which is what raises the "changed" pill.
 *
 * Local to the phone on purpose. "Has Jonas seen this yet" is a fact about
 * Jonas's phone, not about the booking, and putting it in the Sheet would mean
 * a column per person.
 */
const KEY = 'car-share:seen';

type Seen = Record<string, string>;

export function getSeen(): Seen {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : {};
  } catch {
    // Private mode, or something else wrote nonsense here. No pills is a much
    // better failure than a pill that can never be cleared.
    return {};
  }
}

/** Records where a booking had got to. Returns the updated map for re-rendering. */
export function markSeen(id: string, updated: string): Seen {
  const next = { ...getSeen(), [id]: updated || '' };
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* ignore — the pill just comes back next launch */
  }
  return next;
}

/**
 * True when the driver has changed this booking since you last looked.
 *
 * A booking with no record yet is *not* changed: the first time you see one it
 * should look like news, not like an alteration. Home seeds those silently.
 */
export function hasChanged(seen: Seen, id: string, updated: string): boolean {
  if (!updated) return false;
  const known = seen[id];
  if (known === undefined) return false;
  // Not `>`. A reservation's signal is a timestamp that only moves forward, but
  // a lift's is `status:driver` — "claimed:Robin" versus "open:" — where
  // ordering means nothing. Difference is the thing that matters either way.
  return updated !== known;
}
