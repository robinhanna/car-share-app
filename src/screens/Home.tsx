import type { Route } from '../app';
import type { Reservation } from '../api/types';
import { euro } from '../lib/cost';
import { queueOp, useApp } from '../state/store';

interface Props {
  me: string;
  onNavigate: (route: Route) => void;
}

export function Home({ me, onNavigate }: Props) {
  const { bootstrap } = useApp();
  const reservations = bootstrap?.reservations ?? [];
  const now = Date.now();

  const active = reservations.find(
    (r) => new Date(r.start).getTime() <= now && new Date(r.end).getTime() >= now,
  );
  const upcoming = reservations
    .filter((r) => new Date(r.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));

  const myBalance = bootstrap?.members.find((m) => m.name === me)?.balance ?? 0;

  return (
    <>
      <div class="card card--status">
        <p class="eyebrow">The car</p>
        {active ? (
          <>
            <p class="status-line">
              {active.driver === me ? 'You have it' : `${active.driver} has it`}
            </p>
            <p class="muted">
              until {timeLabel(active.end)}
              {active.destination ? ` · ${active.destination}` : ''}
            </p>
          </>
        ) : (
          <>
            <p class="status-line">Free right now</p>
            <p class="muted">
              {upcoming.length
                ? `Next: ${upcoming[0].driver}, ${timeLabel(upcoming[0].start)}`
                : 'Nothing booked'}
            </p>
          </>
        )}
      </div>

      <div class="btn-stack">
        <button class="btn" onClick={() => onNavigate({ name: 'log', reservationId: active?.driver === me ? active.id : undefined })}>
          Log a trip
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'reserve' })}>
          Reserve the car
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'karma' })}>
          Karma
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'balance' })}>
          What I owe · <span class="amount">{euro(myBalance)}</span>
        </button>
      </div>

      {upcoming.length > 0 && (
        <>
          <div class="spacer" />
          <p class="eyebrow">Coming up</p>
          <ul class="list">
            {upcoming.slice(0, 5).map((r) => (
              <li key={r.id}>
                <span>
                  <strong>{r.driver}</strong>
                  {r.destination ? ` · ${r.destination}` : ''}
                  <br />
                  <span class="muted">
                    {timeLabel(r.start)} – {timeLabel(r.end)}
                  </span>
                </span>
                {r.driver === me && <CancelButton reservation={r} />}
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

function CancelButton({ reservation }: { reservation: Reservation }) {
  return (
    <button
      class="back"
      onClick={() => {
        if (confirm('Cancel this reservation?')) {
          void queueOp('cancelReservation', { id: reservation.id });
        }
      }}
    >
      Cancel
    </button>
  );
}

function timeLabel(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return time;
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' })} ${time}`;
}
