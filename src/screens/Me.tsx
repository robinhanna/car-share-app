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
      <p class="eyebrow">Quinta Agave · August 2026</p>
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
            <button key={m.name} class="btn btn--secondary" onClick={() => onChoose(m.name)}>
              {m.name}
            </button>
          ))}
        </div>
      )}

      <div class="spacer" />
      <p class="muted">Not on the list? Ask Robin to add you to the sheet.</p>
    </>
  );
}
