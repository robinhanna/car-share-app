/**
 * A destination is stored as one string — "Lagos · Groceries" — but edited as a
 * place and an activity separately. Both the booking form and the trip form
 * need to take one apart again, so the rule lives in one place.
 */
export interface DestinationParts {
  place: string;
  activity: string;
}

const SEP = ' · ';

export function joinDestination(place: string, activity: string): string {
  return [place, activity].filter(Boolean).join(SEP);
}

/** Splits on the first separator only: an activity never contains one, a place might. */
export function splitDestination(stored: string): DestinationParts {
  const at = stored.indexOf(SEP);
  if (at === -1) return { place: stored, activity: '' };
  return { place: stored.slice(0, at), activity: stored.slice(at + SEP.length) };
}
