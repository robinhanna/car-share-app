import { useState } from 'preact/hooks';
import type { KarmaAction } from '../api/types';
import { euro } from '../lib/cost';
import { queueOp, useApp } from '../state/store';

/**
 * Which karma actions involve spending money. Matched on the action text rather
 * than a Sheet column, so Robin can rename or add actions without needing a
 * schema change — "Refuel", "Refuelled the car", "petrol" all work.
 */
function costsMoney(action: string): boolean {
  return /refuel|fuel|petrol|gas|diesel|tank/i.test(action);
}

interface Props {
  me: string;
}

export function Karma({ me }: Props) {
  const { bootstrap } = useApp();
  const actions = bootstrap?.karmaActions ?? [];
  const myKarma = bootstrap?.members.find((m) => m.name === me)?.karma ?? 0;
  const [justLogged, setJustLogged] = useState<string | null>(null);
  const [spending, setSpending] = useState<KarmaAction | null>(null);
  const [amount, setAmount] = useState('');

  const log = async (action: string, points: number, spent?: number) => {
    await queueOp('logKarma', {
      date: new Date().toISOString(),
      name: me,
      action,
      points,
      amount: spent,
    });
    setJustLogged(spent ? `${action} · ${euro(spent)} credited` : action);
    setTimeout(() => setJustLogged(null), 3000);
  };

  const tap = (a: KarmaAction) => {
    // Refuelling costs real money, and that money should come off what they owe.
    if (costsMoney(a.action)) {
      setSpending(a);
      setAmount('');
      return;
    }
    void log(a.action, a.points);
  };

  return (
    <>
      <p class="eyebrow">Karma · {myKarma} points</p>
      <h1>What did you do?</h1>
      <p class="muted">
        Karma never changes what anyone pays. It only breaks ties when two people want the car.
      </p>
      <div class="spacer" />

      {justLogged && <div class="banner banner--synced">Logged: {justLogged} ✓</div>}

      {spending ? (
        <div class="card">
          <p class="eyebrow">{spending.action}</p>
          <label class="field">
            <span>How much did you spend?</span>
            <input
              type="number"
              inputMode="decimal"
              autofocus
              value={amount}
              placeholder="€"
              onInput={(e) => setAmount((e.target as HTMLInputElement).value)}
            />
          </label>
          <p class="muted">
            This comes off what you owe. Leave it empty if someone else paid — you still get the
            karma.
          </p>
          <div class="row">
            <button class="btn btn--secondary" onClick={() => setSpending(null)}>
              Cancel
            </button>
            <button
              class="btn btn--teal"
              onClick={() => {
                const spent = Number(amount);
                void log(spending.action, spending.points, spent > 0 ? spent : undefined);
                setSpending(null);
              }}
            >
              Log it
            </button>
          </div>
        </div>
      ) : (
        <div class="btn-stack">
          {actions.map((a) => (
            <button key={a.action} class="btn btn--teal" onClick={() => tap(a)}>
              {a.action}
              <span class="amount">+{a.points}</span>
            </button>
          ))}
        </div>
      )}

      {actions.length === 0 && (
        <div class="card">
          <p class="muted">No karma actions set up yet — add rows to the Karma Actions tab.</p>
        </div>
      )}

      <div class="spacer" />
      <p class="eyebrow">Everyone</p>
      <ul class="list">
        {[...(bootstrap?.members ?? [])]
          .sort((a, b) => b.karma - a.karma)
          .map((m) => (
            <li key={m.name}>
              <span>{m.name}</span>
              <span class="amount">{m.karma}</span>
            </li>
          ))}
      </ul>
    </>
  );
}
