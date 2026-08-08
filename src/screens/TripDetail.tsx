import type { Trip } from '../api/types';
import { ADMIN_MEMBER } from '../config';
import { euro, km } from '../lib/cost';
import { shortDate, timeLabel } from '../lib/dates';
import { queueOp } from '../state/store';

interface Props {
  trip: Trip;
  me: string;
  onEdit: (trip: Trip) => void;
  onDeleted: () => void;
}

/**
 * The log form, read-only.
 *
 * Anything that wasn't filled in is left out entirely rather than shown as a
 * blank or a €0.00 — a page of empty rows tells you nothing about the trip.
 */
export function TripDetail({ trip, me, onEdit, onDeleted }: Props) {
  const rows: [string, string][] = [];

  const push = (label: string, value: string | number | null | undefined) => {
    if (value === null || value === undefined || value === '' || value === 0) return;
    rows.push([label, String(value)]);
  };

  push('From', trip.origin);
  push('To', trip.destination);
  push('What for', trip.activity);
  push('Distance', km(trip.distanceKm));
  push('Trip type', trip.tripType);
  push('Boards on the roof', trip.boards ? 'Yes' : '');
  push('Tolls', trip.tolls ? euro(trip.tolls) : '');
  push('Parking', trip.parking ? euro(trip.parking) : '');

  const when = trip.until
    ? `${timeLabel(trip.date)} – ${timeLabel(trip.until)}`
    : timeLabel(trip.date);

  return (
    <>
      <p class="kicker">
        {shortDate(trip.date)}
        {trip.taxi ? ' · lift' : ''}
      </p>
      <h1>{trip.destination || 'Trip'}</h1>

      <div class="card card--status center">
        <p class="muted">
          {trip.taxi ? 'Each passenger pays' : 'Each person pays'}
        </p>
        <p class="summary-total">{euro(trip.perPerson)}</p>
        <p class="muted">
          {trip.people} {trip.people === 1 ? 'person' : 'people'} · {euro(trip.total)} total
        </p>
      </div>

      <p class="section-title">
        When <span class="total">{when}</span>
      </p>

      <p class="section-title">The trip</p>
      <ul class="list">
        {rows.map(([label, value]) => (
          <li key={label}>
            <span>{label}</span>
            <span class="amount">{value}</span>
          </li>
        ))}
      </ul>

      <p class="section-title">Who</p>
      <ul class="list">
        <li>
          <span>Drove</span>
          <span class="amount">{trip.driver}</span>
        </li>
        {trip.riders.length > 0 && (
          <li>
            <span>{trip.taxi ? 'Passengers' : 'Along for the ride'}</span>
            <span class="amount">{trip.riders.join(', ')}</span>
          </li>
        )}
      </ul>

      {trip.taxi && (
        <p class="muted">
          A lift, so {trip.driver} pays nothing — the distance counts both ways because the
          drive home was empty.
        </p>
      )}

      <p class="section-title">
        Cost <span class="total">{euro(trip.total)}</span>
      </p>
      <ul class="list">
        <li>
          <span>Fuel</span>
          <span class="amount">{euro(trip.fuelCost)}</span>
        </li>
        {trip.tolls > 0 && (
          <li>
            <span>Tolls</span>
            <span class="amount">{euro(trip.tolls)}</span>
          </li>
        )}
        {trip.parking > 0 && (
          <li>
            <span>Parking</span>
            <span class="amount">{euro(trip.parking)}</span>
          </li>
        )}
      </ul>

      <div class="spacer" />
      <div class="row">
        <button class="btn btn--secondary" onClick={() => onEdit(trip)}>
          ✎ Edit
        </button>
        {me === ADMIN_MEMBER && (
          <button
            class="btn btn--danger"
            onClick={() => {
              if (confirm(`Remove the ${trip.destination || 'trip'} on ${shortDate(trip.date)}?`)) {
                void queueOp('deleteTrip', { tripId: trip.id });
                onDeleted();
              }
            }}
          >
            Remove
          </button>
        )}
      </div>
    </>
  );
}
