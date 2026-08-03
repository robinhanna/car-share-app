import { useApp } from '../state/store';

export interface DestinationValue {
  /** A surf spot or a town — this is what the sheet looks the distance up from. */
  place: string;
  /** What you did there. Empty for surf spots, which are self-explanatory. */
  activity: string;
}

interface Props {
  value: DestinationValue;
  onChange: (value: DestinationValue) => void;
  label?: string;
}

/**
 * Three ways to say where you went, because a surf trip and a supermarket run
 * are not the same shape: a surf spot stands alone, a town wants an activity
 * next to it, and anything else gets typed.
 *
 * Only `place` reaches the distance lookup — the activity is stored beside it.
 */
export function DestinationPicker({ value, onChange, label = 'Where to?' }: Props) {
  const { bootstrap } = useApp();
  const spots = bootstrap?.spots ?? [];
  const places = bootstrap?.places ?? [];
  const towns = places.filter((p) => p.category === 'Town');
  const activities = places.filter((p) => p.category === 'Activity');

  const isSpot = spots.some((s) => s.name === value.place);
  const isTown = towns.some((t) => t.name === value.place);
  const freeText = value.place && !isSpot && !isTown ? value.place : '';

  return (
    <>
      <label class="field">
        <span>{label} — surf spot</span>
        <select
          value={isSpot ? value.place : ''}
          onChange={(e) => {
            const name = (e.target as HTMLSelectElement).value;
            // A surf spot answers both questions at once.
            onChange({ place: name, activity: '' });
          }}
        >
          <option value="">—</option>
          {groupByZone(spots).map(([zone, list]) => (
            <optgroup key={zone} label={zone}>
              {list.map((s) => (
                <option key={s.name} value={s.name}>
                  {s.name} · {s.oneWayKm} km each way
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      <p class="or">or</p>

      <div class="row">
        <label class="field">
          <span>Town</span>
          <select
            value={isTown ? value.place : ''}
            onChange={(e) =>
              onChange({ place: (e.target as HTMLSelectElement).value, activity: value.activity })
            }
          >
            <option value="">—</option>
            {towns.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
                {t.oneWayKm ? ` · ${t.oneWayKm} km` : ''}
              </option>
            ))}
          </select>
        </label>

        <label class="field">
          <span>What for</span>
          <select
            value={value.activity}
            onChange={(e) =>
              onChange({ place: value.place, activity: (e.target as HTMLSelectElement).value })
            }
          >
            <option value="">—</option>
            {activities.map((a) => (
              <option key={a.name} value={a.name}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label class="field">
        <span>Somewhere else</span>
        <input
          type="text"
          value={freeText}
          placeholder="type a place"
          onInput={(e) =>
            onChange({ place: (e.target as HTMLInputElement).value, activity: value.activity })
          }
        />
      </label>
    </>
  );
}

function groupByZone<T extends { zone: string }>(items: T[]): [string, T[]][] {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const list = map.get(item.zone) ?? [];
    list.push(item);
    map.set(item.zone, list);
  });
  return [...map.entries()];
}
