import { useMemo, useState } from 'preact/hooks';
import type { Place, RideRequest, Spot, Trip, TripType } from '../api/types';
import { euro, km, tripCost, tripDistanceKm, type TripCost } from '../lib/cost';
import { clockTime, localDateInput } from '../lib/dates';
import { queueOp, useApp } from '../state/store';
import { DestinationPicker, type DestinationValue } from './DestinationPicker';
import { RiderPicker } from './RiderPicker';

interface Props {
  me: string;
  reservationId?: string;
  /** Set when this trip is fulfilling someone's ride request. */
  ride?: RideRequest;
  /** Set when correcting a trip that's already logged. */
  trip?: Trip;
  onDone: (cost: TripCost, destination: string) => void;
}

type Mode = 'spot' | 'odometer' | 'manual';

export function LogTrip({ me, reservationId, ride, trip, onDone }: Props) {
  const { bootstrap } = useApp();
  const spots = bootstrap?.spots ?? [];
  const places = bootstrap?.places ?? [];
  const settings = bootstrap?.settings;

  // Editing an existing trip starts from what was logged; a new one from now.
  const when = trip ? new Date(trip.date) : new Date();

  const [mode, setMode] = useState<Mode>(trip && !trip.destination ? 'manual' : 'spot');
  const [date, setDate] = useState(localDateInput(when));
  const [time, setTime] = useState(clockTime(when));
  const [origin, setOrigin] = useState(trip?.origin || 'Quinta');
  const [boards, setBoards] = useState(!!trip?.boards);
  const [destinationValue, setDestinationValue] = useState<DestinationValue>({
    place: trip?.destination ?? '',
    activity: trip?.activity ?? '',
  });
  const [tripType, setTripType] = useState<TripType>(trip?.tripType ?? 'Round trip');
  const [manualKm, setManualKm] = useState(
    trip && !trip.destination ? String(trip.distanceKm) : '',
  );
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [riders, setRiders] = useState<string[]>(
    trip ? trip.riders : ride ? [ride.passenger, ...ride.others] : [],
  );
  const [taxi, setTaxi] = useState(trip ? trip.taxi : !!ride);
  const [tolls, setTolls] = useState(trip?.tolls ? String(trip.tolls) : '');
  const [parking, setParking] = useState(trip?.parking ? String(trip.parking) : '');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // The distance can come from either table — a surf spot or a town in Places.
  const spot =
    spots.find((s) => s.name === destinationValue.place) ??
    toSpot(places.find((p) => p.name === destinationValue.place && p.category === 'Town'));

  const distanceKm = useMemo(
    () =>
      tripDistanceKm({
        odoStart: mode === 'odometer' ? numOrNull(odoStart) : null,
        odoEnd: mode === 'odometer' ? numOrNull(odoEnd) : null,
        spot: mode === 'spot' ? spot : null,
        tripType,
        taxi,
        manualKm: mode === 'manual' ? numOrNull(manualKm) : null,
      }),
    [mode, odoStart, odoEnd, spot, tripType, manualKm, taxi],
  );

  const cost = settings
    ? tripCost(
        {
          distanceKm,
          tolls: numOrNull(tolls) ?? 0,
          parking: numOrNull(parking) ?? 0,
          riderCount: riders.length,
          taxi,
          boards,
        },
        settings,
      )
    : null;

  const destination = mode === 'spot' ? destinationValue.place : notes.trim() || 'Other';
  const canSave = distanceKm > 0 && !saving;

  const save = async () => {
    if (!cost) return;
    setSaving(true);

    const common = {
      // Keep the time of day so two trips on one date still read in order, but
      // let the chosen day win — people log yesterday's drive over breakfast.
      date: new Date(`${date}T${time}`).toISOString(),
      driver: me,
      destination: mode === 'spot' ? destinationValue.place : '',
      activity: mode === 'spot' ? destinationValue.activity : '',
      manualKm: mode === 'manual' ? numOrNull(manualKm) : null,
      odoStart: mode === 'odometer' ? numOrNull(odoStart) : null,
      odoEnd: mode === 'odometer' ? numOrNull(odoEnd) : null,
      tripType,
      riders,
      tolls: numOrNull(tolls) ?? 0,
      parking: numOrNull(parking) ?? 0,
      notes,
      taxi,
      origin,
      boards,
    };

    if (trip) {
      await queueOp('editTrip', { ...common, tripId: trip.id, driver: trip.driver });
    } else {
      await queueOp('completeTrip', {
        ...common,
        reservationId: reservationId ?? '',
        rideRequestId: ride?.id ?? '',
      });
    }
    onDone(cost, destination);
  };

  return (
    <>
      <p class="kicker">{trip ? 'Correcting' : 'Trip'}</p>
      <h1>{trip ? 'Edit this trip' : 'Log a trip'}</h1>
      <div class="spacer" />

      <div class="row">
        <label class="field">
          <span>Date</span>
          <input
            type="date"
            value={date}
            max={localDateInput(new Date())}
            onInput={(e) => setDate((e.target as HTMLInputElement).value)}
          />
        </label>
        <label class="field">
          <span>Time</span>
          <input
            type="time"
            value={time}
            onInput={(e) => setTime((e.target as HTMLInputElement).value)}
          />
        </label>
      </div>

      <label class="field">
        <span>Starting from</span>
        <input
          type="text"
          value={origin}
          placeholder="Quinta"
          onInput={(e) => setOrigin((e.target as HTMLInputElement).value)}
        />
      </label>

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
          <DestinationPicker
            value={destinationValue}
            onChange={setDestinationValue}
            label="Where did you go?"
          />

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

      <div class="field">
        <span>Boards on the roof?</span>
        <div class="segmented">
          <button aria-pressed={!boards} onClick={() => setBoards(false)}>
            No
          </button>
          <button aria-pressed={boards} onClick={() => setBoards(true)}>
            Yes
          </button>
        </div>
      </div>

      <div class="field">
        <span>Who's paying?</span>
        <div class="segmented">
          <button aria-pressed={!taxi} onClick={() => setTaxi(false)}>
            Split with me
          </button>
          <button
            aria-pressed={taxi}
            disabled={riders.length === 0}
            onClick={() => setTaxi(true)}
          >
            I drove them
          </button>
        </div>
        <p class="muted" style="margin:8px 0 0">
          {taxi
            ? `A lift: the ${riders.length === 1 ? 'passenger covers' : 'passengers cover'} the cost, you pay nothing.`
            : 'A shared trip: the cost splits between everyone in the car, you included.'}
        </p>
      </div>

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
          <p class="kicker">Running total</p>
          <p class="muted">
            {km(distanceKm)} · {euro(cost.total)} total · {cost.people}{' '}
            {cost.people === 1 ? 'person' : 'people'}
          </p>
          <p class="status-line">{euro(cost.perPerson)} each</p>
        </div>
      )}

      <button class="btn" disabled={!canSave} onClick={() => void save()}>
        {saving ? 'Saving…' : trip ? 'Save changes' : 'Save trip'}
      </button>
    </>
  );
}

/** Towns carry a one-way distance too, so they can drive the same maths. */
function toSpot(place: Place | undefined): Spot | null {
  if (!place || !place.oneWayKm) return null;
  return {
    zone: 'Town',
    name: place.name,
    oneWayKm: place.oneWayKm,
    roundTripKm: place.oneWayKm * 2,
    driveMinutes: 0,
    notes: place.notes,
  };
}

function numOrNull(v: string): number | null {
  if (v.trim() === '') return null;
  const n = Number(v);
  return Number.isNaN(n) ? null : n;
}
