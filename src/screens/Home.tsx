import { useEffect, useState } from 'preact/hooks';
import type { Route } from '../app';
import type { Reservation, RideRequest } from '../api/types';
import { ADMIN_MEMBER, LIFT_HOURS } from '../config';
import { dayRate, euro, km, personLedger } from '../lib/cost';
import { shortDate, timeLabel } from '../lib/dates';
import { RateCurve } from './RateCurve';
import { getSeen, hasChanged, markSeen } from '../state/seen';
import { queueOp, sync, useApp } from '../state/store';

/** A reservation or a claimed lift — both block the car, so both show together. */

/**
 * Where a lift actually goes. The old label read "Lucia → Lagos", pointing an
 * arrow from a person at a place — it looked like a route and wasn't one, and
 * the origin, which is what a driver weighs up before taking a request, was
 * missing. No fallback origin: a request with no `from` reads as the
 * destination alone rather than claiming a Quinta nobody typed.
 */
function liftRoute(r: RideRequest): string {
  return [r.from, r.to].filter(Boolean).join(' → ');
}

interface Booking {
  id: string;
  driver: string;
  passenger: string;
  what: string;
  when: string;
  /** The window the car is spoken for, in ms — what the clash check compares. */
  start: number;
  end: number;
  lift: boolean;
  /** An open request: nobody has taken it, so it can't clash with anything. */
  open?: boolean;
  notes?: string;
  riders: string[];
  /** Set only on reservations — a lift's details belong to the ride request. */
  reservation?: Reservation;
  onLog: (go: (route: Route) => void) => void;
  onCancel: () => void;
  onJoin: (join: boolean) => void;
}

/** A window in which the car is spoken for, whatever kind of booking made it. */
interface Busy {
  start: number;
  end: number;
  who: string;
  what: string;
  /** Set only on a lift: the person who asked for it. */
  passenger?: string;
  lift: boolean;
  /** Absent on lifts — their details live on the ride request. */
  reservation?: Reservation;
}

interface Props {
  me: string;
  onNavigate: (route: Route) => void;
}

export function Home({ me, onNavigate }: Props) {
  const { bootstrap, syncing } = useApp();
  const reservations = bootstrap?.reservations ?? [];
  const now = Date.now();

  const [seen, setSeen] = useState(getSeen);

  // Seed anything never seen before, so a booking's first appearance doesn't
  // announce itself as a change. Only the driver's own edits should do that,
  // and only for people who had already seen the earlier version.
  useEffect(() => {
    let next = seen;
    reservations.forEach((r) => {
      if (r.driver === me) return;
      if (next[r.id] === undefined) next = markSeen(r.id, r.updated);
    });
    if (next !== seen) setSeen(next);
  }, [reservations, me, seen]);

  const openBooking = (r: Reservation) => {
    setSeen(markSeen(r.id, r.updated));
    // The driver goes straight to the form; everyone else gets the read-only
    // page. Same gesture, different rights.
    onNavigate(
      r.driver === me ? { name: 'reserve', reservation: r } : { name: 'booking', booking: r },
    );
  };

  const rides = bootstrap?.rideRequests ?? [];

  /**
   * Every window in which the car is spoken for — bookings and claimed lifts
   * alike. Coming up has merged the two for a while; the status card hadn't,
   * so it would announce a reservation two days out while someone was leaving
   * on a lift within the hour.
   *
   * A ride request records when it starts and nothing else, so a claimed lift
   * gets LIFT_HOURS to occupy.
   */
  const busy: Busy[] = [
    ...reservations.map((r) => ({
      start: new Date(r.start).getTime(),
      end: new Date(r.end).getTime(),
      who: r.driver,
      what: r.destination,
      lift: false,
      reservation: r,
    })),
    ...rides
      .filter((r) => r.status === 'claimed')
      .map((r) => ({
        start: new Date(r.when).getTime(),
        end: new Date(r.when).getTime() + LIFT_HOURS * 3600_000,
        who: r.driver,
        what: liftRoute(r),
        passenger: r.passenger,
        lift: true,
        reservation: undefined,
      })),
  ].sort((a, b) => a.start - b.start);

  const active = busy.find((b) => b.start <= now && b.end >= now);
  // The +1 and cancel are reservation-shaped; a lift is acted on from Lifts.
  const activeBooking = active?.reservation;
  const upcoming = busy.filter((b) => b.start > now);

  // Coming up builds its reservation rows from the reservations themselves —
  // the merged list above exists for the status card, which only needs windows.
  const upcomingReservations = reservations
    .filter((r) => new Date(r.start).getTime() > now)
    .sort((a, b) => a.start.localeCompare(b.start));

  // A claimed lift ties the car up exactly like a booking does, so the two sit
  // in one list rather than making people look in two places.
  const booked: Booking[] = [
    ...upcomingReservations.map((r) => ({
      id: r.id,
      driver: r.driver,
      passenger: '',
      what: r.destination,
      when: `${timeLabel(r.start)} – ${timeLabel(r.end)}`,
      start: new Date(r.start).getTime(),
      end: new Date(r.end).getTime(),
      lift: false,
      notes: r.notes,
      riders: r.riders,
      reservation: r,
      onLog: (go: (route: Route) => void) =>
        go({ name: 'log', reservationId: r.id, reservation: r }),
      onCancel: () => void queueOp('cancelReservation', { id: r.id }),
      onJoin: (join: boolean) => void queueOp('joinReservation', { id: r.id, name: me, join }),
    })),
    ...rides
      .filter((r) => r.status === 'claimed' && new Date(r.when).getTime() > now)
      .map((r) => ({
        id: r.id,
        driver: r.driver,
        passenger: r.passenger,
        what: liftRoute(r),
        when: timeLabel(r.when),
        start: new Date(r.when).getTime(),
        end: new Date(r.when).getTime() + LIFT_HOURS * 3600_000,
        lift: true,
        notes: r.notes,
        riders: r.others,
        // Logging a lift needs no form: the request already knows everything.
        onLog: () => void queueOp('logRide', { id: r.id, date: new Date().toISOString() }),
        onCancel: () => void queueOp('cancelRide', { id: r.id }),
        onJoin: (join: boolean) => void queueOp('joinRide', { id: r.id, name: me, join }),
      })),
    // A request nobody has taken is still something the group should see —
    // somebody reading Coming up is exactly the person who could take it.
    ...rides
      .filter((r) => r.status === 'open' && new Date(r.when).getTime() > now)
      .map((r) => ({
        id: r.id,
        driver: '',
        passenger: r.passenger,
        what: liftRoute(r),
        when: timeLabel(r.when),
        start: new Date(r.when).getTime(),
        end: new Date(r.when).getTime() + LIFT_HOURS * 3600_000,
        lift: true,
        open: true,
        riders: r.others,
        onLog: () => void queueOp('logRide', { id: r.id, date: new Date().toISOString() }),
        onCancel: () => void queueOp('cancelRide', { id: r.id }),
        onJoin: (join: boolean) => void queueOp('joinRide', { id: r.id, name: me, join }),
      })),
  ].sort((a, b) => a.start - b.start);

  /**
   * Two things that both need the car at once. Nobody is warned about this
   * today — the booking form checks for a clash at the moment you save and
   * then never mentions it again, so an overlap created by an edit is silent.
   *
   * Open requests are excluded: until a driver takes one, it holds nothing.
   */
  const clashing = new Set<string>();
  booked.forEach((a, i) => {
    booked.slice(i + 1).forEach((b) => {
      if (a.open || b.open) return;
      if (a.start < b.end && b.start < a.end) {
        clashing.add(a.id);
        clashing.add(b.id);
      }
    });
  });

  // Anything the car has already done that nobody has written down yet —
  // finished bookings and lifts whose pickup time has passed. One list rather
  // than two, because two sections both asking you to log something is how one
  // of them gets ignored.
  //
  // A finished booking appears the moment its end time passes, so the driver can
  // check the details while the drive is still fresh, fix what's wrong, and log
  // it — rather than starting from a blank form later and retyping what the
  // booking already knew.
  const overdue: Booking[] = [
    ...reservations
      .filter((r) => new Date(r.end).getTime() <= now)
      .map((r) => ({
        id: r.id,
        driver: r.driver,
        passenger: '',
        what: r.destination,
        when: `${timeLabel(r.start)} – ${timeLabel(r.end)}`,
        start: new Date(r.start).getTime(),
        end: new Date(r.end).getTime(),
        lift: false,
        notes: r.notes,
        riders: r.riders,
        reservation: r,
        onLog: (go: (route: Route) => void) =>
          go({ name: 'log', reservationId: r.id, reservation: r }),
        onCancel: () => void queueOp('cancelReservation', { id: r.id }),
        onJoin: (join: boolean) => void queueOp('joinReservation', { id: r.id, name: me, join }),
      })),
    ...rides
    .filter((r) => r.status === 'claimed' && new Date(r.when).getTime() + LIFT_HOURS * 3600_000 <= now)
    .map((r) => ({
      id: r.id,
      driver: r.driver,
      passenger: r.passenger,
      what: liftRoute(r),
      when: timeLabel(r.when),
      start: new Date(r.when).getTime(),
      end: new Date(r.when).getTime() + LIFT_HOURS * 3600_000,
      lift: true,
      notes: r.notes,
      riders: r.others,
      onLog: () => void queueOp('logRide', { id: r.id, date: new Date().toISOString() }),
      onCancel: () => void queueOp('cancelRide', { id: r.id }),
      onJoin: (join: boolean) => void queueOp('joinRide', { id: r.id, name: me, join }),
    })),
  ].sort((a, b) => a.start - b.start);


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
          <span class="row-actions">
            {/* Someone is most likely to want in while the car is actually
                leaving, so the join button matters more here than on a booking
                that's still hours away. */}
            {activeBooking && activeBooking.driver !== me && (
              <button
                class="icon-btn icon-btn--join"
                aria-pressed={activeBooking.riders.includes(me)}
                aria-label={activeBooking.riders.includes(me) ? 'Leave this trip' : 'Add me to this trip'}
                title={activeBooking.riders.includes(me) ? 'Leave this trip' : 'Add me to this trip'}
                onClick={() =>
                  void queueOp('joinReservation', {
                    id: activeBooking.id,
                    name: me,
                    join: !activeBooking.riders.includes(me),
                  })
                }
              >
                {activeBooking.riders.includes(me) ? '−1' : '+1'}
              </button>
            )}
            {/* Plans fall through. Without this the car reads as taken until the
                booking runs out, and the only way to release it was to find the
                row in Coming up — which the active one has already left. */}
            {activeBooking && activeBooking.driver === me && (
              <button
                class="icon-btn icon-btn--danger"
                aria-label="Cancel this booking"
                onClick={() => {
                  if (confirm(`Cancel your ${activeBooking.destination || 'booking'}? The car shows as free again.`)) {
                    void queueOp('cancelReservation', { id: activeBooking.id });
                  }
                }}
              >
                ✕
              </button>
            )}
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
          </span>
        </div>
        {active ? (
          // Tappable for the same reason the Coming up rows are: the driver goes
          // to the form, everyone else to the read-only page.
          <button
            class="row-btn card-btn"
            onClick={() =>
              activeBooking ? openBooking(activeBooking) : onNavigate({ name: 'rides' })
            }
          >
            <span>
              <p class="status-line">
                {active.who === me ? 'You have it' : `${active.who} has it`}
                {active.lift && <span class="tag">lift</span>}
                {activeBooking &&
                  activeBooking.driver !== me &&
                  hasChanged(seen, activeBooking.id, activeBooking.updated) && (
                    <span class="tag tag--alert">changed</span>
                  )}
              </p>
              <p class="muted">
                until {timeLabel(new Date(active.end).toISOString())}
                {active.what ? ` · ${active.what}` : ''}
                {active.passenger ? ` · for ${active.passenger}` : ''}
              </p>
            </span>
            <span class="chev"> ›</span>
          </button>
        ) : null}
        {!active && (
          <>
            <p class="status-line">Free right now</p>
            <p class="muted">
              {upcoming.length
                ? `Next: ${upcoming[0].who}, ${timeLabel(new Date(upcoming[0].start).toISOString())}${upcoming[0].lift ? ' (lift)' : ''}`
                : 'Nothing booked'}
            </p>
          </>
        )}

        {/* Outside the tappable block above — swallowing it into that button
            would open the booking every time someone glanced at the chart. */}
        {settings && members.length > 0 && <RateCurve members={members} settings={settings} />}
      </div>

      <div class="btn-stack">
        {/* No implicit reservation here. Attaching whatever booking happened
            to be running meant logging a forgotten trip from yesterday closed
            today's booking. You link a reservation by tapping Log trip on it. */}
        <button class="btn" onClick={() => onNavigate({ name: 'log' })}>
          Log a trip
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'reserve' })}>
          Reserve the car
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'rides' })}>
          Lifts
          {openRides > 0 && <span class="badge">{openRides}</span>}
        </button>
        <button class="btn btn--secondary" onClick={() => onNavigate({ name: 'trips' })}>
          Trip log
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
            {booked.slice(0, 6).map((b) => {
              const changed =
                !!b.reservation &&
                b.reservation.driver !== me &&
                hasChanged(seen, b.reservation.id, b.reservation.updated);

              const label = (
                <span>
                  <strong>{b.driver || 'Nobody yet'}</strong>
                  {b.what ? ` · ${b.what}` : ''}
                  {b.lift && <span class="tag">lift</span>}
                  {changed && <span class="tag tag--alert">changed</span>}
                  {clashing.has(b.id) && <span class="tag tag--alert">clash</span>}
                  <br />
                  <span class="muted">
                    {b.when}
                    {/* Who asked. It belongs on the muted line rather than
                        beside the route: the bold line already holds a driver,
                        a destination and up to three pills, and adding a fourth
                        name to it wraps at 375px. */}
                    {b.passenger ? ` · for ${b.passenger}` : ''}
                  </span>
                  {b.notes && <span class="row-note">{b.notes}</span>}
                </span>
              );

              return (
              <li key={b.id}>
                {/* Reservations open on tap — the form for whoever made it, the
                    read-only page for everyone else. Lifts don't: their details
                    live on the ride request and belong to the passenger. */}
                {b.reservation ? (
                  <button class="row-btn" onClick={() => openBooking(b.reservation!)}>
                    {label}
                    <span class="chev"> ›</span>
                  </button>
                ) : (
                  label
                )}

                <span class="row-actions">
                  {/* Hop on someone else's booking. Meaningless on your own,
                      so it isn't shown there. */}
                  {b.driver !== me && b.passenger !== me && (
                    <button
                      class="icon-btn icon-btn--join"
                      aria-pressed={b.riders.includes(me)}
                      aria-label={b.riders.includes(me) ? 'Leave this trip' : 'Add me to this trip'}
                      title={b.riders.includes(me) ? 'Leave this trip' : 'Add me to this trip'}
                      onClick={() => b.onJoin(!b.riders.includes(me))}
                    >
                      {b.riders.includes(me) ? '−1' : '+1'}
                    </button>
                  )}
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
              );
            })}
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
                  <strong>{b.driver}</strong>
                  {b.what ? ` · ${b.what}` : ''}
                  {b.lift && <span class="tag">lift</span>}
                  <br />
                  <span class="muted">
                    {b.when}
                    {/* Who asked. It belongs on the muted line rather than
                        beside the route: the bold line already holds a driver,
                        a destination and up to three pills, and adding a fourth
                        name to it wraps at 375px. */}
                    {b.passenger ? ` · for ${b.passenger}` : ''}
                  </span>
                  {b.notes && <span class="row-note">{b.notes}</span>}
                </span>
                <span class="row-actions">
                  {/* For a booking this opens the form already carrying its
                      times, destination and riders — check, fix, log. */}
                  <button class="btn btn--inline" onClick={() => b.onLog(onNavigate)}>
                    Log it
                  </button>
                  <button
                    class="icon-btn icon-btn--danger"
                    aria-label="Cancel"
                    onClick={() => {
                      const q = b.lift
                        ? 'This lift never happened?'
                        : `Drop this ${b.what || 'booking'} without logging it?`;
                      if (confirm(q)) b.onCancel();
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
          <p class="section-title">Recent trips</p>
          <ul class="list">
            {recent.map((t) => (
              <li key={t.id}>
                <button class="row-btn" onClick={() => onNavigate({ name: 'trip', trip: t })}>
                  <span>
                    <strong>{t.destination || 'Trip'}</strong>
                    {t.taxi ? <span class="tag">lift</span> : ''}
                    <br />
                    <span class="muted">
                      {shortDate(t.date)} · {t.driver} · {km(t.distanceKm)} · {euro(t.total)}
                    </span>
                    {t.notes && <span class="row-note">{t.notes}</span>}
                  </span>
                </button>
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

