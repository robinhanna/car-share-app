import { useEffect, useState } from 'preact/hooks';
import { newClientId } from '../api/client';
import type { RideRequest } from '../api/types';
import { localDateTimeInput, timeLabel } from '../lib/dates';
import { getSeen, hasChanged, markSeen } from '../state/seen';
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
  const [editingRide, setEditingRide] = useState<RideRequest | null>(null);
  const [seen, setSeen] = useState(getSeen);

  /**
   * A ride has no "updated" column, and doesn't need one: what the requester
   * cares about is who has it. `claimed:Robin` versus `open:` is the whole
   * signal, and it changes exactly when someone takes the lift or hands it back.
   */
  const signal = (r: RideRequest) => `${r.status}:${r.driver}`;

  // Seed silently, so a request doesn't announce itself as changed the first
  // time its owner lays eyes on it.
  useEffect(() => {
    let next = seen;
    mine.forEach((r) => {
      if (next[r.id] === undefined) next = markSeen(r.id, signal(r));
    });
    if (next !== seen) setSeen(next);
  }, [requests, seen]);

  return (
    <>
      <p class="kicker">Lifts</p>
      <h1>Need a ride?</h1>
      <p class="muted">
        Ask, and whoever has the car can pick it up. The driver doesn't pay for the petrol on a
        lift — you do.
      </p>

      {asking || editingRide ? (
        <AskForm
          me={me}
          request={editingRide ?? undefined}
          onClose={() => {
            setAsking(false);
            setEditingRide(null);
          }}
        />
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
                  {hasChanged(seen, r.id, signal(r)) && (
                    <span class="tag tag--alert">
                      {r.status === 'claimed' ? 'accepted' : 'open again'}
                    </span>
                  )}
                </span>
                {(r.status === 'open' || r.status === 'claimed') && (
                  <span class="row-actions">
                    <button
                      class="icon-btn"
                      aria-label="Change this lift"
                      onClick={() => {
                        setSeen(markSeen(r.id, signal(r)));
                        setEditingRide(r);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      class="icon-btn icon-btn--danger"
                      aria-label="Cancel this lift"
                      onClick={() => {
                        if (confirm('Cancel this request?')) void queueOp('cancelRide', { id: r.id });
                      }}
                    >
                      ✕
                    </button>
                  </span>
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
                <span class="row-actions">
                  {/* One tap logs it: the request already knows the passengers,
                      the destination and the distance. The form is only there
                      for the odd case that needs tolls or a correction. */}
                  <button
                    class="btn btn--inline"
                    onClick={() =>
                      void queueOp('logRide', { id: r.id, date: new Date().toISOString() })
                    }
                  >
                    Log it
                  </button>
                  <button
                    class="icon-btn"
                    aria-label="Log with details"
                    onClick={() => onDrive(r)}
                  >
                    ⋯
                  </button>
                  {/* Stepping back from a favour shouldn't destroy the request —
                      it goes back on the board for someone else. */}
                  <button
                    class="icon-btn icon-btn--danger"
                    aria-label="Hand this lift back"
                    title="Hand it back"
                    onClick={() => {
                      if (confirm(`Hand this lift back? ${r.passenger} will see it as open again.`)) {
                        void queueOp('releaseRide', { id: r.id });
                      }
                    }}
                  >
                    ↩
                  </button>
                </span>
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

function AskForm({
  me,
  request,
  onClose,
}: {
  me: string;
  /** Set when the person who asked is changing their own request. */
  request?: RideRequest;
  onClose: () => void;
}) {
  const { bootstrap } = useApp();
  const places = bootstrap?.places ?? [];
  const spots = bootstrap?.spots ?? [];
  const members = (bootstrap?.members ?? []).filter((m) => m.name !== me);

  const editing = !!request;
  const [when, setWhen] = useState(
    localDateTimeInput(request ? new Date(request.when) : new Date()),
  );
  const [from, setFrom] = useState(request?.from ?? 'Quinta');
  const [to, setTo] = useState(request?.to ?? '');
  const [others, setOthers] = useState<string[]>(request?.others ?? []);
  const [notes, setNotes] = useState(request?.notes ?? '');
  const [saving, setSaving] = useState(false);

  const destinations = [
    ...places.filter((p) => p.category === 'Town').map((p) => p.name),
    ...spots.map((s) => s.name),
  ];

  const save = async () => {
    setSaving(true);
    const at = new Date(when).toISOString();
    if (request) {
      // Only what the person asking owns — who is driving and what state it's
      // in are not theirs to change from here.
      await queueOp('editRide', { id: request.id, when: at, from, to, notes });
    } else {
      await queueOp('requestRide', {
        id: newClientId(),
        passenger: me,
        others,
        when: at,
        from,
        to,
        notes,
      });
    }
    onClose();
  };

  return (
    <div class="card">
      <p class="kicker">{editing ? 'Change your lift' : 'Ask for a ride'}</p>

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
          {saving ? 'Saving…' : editing ? 'Save changes' : 'Ask'}
        </button>
      </div>
    </div>
  );
}
