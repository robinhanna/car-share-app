import type { Trip } from '../api/types';
import { euro, km } from '../lib/cost';
import { shortDate } from '../lib/dates';
import { useApp } from '../state/store';

interface Props {
  onOpenTrip: (trip: Trip) => void;
}

/**
 * Every trip the car has made, newest first.
 *
 * Deliberately flat rather than grouped by driver: the point is to see what the
 * car has been doing, and any grouping gets in the way of reading it as one
 * timeline.
 */
export function TripLog({ onOpenTrip }: Props) {
  const { bootstrap } = useApp();
  const trips = [...(bootstrap?.recentTrips ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  const totalKm = trips.reduce((sum, t) => sum + t.distanceKm, 0);
  const totalCost = trips.reduce((sum, t) => sum + t.total, 0);

  return (
    <>
      <p class="kicker">The car</p>
      <h1>Trip log</h1>

      <p class="section-title">
        {trips.length} {trips.length === 1 ? 'trip' : 'trips'}
        <span class="total">
          {km(totalKm)} · {euro(totalCost)}
        </span>
      </p>

      {trips.length === 0 ? (
        <p class="muted">Nothing logged yet.</p>
      ) : (
        <ul class="list">
          {trips.map((t) => (
            <li key={t.id || `${t.date}-${t.destination}`}>
              <button class="row-btn" onClick={() => onOpenTrip(t)}>
                <span>
                  <strong>{t.destination || 'Trip'}</strong>
                  {t.activity ? ` · ${t.activity}` : ''}
                  {t.taxi && <span class="tag">lift</span>}
                  <br />
                  <span class="muted">
                    {shortDate(t.date)} · {t.driver}
                    {t.riders.length ? ` +${t.riders.length}` : ''} · {km(t.distanceKm)}
                  </span>
                </span>
                <span class="amount">
                  {euro(t.total)}
                  <span class="chev"> ›</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
