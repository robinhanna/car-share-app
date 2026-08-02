import { useState } from 'preact/hooks';
import { ADMIN_MEMBER, RESET_ENABLED } from '../config';
import { euro } from '../lib/cost';
import { resetAllData, useApp } from '../state/store';

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

      {RESET_ENABLED && me === ADMIN_MEMBER && <ResetPanel />}
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
              Empties Trip Log, Karma Log and Reservations. Members, Settings, Surf Spots and
              Karma Actions are left alone, and a backup tab is written first.
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
