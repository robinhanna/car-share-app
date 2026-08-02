import { euro } from '../lib/cost';
import { useApp } from '../state/store';

interface Props {
  me: string;
}

export function Balance({ me }: Props) {
  const { bootstrap } = useApp();
  const settings = bootstrap?.settings;
  const members = bootstrap?.members ?? [];
  const mine = members.find((m) => m.name === me);

  return (
    <>
      <p class="eyebrow">The rental</p>
      <h1>What you owe</h1>
      <div class="spacer" />

      <div class="card card--status center">
        <p class="muted">Your share of the car</p>
        <p class="summary-total">{euro(mine?.share ?? 0)}</p>
        <p class="muted">
          {mine?.daysActive ?? 0} days ·{' '}
          {mine?.included ? 'paying into the rental' : 'not paying into the rental'}
        </p>
      </div>

      <ul class="list">
        <li>
          <span>Paid so far</span>
          <span class="amount">{euro(mine?.paid ?? 0)}</span>
        </li>
        <li>
          <span>Still owed</span>
          <span class={`amount ${(mine?.balance ?? 0) > 0.01 ? 'amount--owed' : 'amount--clear'}`}>
            {euro(mine?.balance ?? 0)}
          </span>
        </li>
      </ul>

      <div class="spacer" />
      <p class="eyebrow">Everyone</p>
      <ul class="list">
        {members.map((m) => (
          <li key={m.name}>
            <span>
              {m.name}
              {m.included ? '' : ' (fuel only)'}
              <br />
              <span class="muted">{m.daysActive} days</span>
            </span>
            <span class={`amount ${m.balance > 0.01 ? 'amount--owed' : 'amount--clear'}`}>
              {euro(m.balance)}
            </span>
          </li>
        ))}
      </ul>

      {settings && (
        <>
          <div class="spacer" />
          <p class="muted">
            {euro(settings.totalCost)} total · {settings.totalMemberDays} member-days ·{' '}
            {euro(settings.dailyRate)}/day each. Fuel {settings.fuelPrice.toFixed(2)} €/L at{' '}
            {settings.consumption} L/100km = {settings.costPerKm.toFixed(3)} €/km.
          </p>
        </>
      )}
    </>
  );
}
