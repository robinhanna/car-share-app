import { useState } from 'preact/hooks';
import type { KarmaAction, KarmaEntry } from '../api/types';
import { ADMIN_MEMBER } from '../config';
import { euro } from '../lib/cost';
import { shortDate } from '../lib/dates';
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

  const entries = [...(bootstrap?.karmaLog ?? [])].sort((a, b) => b.date.localeCompare(a.date));

  /**
   * Removing a refuel takes its euros back out too, so the confirm has to say
   * so — Robin's call. The amount isn't on the karma row, so it's matched
   * against the payment `logKarma_` wrote alongside it; when that can't be
   * found the warning stays general rather than inventing a figure.
   */
  const remove = (k: KarmaEntry) => {
    const paired = costsMoney(k.action)
      ? (bootstrap?.payments ?? []).find(
          (p) =>
            p.type === 'fuel' &&
            p.name === k.name &&
            p.note === k.action &&
            p.date.slice(0, 10) === k.date.slice(0, 10),
        )
      : undefined;

    const money = paired
      ? ` ${euro(paired.amount)} of fuel money comes off ${k.name}'s balance with it.`
      : costsMoney(k.action)
        ? ' Any fuel money credited with it comes off too.'
        : '';

    if (!confirm(`Remove ${k.name}'s "${k.action}" (+${k.points})?${money}`)) return;
    void queueOp('deleteKarma', { id: k.id });
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
      <p class="kicker">Karma · {myKarma} points</p>
      <h1>What did you do?</h1>
      <p class="muted">
        Karma never changes what anyone pays. It only breaks ties when two people want the car.
      </p>
      <div class="spacer" />

      {justLogged && <div class="banner banner--synced">Logged: {justLogged} ✓</div>}

      {spending ? (
        <div class="card">
          <p class="kicker">{spending.action}</p>
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
      <p class="section-title">Everyone</p>
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

      {/* The leaderboard alone gives you a number and no way to reach the thing
          behind it, so a mis-tapped point was permanent. */}
      {entries.length > 0 && (
        <>
          <div class="spacer" />
          <p class="section-title">Recently</p>
          <ul class="list">
            {entries.map((k) => (
              <li key={k.id || `${k.date}-${k.name}-${k.action}`}>
                <span>
                  <strong>{k.name}</strong> · {k.action}
                  <br />
                  <span class="muted">{shortDate(k.date)}</span>
                </span>
                <span class="row-actions">
                  <span class="amount">+{k.points}</span>
                  {me === ADMIN_MEMBER && k.id && (
                    <button
                      class="icon-btn icon-btn--danger"
                      aria-label="Remove"
                      onClick={() => remove(k)}
                    >
                      ✕
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
