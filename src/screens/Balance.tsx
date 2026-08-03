import { useState } from 'preact/hooks';
import type { Member } from '../api/types';
import { ADMIN_MEMBER, RESET_ENABLED } from '../config';
import { dayRate, euro, personLedger, type PersonLedger } from '../lib/cost';
import { resetAllData, useApp } from '../state/store';

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
      <p class="eyebrow">The rental</p>
      <h1>{mine && mine.balance < 0 ? "What you're owed" : 'What you owe'}</h1>
      <div class="spacer" />

      {mine && (
        <div class="card card--status center">
          <p class="muted">{mine.balance < 0 ? 'The group owes you' : 'You owe'}</p>
          <p class="summary-total">{euro(Math.abs(mine.balance))}</p>
          <p class="muted">
            {mine.chargedDays} days × {euro(rate)} = {euro(mine.carCharge)} car
            {mine.tripCosts > 0 ? ` · ${euro(mine.tripCosts)} trips` : ''}
            {mine.paid > 0 ? ` · ${euro(mine.paid)} paid` : ''}
          </p>
        </div>
      )}

      <Group
        title="Drivers"
        note="Paying into the rental for every day they're here"
        ledgers={drivers}
        onOpen={onOpenPerson}
      />

      {riders.length > 0 && (
        <Group
          title="Riders"
          note="Charged the same day rate, but only for days they were in the car"
          ledgers={riders}
          onOpen={onOpenPerson}
        />
      )}

      {settings && (
        <>
          <div class="spacer" />
          <p class="muted">
            {euro(settings.totalCost)} split across {settings.totalMemberDays} member-days
            {settings.riderDays > 0 ? ` + ${settings.riderDays} rider-days` : ''} ={' '}
            <strong>{euro(rate)}/day</strong> for everyone. Fuel{' '}
            {settings.fuelPrice.toFixed(2)} €/L at {settings.consumption} L/100km ={' '}
            {settings.costPerKm.toFixed(3)} €/km, split between whoever was in the car.
          </p>
        </>
      )}

      {RESET_ENABLED && me === ADMIN_MEMBER && <ResetPanel />}
    </>
  );
}

function Group({
  title,
  note,
  ledgers,
  onOpen,
}: {
  title: string;
  note: string;
  ledgers: PersonLedger[];
  onOpen: (name: string) => void;
}) {
  return (
    <>
      <div class="spacer" />
      <p class="eyebrow">{title}</p>
      <p class="muted" style="margin:0 0 6px">
        {note}
      </p>
      <ul class="list">
        {ledgers.map((l) => (
          <li key={l.name}>
            <button class="row-btn" onClick={() => onOpen(l.name)}>
              <span>
                <strong>{l.name}</strong>
                <br />
                <span class="muted">
                  {l.chargedDays} days · {euro(l.carCharge + l.tripCosts)} charged
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

/** Testing only — see RESET_ENABLED in src/config.ts. */
function ResetPanel() {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { backup } = await resetAllData();
      setResult(`Cleared. Backed up to the hidden tab "${backup}".`);
      setOpen(false);
      setTyped('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div class="spacer" />
      <div class="card">
        <p class="eyebrow">Testing</p>
        {result && <div class="banner banner--synced">{result}</div>}
        {error && <div class="banner banner--error">{error}</div>}

        {!open ? (
          <>
            <p class="muted">
              Empties Trip Log, Karma Log, Reservations and Payments. Members, Settings, Surf
              Spots, Places and Karma Actions are left alone, your €465 prepayment is kept, and a
              backup tab is written first.
            </p>
            <button class="btn btn--danger" onClick={() => setOpen(true)}>
              Clear all logged data
            </button>
          </>
        ) : (
          <>
            <label class="field">
              <span>Type RESET to confirm</span>
              <input
                type="text"
                autocapitalize="characters"
                value={typed}
                onInput={(e) => setTyped((e.target as HTMLInputElement).value)}
              />
            </label>
            <div class="row">
              <button
                class="btn btn--secondary"
                onClick={() => {
                  setOpen(false);
                  setTyped('');
                }}
              >
                Cancel
              </button>
              <button
                class="btn btn--danger"
                disabled={typed.trim().toUpperCase() !== 'RESET' || busy}
                onClick={() => void run()}
              >
                {busy ? 'Clearing…' : 'Clear'}
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
}

export type { Member };
