import { useState } from 'preact/hooks';
import { newClientId } from '../api/client';
import type { Reservation } from '../api/types';
import { QUICK_DESTINATIONS, QUICK_DURATIONS } from '../config';
import { localDateTimeInput } from '../lib/dates';
import { queueOp, useApp } from '../state/store';
import { DestinationPicker, type DestinationValue } from './DestinationPicker';
import { RiderPicker } from './RiderPicker';

interface Props {
  me: string;
  /** Set when changing a booking that already exists. */
  reservation?: Reservation;
  onDone: () => void;
}

export function Reserve({ me, reservation, onDone }: Props) {
  const { bootstrap } = useApp();
  const reservations = bootstrap?.reservations ?? [];
  const editing = !!reservation;

  const [start, setStart] = useState(
    reservation ? localDateTimeInput(new Date(reservation.start)) : defaultStart(),
  );
  const [end, setEnd] = useState(
    reservation ? localDateTimeInput(new Date(reservation.end)) : defaultEnd(),
  );
  const [destination, setDestination] = useState<DestinationValue>(
    splitDestination(reservation?.destination ?? ''),
  );
  const [riders, setRiders] = useState<string[]>(reservation?.riders ?? []);
  const [notes, setNotes] = useState(reservation?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const validRange = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs;

  // Only offer a shortcut to somewhere the sheet can actually price. Robin edits
  // the Places and Surf Spots tabs by hand, and a chip left pointing at a
  // renamed place would book a destination the distance lookup returns nothing
  // for. Dropping it is quiet, and the full picker below still works.
  const known = new Set([
    ...(bootstrap?.spots ?? []).map((s) => s.name),
    ...(bootstrap?.places ?? []).map((p) => p.name),
  ]);
  const quickPlaces = QUICK_DESTINATIONS.filter((name) => known.has(name));

  // Measured from whatever From currently says, so a duration composes with a
  // start time you've already adjusted instead of dragging it back to now.
  const setDuration = (minutes: number) => {
    const from = Number.isNaN(startMs) ? new Date(defaultStart()) : new Date(startMs);
    if (Number.isNaN(startMs)) setStart(localDateTimeInput(from));
    const to = new Date(from.getTime() + minutes * 60_000);
    setEnd(localDateTimeInput(to));
  };

  // Advisory only: a queued reservation on someone else's phone can't be seen
  // until it syncs, so this catches the common case, not every case.
  // Skipping the booking being edited matters — otherwise it always overlaps
  // itself and the driver is warned about their own reservation on every save.
  const clash = reservations.find(
    (r) =>
      r.id !== reservation?.id &&
      new Date(r.start).getTime() < endMs &&
      new Date(r.end).getTime() > startMs,
  );

  const save = async () => {
    setSaving(true);
    const common = {
      riders,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      destination: [destination.place, destination.activity].filter(Boolean).join(' · '),
      notes,
    };
    if (reservation) {
      await queueOp('editReservation', { ...common, id: reservation.id });
    } else {
      await queueOp('createReservation', { ...common, id: newClientId(), driver: me });
    }
    onDone();
  };

  return (
    <>
      <p class="kicker">{editing ? 'Editing' : 'Booking'}</p>
      <h1>{editing ? 'Change this booking' : 'Reserve the car'}</h1>
      <div class="spacer" />

      {/* The fast path: a run to Burgau shouldn't cost the same six taps as a
          day trip. These fill the form in rather than booking outright, so the
          two rows combine and a stray tap costs nothing. */}
      <div class="field">
        <span>Quick book — how long</span>
        <div class="chips">
          {QUICK_DURATIONS.map((minutes) => (
            <button
              key={minutes}
              class="chip"
              aria-pressed={validRange && endMs - startMs === minutes * 60_000}
              onClick={() => setDuration(minutes)}
            >
              {durationLabel(minutes)}
            </button>
          ))}
        </div>
      </div>

      {quickPlaces.length > 0 && (
        <div class="field">
          <span>Quick book — where</span>
          <div class="chips">
            {quickPlaces.map((name) => {
              const on = destination.place === name;
              return (
                <button
                  key={name}
                  class="chip"
                  aria-pressed={on}
                  // Tapping the active one clears it, same as the rider chips.
                  onClick={() =>
                    setDestination(on ? { place: '', activity: '' } : { place: name, activity: '' })
                  }
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <label class="field">
        <span>From</span>
        <input
          type="datetime-local"
          value={start}
          onInput={(e) => setStart((e.target as HTMLInputElement).value)}
        />
      </label>

      <label class="field">
        <span>Until</span>
        <input
          type="datetime-local"
          value={end}
          onInput={(e) => setEnd((e.target as HTMLInputElement).value)}
        />
      </label>

      {clash && (
        <div class="banner banner--error">
          {clash.driver} already has the car then. Book anyway only if you've agreed with them.
        </div>
      )}

      <DestinationPicker
        value={destination}
        onChange={setDestination}
        label="Where to (optional)"
      />

      <RiderPicker
        me={me}
        selected={riders}
        onChange={setRiders}
        label="Who else will be in the car?"
      />

      <label class="field">
        <span>Notes</span>
        <input
          type="text"
          value={notes}
          placeholder="optional"
          onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
        />
      </label>

      {/* Sticky, or two taps at the top of the form are followed by a scroll to
          the bottom — which isn't quick. */}
      <div class="sticky-action">
        <button class="btn" disabled={!validRange || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Reserve'}
        </button>
        {!validRange && <p class="muted center">The end time has to be after the start.</p>}
      </div>
    </>
  );
}

function durationLabel(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = minutes / 60;
  return `${hours} ${hours === 1 ? 'hour' : 'hours'}`;
}

/**
 * The reverse of the join in save(): a destination is stored as "place · activity".
 * Splitting on the first separator only, since an activity never contains one but
 * a place name conceivably could.
 */
function splitDestination(stored: string): DestinationValue {
  const at = stored.indexOf(' · ');
  if (at === -1) return { place: stored, activity: '' };
  return { place: stored.slice(0, at), activity: stored.slice(at + 3) };
}

/** Rounded to the next half hour, in the phone's own timezone. */
function defaultStart(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() > 30 ? 60 : 30, 0, 0);
  return localDateTimeInput(d);
}

function defaultEnd(): string {
  const d = new Date(defaultStart());
  d.setHours(d.getHours() + 3);
  return localDateTimeInput(d);
}
