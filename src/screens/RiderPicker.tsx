import { useState } from 'preact/hooks';
import { useApp } from '../state/store';

interface Props {
  me: string;
  selected: string[];
  onChange: (riders: string[]) => void;
  label?: string;
}

/**
 * Riders aren't decoration: headcount is driver + riders, which sets the
 * per-person trip cost, and each rider picks up a ride-day that feeds the day
 * rate. Guests count exactly like anyone else.
 */
export function RiderPicker({ me, selected, onChange, label }: Props) {
  const { bootstrap } = useApp();
  const members = (bootstrap?.members ?? []).filter((m) => m.name !== me);
  const [guest, setGuest] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  const known = new Set(members.map((m) => m.name));
  const guests = selected.filter((n) => !known.has(n));

  const toggle = (name: string) => {
    onChange(selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name]);
  };

  const addGuest = () => {
    const name = guest.trim();
    if (!name || selected.includes(name)) {
      setGuest('');
      setAddingGuest(false);
      return;
    }
    onChange([...selected, name]);
    setGuest('');
    setAddingGuest(false);
  };

  return (
    <div class="field">
      <span>
        {label ?? 'Who else was in the car?'} ({selected.length + 1} sharing)
      </span>
      <div class="chips">
        {members.map((m) => (
          <button
            key={m.name}
            type="button"
            class="chip"
            data-role={m.included ? 'driver' : 'rider'}
            aria-pressed={selected.includes(m.name)}
            onClick={() => toggle(m.name)}
          >
            <span class={`dot ${m.included ? '' : 'dot--rider'}`} />
            {m.name}
          </button>
        ))}

        {guests.map((name) => (
          <button
            key={name}
            type="button"
            class="chip"
            data-role="rider"
            aria-pressed={true}
            onClick={() => toggle(name)}
          >
            <span class="dot dot--rider" />
            {name}
          </button>
        ))}

        {!addingGuest && (
          <button type="button" class="chip chip--add" onClick={() => setAddingGuest(true)}>
            + Someone else
          </button>
        )}
      </div>

      {addingGuest && (
        <div class="row" style="margin-top:10px">
          <input
            type="text"
            value={guest}
            placeholder="Their name"
            autofocus
            onInput={(e) => setGuest((e.target as HTMLInputElement).value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addGuest();
              }
            }}
          />
          <button type="button" class="btn btn--secondary" onClick={addGuest}>
            Add
          </button>
        </div>
      )}

      <p class="legend">
        <span>
          <span class="dot" />
          pays into the rental
        </span>
        <span>
          <span class="dot dot--rider" />
          pays per day ridden
        </span>
      </p>
    </div>
  );
}
