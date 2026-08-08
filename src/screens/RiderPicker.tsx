import { useState } from 'preact/hooks';
import { splitRiders } from '../lib/cost';
import { useApp } from '../state/store';

interface Props {
  me: string;
  selected: string[];
  onChange: (riders: string[]) => void;
  label?: string;
}

/**
 * Riders aren't decoration: headcount is driver + paying riders, which sets the
 * per-person trip cost, and each paying rider picks up a ride-day that feeds
 * the day rate.
 *
 * Guests are the exception — they ride free. Their name is recorded against
 * this one trip so the car remembers who was in it, but it never joins the
 * roster and they never owe anything.
 */
export function RiderPicker({ me, selected, onChange, label }: Props) {
  const { bootstrap } = useApp();
  const all = bootstrap?.members ?? [];
  const members = all.filter((m) => m.name !== me);
  const [guest, setGuest] = useState('');
  const [addingGuest, setAddingGuest] = useState(false);

  // Same rule as the sheet: anyone not on the roster rides free.
  const { paying, guests } = splitRiders(selected, all);

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
        {/* Counts wallets, not bodies — a guest in the car doesn't change what
            anyone pays, and saying "3 sharing" when two are paying would
            promise a split the sheet won't produce. */}
        {label ?? 'Who else was in the car?'} ({paying.length + 1} sharing
        {guests.length > 0 ? `, ${guests.length} free` : ''})
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
            data-role="guest"
            aria-pressed={true}
            onClick={() => toggle(name)}
          >
            <span class="dot dot--guest" />
            {name}
          </button>
        ))}

        {!addingGuest && (
          <button type="button" class="chip chip--add" onClick={() => setAddingGuest(true)}>
            + Guest
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
        {guests.length > 0 && (
          <span>
            <span class="dot dot--guest" />
            rides free
          </span>
        )}
      </p>
    </div>
  );
}
