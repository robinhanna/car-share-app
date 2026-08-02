import { useState } from 'preact/hooks';
import { queueOp, useApp } from '../state/store';

interface Props {
  me: string;
}

export function Karma({ me }: Props) {
  const { bootstrap } = useApp();
  const actions = bootstrap?.karmaActions ?? [];
  const myKarma = bootstrap?.members.find((m) => m.name === me)?.karma ?? 0;
  const [justLogged, setJustLogged] = useState<string | null>(null);

  const log = async (action: string, points: number) => {
    await queueOp('logKarma', {
      date: new Date().toISOString(),
      name: me,
      action,
      points,
    });
    setJustLogged(action);
    setTimeout(() => setJustLogged(null), 2500);
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

      <div class="btn-stack">
        {actions.map((a) => (
          <button key={a.action} class="btn btn--teal" onClick={() => void log(a.action, a.points)}>
            {a.action}
            <span class="amount">+{a.points}</span>
          </button>
        ))}
      </div>

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
