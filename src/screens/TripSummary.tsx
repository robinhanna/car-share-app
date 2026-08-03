import { euro, km, type TripCost } from '../lib/cost';
import { useApp } from '../state/store';

interface Props {
  cost: TripCost;
  destination: string;
  onDone: () => void;
}

export function TripSummary({ cost, destination, onDone }: Props) {
  const { pending, online } = useApp();
  const queued = pending.length > 0;

  return (
    <div class="center">
      <p class="kicker">{destination || 'Trip logged'}</p>
      <h1>Saved</h1>

      <div class="card card--status">
        <p class="muted">Each person pays</p>
        <p class="summary-total">{euro(cost.perPerson)}</p>
        <p class="muted">
          {cost.people} {cost.people === 1 ? 'person' : 'people'} · {euro(cost.total)} total
        </p>
      </div>

      <ul class="list" style="text-align:left">
        <li>
          <span>Distance</span>
          <span class="amount">{km(cost.distanceKm)}</span>
        </li>
        <li>
          <span>Fuel</span>
          <span class="amount">{euro(cost.fuelCost)}</span>
        </li>
        {cost.tolls > 0 && (
          <li>
            <span>Tolls</span>
            <span class="amount">{euro(cost.tolls)}</span>
          </li>
        )}
        {cost.parking > 0 && (
          <li>
            <span>Parking</span>
            <span class="amount">{euro(cost.parking)}</span>
          </li>
        )}
      </ul>

      <p class="muted">
        {queued
          ? online
            ? 'Syncing to the sheet…'
            : "No signal — this is saved on your phone and will sync when you're back online."
          : 'In the sheet.'}
      </p>

      <div class="spacer" />
      <button class="btn" onClick={onDone}>
        Done
      </button>
    </div>
  );
}
