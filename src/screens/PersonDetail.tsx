import { useState } from 'preact/hooks';
import type { Payment, Trip } from '../api/types';
import { ADMIN_MEMBER } from '../config';
import {
  dayRate,
  days,
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
  onOpenTrip: (trip: Trip) => void;
}

/**
 * One person's ledger: what the car cost them, what each trip cost them, and
 * everything they've paid — each line dated, so a disagreement can be settled by
 * pointing at a row rather than re-deriving the month.
 */
export function PersonDetail({ name, me, onOpenTrip }: Props) {
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
        <p class={`summary-total ${owes ? 'summary-total--owed' : 'summary-total--clear'}`}>
          {euro(Math.abs(ledger.balance))}
        </p>
        <p class="muted">
          {euro(ledger.carCharge + ledger.tripCosts)} charged · {euro(ledger.paid)} paid
        </p>
      </div>

      <p class="section-title">
        The car <span class="total">{euro(ledger.carCharge)}</span>
      </p>
      <ul class="list">
        <li>
          <span>
            {days(ledger.chargedDays)} {member.included ? "here" : "in the car"} ×{" "}
            {euro(rate)}
          </span>
          <span class="amount">{euro(ledger.carCharge)}</span>
        </li>
      </ul>

      <p class="section-title">
        Trips <span class="total">{euro(ledger.tripCosts)}</span>
      </p>
      {trips.length === 0 ? (
        <p class="muted">No trips yet.</p>
      ) : (
        <ul class="list">
          {trips.map((t) => (
            <li key={t.id || `${t.date}-${t.destination}`}>
              <button class="row-btn" onClick={() => onOpenTrip(t)}>
                <span>
                  <strong>{t.destination || 'Trip'}</strong>
                  {t.activity ? ` · ${t.activity}` : ''}
                  <br />
                  <span class="muted">
                    {shortDate(t.date)} · {km(t.distanceKm)} · {t.people} sharing
                    {t.driver === name ? ' · they drove' : ''}
                  </span>
                </span>
                <span class="amount">
                  {euro(t.perPerson)}
                  <span class="chev"> ›</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <p class="section-title">
        Payments <span class="total total--credit">−{euro(ledger.paid)}</span>
      </p>
      {payments.length === 0 ? (
        <p class="muted">Nothing paid yet.</p>
      ) : (
        <ul class="list">
          {payments.map((p, i) => (
            <li key={`${p.date}-${i}`}>
              <span>
                <strong>{paymentLabel(p, name)}</strong>
                {p.note && p.type !== 'prepayment' ? ` · ${p.note}` : ''}
                <br />
                <span class="muted">{shortDate(p.date)}</span>
              </span>
              {/* A negative row is the receiving side of a transfer: it reduces
                  what this person is owed, so it reads as a charge, not a credit. */}
              <span class={`amount ${p.amount < 0 ? 'amount--owed' : 'amount--clear'}`}>
                {p.amount < 0 ? '+' : '−'}
                {euro(Math.abs(p.amount))}
              </span>
            </li>
          ))}
        </ul>
      )}

      <p class="section-title">
        Karma <span class="total">{karma.reduce((s, k) => s + k.points, 0)} pts</span>
      </p>
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

      <SettleUp name={name} me={me} />

      <div class="spacer" />
      <p class="muted">
        Fuel is estimated from distance, never receipts — that's what decides who owes what. Money
        actually spent at the pump shows up above as a payment.
      </p>
    </>
  );
}

/**
 * Recording money changing hands. Anyone can record their own — "I gave Robin
 * €50" — and Robin can record one on anybody's page, in either direction, since
 * he may be repaying someone who fronted a lot of fuel.
 *
 * Both sides are written by the backend, so the payer's debt and the receiver's
 * credit always move together.
 */
function SettleUp({ name, me }: { name: string; me: string }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(localDateInput(new Date()));
  const [note, setNote] = useState('');
  const [theyPaid, setTheyPaid] = useState(true);
  const [done, setDone] = useState<string | null>(null);

  const { bootstrap } = useApp();
  const everyoneElse = (bootstrap?.members ?? []).map((m) => m.name).filter((n) => n !== me);
  const [withWhom, setWithWhom] = useState(everyoneElse[0] ?? '');

  const value = Number(amount);
  const ownPage = name === me;
  const isAdmin = me === ADMIN_MEMBER;

  // Robin is everyone's counterparty, so on his own page he picks who. For
  // anyone else their own page means "I paid Robin", and on someone else's page
  // only Robin may write, in either direction.
  const from = ownPage ? (isAdmin ? withWhom : me) : theyPaid ? name : me;
  const to = ownPage ? (isAdmin ? me : ADMIN_MEMBER) : theyPaid ? me : name;

  const save = async () => {
    await queueOp('settleUp', {
      date: new Date(date).toISOString(),
      from,
      to,
      amount: value,
      note,
    });
    setDone(`${from} → ${to}`);
    setOpen(false);
    setAmount('');
    setNote('');
    setTimeout(() => setDone(null), 3000);
  };

  // Everyone can record a settle-up on their own page; Robin can also record
  // one on anybody's. Julia looking at Jonas has no business writing an entry
  // about the two of them, so there's no button there.
  const allowed = ownPage || isAdmin;
  if (!allowed) return null;

  return (
    <>
      <div class="spacer" />
      {done && <div class="banner banner--synced">Settled: {done} ✓</div>}

      {!open ? (
        <button class="btn btn--secondary" onClick={() => setOpen(true)}>
          {ownPage && !isAdmin ? `Settle up with ${ADMIN_MEMBER}` : 'Settle up'}
        </button>
      ) : (
        <div class="card">
          <p class="kicker">Settle up</p>

          {ownPage && isAdmin && (
            <label class="field">
              <span>Who paid you?</span>
              <select
                value={withWhom}
                onChange={(e) => setWithWhom((e.target as HTMLSelectElement).value)}
              >
                {everyoneElse.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          )}

          {!ownPage && (
            <div class="field">
              <span>Which way?</span>
              <div class="segmented">
                <button aria-pressed={theyPaid} onClick={() => setTheyPaid(true)}>
                  {name} paid me
                </button>
                <button aria-pressed={!theyPaid} onClick={() => setTheyPaid(false)}>
                  I paid {name}
                </button>
              </div>
            </div>
          )}

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

          <p class="muted">
            Comes off what {from} owes and off what {to} is owed.
          </p>

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

function paymentLabel(p: Payment, _person: string): string {
  switch (p.type) {
    case 'fuel':
      return 'Fuel bought';
    case 'tolls':
      return 'Tolls paid';
    case 'parking':
      return 'Parking paid';
    case 'prepayment':
      return 'Rental paid upfront';
    case 'settlement':
      return p.amount < 0 ? 'Money received' : 'Money handed over';
    default:
      return 'Cash';
  }
}
