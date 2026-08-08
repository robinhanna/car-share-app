import type { Reservation } from '../api/types';
import { shortDate, timeLabel } from '../lib/dates';

interface Props {
  booking: Reservation;
  me: string;
}

/**
 * A booking, read-only — what the people riding along see when they tap it.
 *
 * The driver never lands here; tapping their own booking opens the form. So
 * there is deliberately nothing to press: this page answers "what's the plan
 * now" and nothing else.
 *
 * Same shape as TripDetail, including its rule that anything left blank is
 * omitted rather than shown empty.
 */
export function BookingDetail({ booking, me }: Props) {
  const rows: [string, string][] = [];
  const push = (label: string, value: string) => {
    if (value) rows.push([label, value]);
  };

  push('Driving', booking.driver === me ? 'You' : booking.driver);
  push('Going to', booking.destination);
  push('Coming along', booking.riders.join(', '));
  push('Notes', booking.notes);

  const sameDay = shortDate(booking.start) === shortDate(booking.end);

  return (
    <>
      <p class="kicker">{shortDate(booking.start)}</p>
      <h1>{booking.destination || 'The car'}</h1>

      <div class="card card--status center">
        <p class="muted">{booking.driver === me ? 'You have it' : `${booking.driver} has it`}</p>
        <p class="status-line">
          {timeLabel(booking.start)} – {timeLabel(booking.end)}
        </p>
        {!sameDay && <p class="muted">until {shortDate(booking.end)}</p>}
      </div>

      <p class="section-title">The plan</p>
      <ul class="list">
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <span class="amount">{value}</span>
          </li>
        ))}
      </ul>

      <p class="muted">
        {booking.driver === me
          ? 'Your booking — go back and tap it again to change anything.'
          : `Only ${booking.driver} can change this. Ask them if the times don't work.`}
      </p>
    </>
  );
}
