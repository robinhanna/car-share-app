import type { Member } from '../api/types';

interface Props {
  members: Member[];
  onChoose: (name: string) => void;
}

/**
 * The whole of "authentication". Tapping a name writes it to localStorage, so
 * this screen appears once per phone and never again.
 */
export function Me({ members, onChoose }: Props) {
  return (
    <>
      <p class="eyebrow">Soul &amp; Surf · Almádena</p>
      <h1>Who are you?</h1>
      <p class="muted">Your phone remembers — you'll only pick this once.</p>
      <div class="spacer" />

      {members.length === 0 ? (
        <div class="card">
          <p class="muted">
            No members loaded yet. Once you're online the list comes from the Sheet.
          </p>
        </div>
      ) : (
        <div class="btn-stack">
          {members.map((m) => (
            <button
              key={m.name}
              class={`btn btn--secondary name-btn ${m.included ? '' : 'name-btn--rider'}`}
              onClick={() => onChoose(m.name)}
            >
              {m.name}
              <span class="role">{m.included ? 'member' : 'rider'}</span>
            </button>
          ))}
        </div>
      )}

      <p class="legend">
        <span>
          <span class="dot" />
          member — pays into the rental
        </span>
        <span>
          <span class="dot dot--rider" />
          rider — pays per day in the car
        </span>
      </p>

      <div class="spacer" />
      <p class="muted">Not on the list? Ask Robin to add you to the sheet.</p>
    </>
  );
}
