import { useApp } from '../state/store';

interface Props {
  me: string;
  selected: string[];
  onChange: (riders: string[]) => void;
}

/**
 * Riders aren't decoration: headcount = driver + riders, and that number drives
 * the per-person cost written to the Sheet.
 */
export function RiderPicker({ me, selected, onChange }: Props) {
  const { bootstrap } = useApp();
  const others = (bootstrap?.members ?? []).filter((m) => m.name !== me);

  const toggle = (name: string) => {
    onChange(
      selected.includes(name) ? selected.filter((n) => n !== name) : [...selected, name],
    );
  };

  return (
    <div class="field">
      <span>Who else was in the car? ({selected.length + 1} sharing)</span>
      <div class="chips">
        {others.map((m) => (
          <button
            key={m.name}
            type="button"
            class="chip"
            aria-pressed={selected.includes(m.name)}
            onClick={() => toggle(m.name)}
          >
            {m.name}
          </button>
        ))}
      </div>
    </div>
  );
}
