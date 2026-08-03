import { useState } from 'preact/hooks';
import { ADMIN_MEMBER } from '../config';
import {
  dayRate,
  euro,
  km,
  personLedger,
  personPayments,
  personTrips,
} from '../lib/cost';
import { localDateInput, shortDate } from '../lib/dates';
import { queueOp, useApp } from '../state/store';

interface Props {
  name: string;
  me: string;
}

/**
 * One person's ledger: what the car cost them, what each trip cost them, and
 * everything they've paid — each line dated, so a disagreement can be settled by
 * pointing at a row rather than re-deriving the month.
 */
export function PersonDetail({ name, me }: Props) {
  const { bootstrap } = useApp();
  const settings = bootstrap?.settings;
  const members = bootstrap?.members ?? [];
  const member = members.find((m) => m.name === name);

  const trips = personTrips(name, bootstrap?.recentTrips ?? []);
  const payments = personPayments(name, bootstrap?.payments ?? []);
  const karma = (bootstrap?.karmaLog ?? []).filter((k) => k.name === name);

  if (!member || !settings) {
    return (
      <>
        <h1>{name}</h1>
        <p class="muted">Nothing recorded yet.</p>
      </>
    );
  }

  const rate = dayRate(members, settings);
  const ledger = personLedger(member, bootstrap?.recentTrips ?? [], bootstrap?.payments ?? [], rate);
  const owes = ledger.balance > 0.01;

  return (
    <>
      <p class="eyebrow">
        {member.role}
        {member.included ? '' : ' · pays for days ridden only'}
      </p>
      <h1>{name}</h1>

      <div class="card card--status center">
        <p class="muted">{owes ? 'Owes' : 'Is owed'}</p>
        <p class="summary-total">{euro(Math.abs(ledger.balance))}</p>
        <p class="muted">
          {euro(ledger.carCharge + ledger.tripCosts)} charged · {euro(ledger.paid)} paid
        </p>
      </div>

      <p class="eyebrow">The car</p>
      <ul class="list">
        <li>
          <span>
            {ledger.chargedDays} {member.included ? 'days here' : 'days in the car'} ×{' '}
            {euro(rate)}
          </span>
          <span class="amount">{euro(ledger.carCharge)}</span>
        </li>
      </ul>

      <div class="spacer" />
      <p class="eyebrow">Trips · {euro(ledger.tripCosts)}</p>
      {trips.length === 0 ? (
        <p class="muted">No trips yet.</p>
      ) : (
        <ul class="list">
          {trips.map((t) => (
            <li key={t.id || `${t.date}-${t.destination}`}>
              <span>
                <strong>{t.destination || 'Trip'}</strong>
                {t.activity ? ` · ${t.activity}` : ''}
                <br />
                <span class="muted">
                  {shortDate(t.date)} · {km(t.distanceKm)} · {t.people} sharing
                  {t.driver === name ? ' · you drove' : ''}
                </span>
              </span>
              <span class="amount">{euro(t.perPerson)}</span>
            </li>
          ))}
        </ul>
      )}

      <div class="spacer" />
      <p class="eyebrow">Payments · {euro(ledger.paid)}</p>
      {payments.length === 0 ? (
        <p class="muted">Nothing paid yet.</p>
      ) : (
        <ul class="list">
          {payments.map((p, i) => (
            <li key={`${p.date}-${i}`}>
              <span>
                <strong>{paymentLabel(p.type)}</strong>
                {p.note && p.type !== 'prepayment' ? ` · ${p.note}` : ''}
                <br />
                <span class="muted">{shortDate(p.date)}</span>
              </span>
              <span class="amount amount--clear">−{euro(p.amount)}</span>
            </li>
          ))}
        </ul>
      )}

      <div class="spacer" />
      <p class="eyebrow">Karma · {karma.reduce((s, k) => s + k.points, 0)} points</p>
      {karma.length === 0 ? (
        <p class="muted">No karma logged.</p>
      ) : (
        <ul class="list">
          {karma.map((k, i) => (
            <li key={`${k.date}-${i}`}>
              <span>
                {k.action}
                <br />
                <span class="muted">{shortDate(k.date)}</span>
              </span>
              <span class="amount">+{k.points}</span>
            </li>
          ))}
        </ul>
      )}

      {me === ADMIN_MEMBER && name !== me && <RecordPayment name={name} />}

      <div class="spacer" />
      <p class="muted">
        Fuel is estimated from distance, never receipts — that's what decides who owes what. Money
        actually spent at the pump shows up above as a payment.
      </p>
    </>
  );
}

/**
 * Robin recording that someone handed him cash. Admin-only, because it is the
 * one entry nobody can make on their own behalf without it being an assertion
 * about someone else's money.
 */
function RecordPayment({ name }: { name: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateInput(new Date()));
  const [note, setNote] = useState('');

  const value = Number(amount);

  const save = async () => {
    await queueOp('logPayment', {
      date: new Date(date).toISOString(),
      name,
      type: 'cash',
      amount: value,
      note,
    });
    setOpen(false);
    setAmount('');
    setNote('');
  };

  return (
    <>
      <div class="spacer" />
      {!open ? (
        <button class="btn btn--secondary" onClick={() => setOpen(true)}>
          {name} paid me cash
        </button>
      ) : (
        <div class="card">
          <p class="eyebrow">Cash from {name}</p>
          <div class="row">
            <label class="field">
              <span>Amount (€)</span>
              <input
                type="number"
                inputMode="decimal"
                autofocus
                value={amount}
                onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
              />
            </label>
            <label class="field">
              <span>When</span>
              <input
                type="date"
                value={date}
                onInput={(e) => setDate((e.target as HTMLInputElement).value)}
              />
            </label>
          </div>
          <label class="field">
            <span>Note</span>
            <input
              type="text"
              value={note}
              placeholder="optional"
              onInput={(e) => setNote((e.target as HTMLInputElement).value)}
            />
          </label>
          <div class="row">
            <button class="btn btn--secondary" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button class="btn" disabled={!(value > 0)} onClick={() => void save()}>
              Record
            </button>
          </div>
        </div>
      )}
    </>
  );
}

function paymentLabel(type: string): string {
  switch (type) {
    case 'fuel':
      return 'Fuel bought';
    case 'tolls':
      return 'Tolls paid';
    case 'parking':
      return 'Parking paid';
    case 'prepayment':
      return 'Rental paid upfront';
    default:
      return 'Cash';
  }
}
