import { useState } from 'preact/hooks';
import { newClientId } from '../api/client';
import { localDateTimeInput } from '../lib/dates';
import { queueOp, useApp } from '../state/store';
import { DestinationPicker, type DestinationValue } from './DestinationPicker';
import { RiderPicker } from './RiderPicker';

interface Props {
  me: string;
  onDone: () => void;
}

export function Reserve({ me, onDone }: Props) {
  const { bootstrap } = useApp();
  const reservations = bootstrap?.reservations ?? [];

  const [start, setStart] = useState(defaultStart());
  const [end, setEnd] = useState(defaultEnd());
  const [destination, setDestination] = useState<DestinationValue>({ place: '', activity: '' });
  const [riders, setRiders] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const startMs = new Date(start).getTime();
  const endMs = new Date(end).getTime();
  const validRange = !Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs > startMs;

  // Advisory only: a queued reservation on someone else's phone can't be seen
  // until it syncs, so this catches the common case, not every case.
  const clash = reservations.find(
    (r) => new Date(r.start).getTime() < endMs && new Date(r.end).getTime() > startMs,
  );

  const save = async () => {
    setSaving(true);
    await queueOp('createReservation', {
      id: newClientId(),
      driver: me,
      riders,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      destination: [destination.place, destination.activity].filter(Boolean).join(' · '),
      notes,
    });
    onDone();
  };

  return (
    <>
      <p class="kicker">Booking</p>
      <h1>Reserve the car</h1>
      <div class="spacer" />

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

      <button class="btn" disabled={!validRange || saving} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Reserve'}
      </button>
      {!validRange && <p class="muted center">The end time has to be after the start.</p>}
    </>
  );
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
