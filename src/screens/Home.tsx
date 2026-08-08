import type { Route } from '../app';
import { ADMIN_MEMBER } from '../config';
import { dayRate, euro, km, personLedger } from '../lib/cost';
import { shortDate, timeLabel } from '../lib/dates';
import { queueOp, sync, useApp } from '../state/store';

/** A reservation or a claimed lift — both block the car, so both show together. */
interface Booking {
  id: string;
  driver: string;
  passenger: string;
  what: string;
  when: string;
  lift: boolean;
  onLog: (go: (route: Route) => void) => void;
  onCancel: () => void;
}

interface Props {
  me: string;
  onNavigate: (route: Route) => void;
}

export function Home({ me, onNavigate }: Props) {
  const { bootstrap, syncing } = useApp();
  const reservations = bootstrap?.reservations ?? [];
  const now = Date.now();

  const active = reservations.find(
    (r) => new Date(r.start).getTime() <= now && new Date(r.end).getTime() >= now,
  );
  const upcoming = reservations
    .filter((r) => new Date(r.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));

  const rides = bootstrap?.rideRequests ?? [];

  // A claimed lift ties the car up exactly like a booking does, so the two sit
  // in one list rather than making people look in two places.
  const booked: Booking[] = [
    ...upcoming.map((r) => ({
      id: r.id,
      driver: r.driver,
      passenger: '',
      what: r.destination,
      when: `${timeLabel(r.start)} – ${timeLabel(r.end)}`,
      lift: false,
      onLog: (go: (route: Route) => void) => go({ name: 'log', reservationId: r.id }),
      onCancel: () => void queueOp('cancelReservation', { id: r.id }),
    })),
    ...rides
      .filter((r) => r.status === 'claimed' && new Date(r.when).getTime() > now)
      .map((r) => ({
        id: r.id,
        driver: r.driver,
        passenger: r.passenger,
        what: [r.passenger, r.to].filter(Boolean).join(' → '),
        when: timeLabel(r.when),
        lift: true,
        // Logging a lift needs no form: the request already knows everything.
        onLog: () => void queueOp('logRide', { id: r.id, date: new Date().toISOString() }),
        onCancel: () => void queueOp('cancelRide', { id: r.id }),
      })),
  ].sort((a, b) => a.when.localeCompare(b.when));

  // A lift whose pickup time has passed isn't "coming up" any more — it's
  // waiting to be logged. The backend logs these itself two hours on, but
  // whoever drove shouldn't have to wait for that if they're looking now.
  const overdue: Booking[] = rides
    .filter((r) => r.status === 'claimed' && new Date(r.when).getTime() <= now)
    .map((r) => ({
      id: r.id,
      driver: r.driver,
      passenger: r.passenger,
      what: [r.passenger, r.to].filter(Boolean).join(' → '),
      when: timeLabel(r.when),
      lift: true,
      onLog: () => void queueOp('logRide', { id: r.id, date: new Date().toISOString() }),
      onCancel: () => void queueOp('cancelRide', { id: r.id }),
    }));

  const recent = [...(bootstrap?.recentTrips ?? [])]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5);

  // Compute rather than trust member.balance: the sheet's column doesn't know
  // about anything still sitting in this phone's outbox.
  const members = bootstrap?.members ?? [];
  const settings = bootstrap?.settings;
  const mine = members.find((m) => m.name === me);
  const myLedger =
    mine && settings
      ? personLedger(
          mine,
          bootstrap?.recentTrips ?? [],
          bootstrap?.payments ?? [],
          dayRate(members, settings),
        )
      : null;
  const owed = myLedger ? myLedger.balance : 0;
  const openRides = (bootstrap?.rideRequests ?? []).filter((r) => r.status === 'open').length;

  return (
    <>
      <div class="card card--status">
        <div class="card-head">
          <p class="eyebrow">The car</p>
          {/* Pull-to-refresh can't fire once the app is installed to the home
              screen, so the gesture needs a button behind it. */}
          <button
            class="icon-btn"
            aria-label="Refresh"
            disabled={syncing}
            onClick={() => void sync()}
          >
            {syncing ? '…' : '↻'}
          </button>
        </div>
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
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'rides' })}>
          Lifts
          {openRides > 0 && <span class="badge">{openRides}</span>}
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'karma' })}>
          Karma
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'balance' })}>
          Rental ·{' '}
          <span class={`amount ${owed > 0.01 ? 'amount--owed' : 'amount--clear'}`}>
            {euro(Math.abs(owed))}
          </span>
        </button>
      </div>

      {booked.length > 0 && (
        <>
          <div class="spacer" />
          <p class="section-title">Coming up</p>
          <ul class="list">
            {booked.slice(0, 6).map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{b.driver || 'Nobody yet'}</strong>
                  {b.what ? ` · ${b.what}` : ''}
                  {b.lift && <span class="tag">lift</span>}
                  <br />
                  <span class="muted">{b.when}</span>
                </span>

                <span class="row-actions">
                  {b.driver === me && (
                    <button
                      class="btn btn--inline btn--secondary"
                      onClick={() => b.onLog(onNavigate)}
                    >
                      Log trip
                    </button>
                  )}
                  {(b.driver === me || b.passenger === me) && (
                    <button
                      class="icon-btn icon-btn--danger"
                      aria-label="Cancel"
                      onClick={() => {
                        if (confirm(`Cancel this ${b.lift ? 'lift' : 'reservation'}?`)) b.onCancel();
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {overdue.length > 0 && (
        <>
          <div class="spacer" />
          <p class="section-title">
            Still to log <span class="total">{overdue.length}</span>
          </p>
          <ul class="list">
            {overdue.map((b) => (
              <li key={b.id}>
                <span>
                  <strong>{b.driver}</strong> · {b.what}
                  <span class="tag">lift</span>
                  <br />
                  <span class="muted">{b.when}</span>
                </span>
                <span class="row-actions">
                  <button class="btn btn--inline" onClick={() => b.onLog(onNavigate)}>
                    Log it
                  </button>
                  <button
                    class="icon-btn icon-btn--danger"
                    aria-label="Cancel"
                    onClick={() => {
                      if (confirm('This lift never happened?')) b.onCancel();
                    }}
                  >
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      {recent.length > 0 && (
        <>
          <div class="spacer" />
          <p class="section-title">Recently logged</p>
          <ul class="list">
            {recent.map((t) => (
              <li key={t.id}>
                <span>
                  <strong>{t.destination || 'Trip'}</strong>
                  {t.taxi ? <span class="tag">lift</span> : ''}
                  <br />
                  <span class="muted">
                    {shortDate(t.date)} · {t.driver} · {km(t.distanceKm)} · {euro(t.total)}
                  </span>
                </span>
                <span class="row-actions">
                  {/* Anyone can correct a trip — people mistype who was in the
                      car, and the fix should be as easy as the mistake. */}
                  {t.id && (
                    <button
                      class="icon-btn"
                      aria-label="Edit"
                      onClick={() => onNavigate({ name: 'log', trip: t })}
                    >
                      ✎
                    </button>
                  )}
                  {/* Removing is Robin's alone: a mistaken tap here quietly
                      rewrites someone's bill. */}
                  {me === ADMIN_MEMBER && t.id && (
                    <button
                      class="icon-btn icon-btn--danger"
                      aria-label="Remove"
                      onClick={() => {
                        if (confirm(`Remove the ${t.destination || 'trip'} on ${shortDate(t.date)}?`)) {
                          void queueOp('deleteTrip', { tripId: t.id });
                        }
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}

