import type { Member } from '../api/types';
import {
  dayRate,
  days,
  euro,
  personLedger,
  totalMemberDays,
  totalRiderDays,
  type PersonLedger,
} from '../lib/cost';
import { useApp } from '../state/store';

interface Props {
  me: string;
  onOpenPerson: (name: string) => void;
}

export function Balance({ me, onOpenPerson }: Props) {
  const { bootstrap } = useApp();
  const settings = bootstrap?.settings;
  const members = bootstrap?.members ?? [];
  const trips = bootstrap?.recentTrips ?? [];
  const payments = bootstrap?.payments ?? [];

  const rate = settings ? dayRate(members, settings) : 0;
  const ledgers = members.map((m) => personLedger(m, trips, payments, rate));

  const drivers = ledgers.filter((_, i) => members[i].included);
  const riders = ledgers.filter((_, i) => !members[i].included);
  const mine = ledgers.find((l) => l.name === me);

  return (
    <>
      <p class="kicker">The rental</p>
      <h1>{mine && mine.balance < 0 ? "What you're owed" : 'What you owe'}</h1>
      <div class="spacer" />

      {mine && (
        <div class="card card--status center">
          <p class="muted">{mine.balance < 0 ? 'The group owes you' : 'You owe'}</p>
          <p
            class={`summary-total ${
              mine.balance > 0.01 ? 'summary-total--owed' : 'summary-total--clear'
            }`}
          >
            {euro(Math.abs(mine.balance))}
          </p>
          <p class="muted">
            {days(mine.chargedDays)} × {euro(rate)} = {euro(mine.carCharge)} car
            {mine.tripCosts > 0 ? ` · ${euro(mine.tripCosts)} trips` : ''}
            {mine.paid > 0 ? ` · ${euro(mine.paid)} paid` : ''}
          </p>
        </div>
      )}

      <Group
        title="Members"
        note="Paying into the rental for every day they're here"
        ledgers={drivers}
        role="driver"
        onOpen={onOpenPerson}
      />

      {riders.length > 0 && (
        <Group
          title="Riders"
          note="Charged the same day rate, but only for days they were in the car"
          ledgers={riders}
          role="rider"
          onOpen={onOpenPerson}
        />
      )}

      {settings && (
        <>
          <div class="spacer" />
          <p class="muted">
            {euro(settings.totalCost)} split across {totalMemberDays(members)} member-days
            {totalRiderDays(members) > 0 ? ` + ${totalRiderDays(members)} rider-days` : ''} ={' '}
            <strong>{euro(rate)}/day</strong> for everyone. Fuel{' '}
            {settings.fuelPrice.toFixed(2)} €/L at {settings.consumption} L/100km ={' '}
            {settings.costPerKm.toFixed(3)} €/km, split between whoever was in the car.
          </p>
        </>
      )}

    </>
  );
}

function Group({
  title,
  note,
  ledgers,
  role,
  onOpen,
}: {
  title: string;
  note: string;
  ledgers: PersonLedger[];
  role: 'driver' | 'rider';
  onOpen: (name: string) => void;
}) {
  return (
    <>
      {/* Sum of what's still outstanding, not the net — netting Robin's credit
          against everyone's debt produces a number that means nothing. */}
      <p class="section-title">
        {title}
        <span class="total">
          {euro(ledgers.reduce((s, l) => s + Math.max(l.balance, 0), 0))}
        </span>
      </p>
      <p class="muted" style="margin:0 0 6px">
        {note}
      </p>
      <ul class="list">
        {ledgers.map((l) => (
          <li key={l.name}>
            <button class="row-btn" onClick={() => onOpen(l.name)}>
              <span>
                <strong>
                  <span class={`dot ${role === 'driver' ? '' : 'dot--rider'}`} />
                  {l.name}
                </strong>
                <br />
                <span class="muted">
                  {days(l.chargedDays)} · {euro(l.carCharge + l.tripCosts)} charged
                </span>
              </span>
              <span class={`amount ${l.balance > 0.01 ? 'amount--owed' : 'amount--clear'}`}>
                {l.balance < -0.01 ? `−${euro(Math.abs(l.balance))}` : euro(l.balance)}
                <span class="chev"> ›</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}


export type { Member };
