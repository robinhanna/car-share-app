import { useState } from 'preact/hooks';
import { newClientId } from '../api/client';
import type { RideRequest } from '../api/types';
import { localDateTimeInput, timeLabel } from '../lib/dates';
import { queueOp, useApp } from '../state/store';

interface Props {
  me: string;
  onDrive: (request: RideRequest) => void;
}

/**
 * Asking for a lift, and picking one up.
 *
 * The point of routing these through the app rather than shouting across the
 * kitchen is the cost rule: a claimed ride becomes a taxi run when it's logged,
 * so the driver pays nothing for doing someone a favour.
 */
export function Rides({ me, onDrive }: Props) {
  const { bootstrap } = useApp();
  const requests = bootstrap?.rideRequests ?? [];

  const mine = requests.filter(
    (r) => r.passenger === me || r.others.includes(me),
  );
  const others = requests.filter(
    (r) => r.passenger !== me && !r.others.includes(me) && r.status !== 'cancelled',
  );

  const [asking, setAsking] = useState(false);

  return (
    <>
      <p class="kicker">Lifts</p>
      <h1>Need a ride?</h1>
      <p class="muted">
        Ask, and whoever has the car can pick it up. The driver doesn't pay for the petrol on a
        lift — you do.
      </p>

      {asking ? (
        <AskForm me={me} onClose={() => setAsking(false)} />
      ) : (
        <>
          <div class="spacer" />
          <button class="btn" onClick={() => setAsking(true)}>
            Ask for a ride
          </button>
        </>
      )}

      {mine.length > 0 && (
        <>
          <p class="section-title">Mine</p>
          <ul class="list">
            {mine.map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.to || 'A ride'}</strong>
                  {r.from ? ` from ${r.from}` : ''}
                  <br />
                  <span class="muted">
                    {timeLabel(r.when)} · <StatusLine request={r} />
                  </span>
                </span>
                {r.status === 'open' && (
                  <button
                    class="back"
                    onClick={() => {
                      if (confirm('Cancel this request?')) void queueOp('cancelRide', { id: r.id });
                    }}
                  >
                    Cancel
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <p class="section-title">
        Everyone else
        <span class="total">{others.filter((r) => r.status === 'open').length} open</span>
      </p>
      {others.length === 0 ? (
        <p class="muted">Nobody's waiting for a lift.</p>
      ) : (
        <ul class="list">
          {others.map((r) => (
            <li key={r.id}>
              <span>
                <strong>
                  {r.passenger}
                  {r.others.length ? ` +${r.others.length}` : ''}
                </strong>
                {r.to ? ` → ${r.to}` : ''}
                <br />
                <span class="muted">
                  {timeLabel(r.when)}
                  {r.from ? ` · from ${r.from}` : ''}
                  {r.notes ? ` · ${r.notes}` : ''}
                </span>
              </span>

              {r.status === 'open' && (
                <button
                  class="btn btn--teal btn--inline"
                  onClick={() => void queueOp('claimRide', { id: r.id, driver: me })}
                >
                  I'll drive
                </button>
              )}
              {r.status === 'claimed' && r.driver === me && (
                <button class="btn btn--inline" onClick={() => onDrive(r)}>
                  Log it
                </button>
              )}
              {r.status === 'claimed' && r.driver !== me && (
                <span class="muted">{r.driver} has it</span>
              )}
              {r.status === 'done' && <span class="muted">done</span>}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StatusLine({ request }: { request: RideRequest }) {
  switch (request.status) {
    case 'open':
      return <span>waiting for a driver</span>;
    case 'claimed':
      return (
        <span>
          <strong>{request.driver}</strong> is driving you
        </span>
      );
    case 'done':
      return <span>{request.driver} drove you</span>;
    default:
      return <span>cancelled</span>;
  }
}

function AskForm({ me, onClose }: { me: string; onClose: () => void }) {
  const { bootstrap } = useApp();
  const places = bootstrap?.places ?? [];
  const spots = bootstrap?.spots ?? [];
  const members = (bootstrap?.members ?? []).filter((m) => m.name !== me);

  const [when, setWhen] = useState(localDateTimeInput(new Date()));
  const [from, setFrom] = useState('Quinta');
  const [to, setTo] = useState('');
  const [others, setOthers] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const destinations = [
    ...places.filter((p) => p.category === 'Town').map((p) => p.name),
    ...spots.map((s) => s.name),
  ];

  const save = async () => {
    setSaving(true);
    await queueOp('requestRide', {
      id: newClientId(),
      passenger: me,
      others,
      when: new Date(when).toISOString(),
      from,
      to,
      notes,
    });
    onClose();
  };

  return (
    <div class="card">
      <p class="kicker">Ask for a ride</p>

      <label class="field">
        <span>When</span>
        <input
          type="datetime-local"
          value={when}
          onInput={(e) => setWhen((e.target as HTMLInputElement).value)}
        />
      </label>

      <div class="row">
        <label class="field">
          <span>From</span>
          <input
            type="text"
            value={from}
            onInput={(e) => setFrom((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>To</span>
          <input
            type="text"
            list="ride-destinations"
            value={to}
            placeholder="Lagos…"
            onInput={(e) => setTo((e.target as HTMLInputElement).value)}
          />
          <datalist id="ride-destinations">
            {destinations.map((d) => (
              <option key={d} value={d} />
            ))}
          </datalist>
        </label>
      </div>

      <div class="field">
        <span>Anyone with you?</span>
        <div class="chips">
          {members.map((m) => (
            <button
              key={m.name}
              type="button"
              class="chip"
              data-role={m.included ? 'driver' : 'rider'}
              aria-pressed={others.includes(m.name)}
              onClick={() =>
                setOthers(
                  others.includes(m.name)
                    ? others.filter((n) => n !== m.name)
                    : [...others, m.name],
                )
              }
            >
              <span class={`dot ${m.included ? '' : 'dot--rider'}`} />
              {m.name}
            </button>
          ))}
        </div>
      </div>

      <label class="field">
        <span>Notes</span>
        <input
          type="text"
          value={notes}
          placeholder="optional"
          onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
        />
      </label>

      <div class="row">
        <button class="btn btn--secondary" onClick={onClose}>
          Cancel
        </button>
        <button class="btn" disabled={!to.trim() || saving} onClick={() => void save()}>
          {saving ? 'Asking…' : 'Ask'}
        </button>
      </div>
    </div>
  );
}
