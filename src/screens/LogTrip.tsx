import { useMemo, useState } from 'preact/hooks';
import type { TripType } from '../api/types';
import { euro, km, tripCost, tripDistanceKm, type TripCost } from '../lib/cost';
import { queueOp, useApp } from '../state/store';
import { RiderPicker } from './RiderPicker';

interface Props {
  me: string;
  reservationId?: string;
  onDone: (cost: TripCost, destination: string) => void;
}

type Mode = 'spot' | 'odometer' | 'manual';

export function LogTrip({ me, reservationId, onDone }: Props) {
  const { bootstrap } = useApp();
  const spots = bootstrap?.spots ?? [];
  const settings = bootstrap?.settings;

  const [mode, setMode] = useState<Mode>('spot');
  const [spotName, setSpotName] = useState('');
  const [tripType, setTripType] = useState<TripType>('Round trip');
  const [manualKm, setManualKm] = useState('');
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [riders, setRiders] = useState<string[]>([]);
  const [tolls, setTolls] = useState('');
  const [parking, setParking] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const spot = spots.find((s) => s.name === spotName) ?? null;

  const distanceKm = useMemo(
    () =>
      tripDistanceKm({
        odoStart: mode === 'odometer' ? numOrNull(odoStart) : null,
        odoEnd: mode === 'odometer' ? numOrNull(odoEnd) : null,
        spot: mode === 'spot' ? spot : null,
        tripType,
        manualKm: mode === 'manual' ? numOrNull(manualKm) : null,
      }),
    [mode, odoStart, odoEnd, spot, tripType, manualKm],
  );

  const cost = settings
    ? tripCost(
        {
          distanceKm,
          tolls: numOrNull(tolls) ?? 0,
          parking: numOrNull(parking) ?? 0,
          riderCount: riders.length,
        },
        settings,
      )
    : null;

  const destination = mode === 'spot' ? spotName : notes.trim() || 'Other';
  const canSave = distanceKm > 0 && !saving;

  const save = async () => {
    if (!cost) return;
    setSaving(true);
    await queueOp('completeTrip', {
      date: new Date().toISOString(),
      driver: me,
      destination: mode === 'spot' ? spotName : '',
      manualKm: mode === 'manual' ? numOrNull(manualKm) : null,
      odoStart: mode === 'odometer' ? numOrNull(odoStart) : null,
      odoEnd: mode === 'odometer' ? numOrNull(odoEnd) : null,
      tripType,
      riders,
      tolls: numOrNull(tolls) ?? 0,
      parking: numOrNull(parking) ?? 0,
      notes,
      reservationId: reservationId ?? '',
    });
    onDone(cost, destination);
  };

  return (
    <>
      <p class="eyebrow">Trip</p>
      <h1>Log a trip</h1>
      <div class="spacer" />

      <div class="segmented" style="grid-template-columns:1fr 1fr 1fr">
        <button aria-pressed={mode === 'spot'} onClick={() => setMode('spot')}>
          Spot
        </button>
        <button aria-pressed={mode === 'odometer'} onClick={() => setMode('odometer')}>
          Odometer
        </button>
        <button aria-pressed={mode === 'manual'} onClick={() => setMode('manual')}>
          Just km
        </button>
      </div>
      <div class="spacer" />

      {mode === 'spot' && (
        <>
          <label class="field">
            <span>Where did you go?</span>
            <select
              value={spotName}
              onChange={(e) => setSpotName((e.target as HTMLSelectElement).value)}
            >
              <option value="">Pick a spot…</option>
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

          <div class="field">
            <span>Trip type</span>
            <div class="segmented">
              <button
                aria-pressed={tripType === 'Round trip'}
                onClick={() => setTripType('Round trip')}
              >
                There and back
              </button>
              <button aria-pressed={tripType === 'One-way'} onClick={() => setTripType('One-way')}>
                One way
              </button>
            </div>
          </div>
        </>
      )}

      {mode === 'odometer' && (
        <div class="row">
          <label class="field">
            <span>Odometer start</span>
            <input
              type="number"
              inputMode="numeric"
              value={odoStart}
              onInput={(e) => setOdoStart((e.target as HTMLInputElement).value)}
            />
          </label>
          <label class="field">
            <span>Odometer end</span>
            <input
              type="number"
              inputMode="numeric"
              value={odoEnd}
              onInput={(e) => setOdoEnd((e.target as HTMLInputElement).value)}
            />
          </label>
        </div>
      )}

      {mode === 'manual' && (
        <label class="field">
          <span>Distance driven (km)</span>
          <input
            type="number"
            inputMode="decimal"
            value={manualKm}
            onInput={(e) => setManualKm((e.target as HTMLInputElement).value)}
          />
        </label>
      )}

      <RiderPicker me={me} selected={riders} onChange={setRiders} />

      <div class="row">
        <label class="field">
          <span>Tolls (€)</span>
          <input
            type="number"
            inputMode="decimal"
            value={tolls}
            onInput={(e) => setTolls((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Parking (€)</span>
          <input
            type="number"
            inputMode="decimal"
            value={parking}
            onInput={(e) => setParking((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <label class="field">
        <span>Notes</span>
        <input
          type="text"
          value={notes}
          placeholder="optional"
          onInput={(e) => setNotes((e.target as HTMLInputElement).value)}
        />
      </label>

      {cost && distanceKm > 0 && (
        <div class="card">
          <p class="eyebrow">Running total</p>
          <p class="muted">
            {km(distanceKm)} · {euro(cost.total)} total · {cost.people}{' '}
            {cost.people === 1 ? 'person' : 'people'}
          </p>
          <p class="status-line">{euro(cost.perPerson)} each</p>
        </div>
      )}

      <button class="btn" disabled={!canSave} onClick={() => void save()}>
        {saving ? 'Saving…' : 'Save trip'}
      </button>
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

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
