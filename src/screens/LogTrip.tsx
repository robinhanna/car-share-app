import { useMemo, useState } from 'preact/hooks';
import type { Place, Reservation, RideRequest, Spot, Trip, TripType } from '../api/types';
import { euro, km, splitRiders, tripCost, tripDistanceKm, type TripCost } from '../lib/cost';
import { localDateTimeInput } from '../lib/dates';
import { splitDestination } from '../lib/destination';
import { queueOp, useApp } from '../state/store';
import { DestinationPicker, type DestinationValue } from './DestinationPicker';
import { RiderPicker } from './RiderPicker';

interface Props {
  me: string;
  reservationId?: string;
  reservation?: Reservation;
  /** Set when this trip is fulfilling someone's ride request. */
  ride?: RideRequest;
  /** Set when correcting a trip that's already logged. */
  trip?: Trip;
  onDone: (cost: TripCost, destination: string) => void;
}

type Mode = 'spot' | 'odometer' | 'manual';

export function LogTrip({ me, reservationId, reservation, ride, trip, onDone }: Props) {
  const { bootstrap } = useApp();
  const spots = bootstrap?.spots ?? [];
  const places = bootstrap?.places ?? [];
  const settings = bootstrap?.settings;

  const [mode, setMode] = useState<Mode>(trip && !trip.destination ? 'manual' : 'spot');
  const [from, setFrom] = useState(defaultFrom(trip, ride, reservation));
  const [until, setUntil] = useState(defaultUntil(trip, ride, reservation));
  const [origin, setOrigin] = useState(trip?.origin || 'Quinta');
  const [boards, setBoards] = useState(!!trip?.boards);
  // Names an odometer or manual trip so it isn't a blank row in the log.
  const [label, setLabel] = useState(trip && !trip.destination ? '' : '');
  // A booking already recorded where it was going, and a lift knows where it
  // dropped someone. Making the driver re-pick it defeats the point of logging
  // from the booking at all — the form should be a check, not a re-entry.
  const [destinationValue, setDestinationValue] = useState<DestinationValue>(
    trip
      ? { place: trip.destination, activity: trip.activity }
      : reservation
        ? splitDestination(reservation.destination)
        : { place: ride?.to ?? '', activity: '' },
  );
  const [tripType, setTripType] = useState<TripType>(trip?.tripType ?? 'Round trip');
  const [manualKm, setManualKm] = useState(
    trip && !trip.destination ? String(trip.distanceKm) : '',
  );
  const [odoStart, setOdoStart] = useState('');
  const [odoEnd, setOdoEnd] = useState('');
  const [riders, setRiders] = useState<string[]>(
    trip
      ? trip.riders
      : ride
        ? [ride.passenger, ...ride.others]
        : // Anyone who tapped "add me" on the booking is already in the car.
          (reservation?.riders ?? []),
  );
  // Kept in state so it can be unlinked: saving should never quietly close a
  // booking you didn't mean to close.
  const [linkedReservation, setLinkedReservation] = useState(reservationId ?? '');
  const [taxi, setTaxi] = useState(trip ? trip.taxi : !!ride);
  const [tolls, setTolls] = useState(trip?.tolls ? String(trip.tolls) : '');
  const [parking, setParking] = useState(trip?.parking ? String(trip.parking) : '');
  // Editing used to start this empty, so saving a correction wiped whatever note
  // was on the trip. A booking's or a lift's note carries in too — it was
  // written about this same journey.
  const [notes, setNotes] = useState(trip?.notes ?? reservation?.notes ?? ride?.notes ?? '');
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

  // Guests are in the car but not in the sum, so the running total has to know
  // the difference — otherwise the form quotes a split the sheet won't produce.
  const { paying, guests } = splitRiders(riders, bootstrap?.members ?? []);

  const cost = settings
    ? tripCost(
        {
          distanceKm,
          tolls: numOrNull(tolls) ?? 0,
          parking: numOrNull(parking) ?? 0,
          riderCount: riders.length,
          payingRiderCount: paying.length,
          taxi,
          boards,
        },
        settings,
      )
    : null;

  const destination = mode === 'spot' ? destinationValue.place : label.trim();
  const canSave = distanceKm > 0 && !saving;

  const save = async () => {
    if (!cost) return;
    setSaving(true);

    const common = {
      date: new Date(from).toISOString(),
      until: until ? new Date(until).toISOString() : '',
      driver: me,
      destination,
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
        reservationId: linkedReservation,
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

      {linkedReservation && reservation && (
        <div class="banner banner--pending">
          <span>
            Saving this closes {reservation.driver === me ? 'your' : `${reservation.driver}'s`}{' '}
            {reservation.destination || 'booking'}
          </span>
          <button
            class="icon-btn"
            aria-label="Don't close the booking"
            style="margin-left:auto"
            onClick={() => setLinkedReservation('')}
          >
            ✕
          </button>
        </div>
      )}

      <label class="field">
        <span>From</span>
        <input
          type="datetime-local"
          value={from}
          onInput={(e) => setFrom((e.target as HTMLInputElement).value)}
        />
      </label>

      <label class="field">
        <span>Until</span>
        <input
          type="datetime-local"
          value={until}
          onInput={(e) => setUntil((e.target as HTMLInputElement).value)}
        />
      </label>

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

      {mode !== 'spot' && (
        <label class="field">
          <span>Where did you go?</span>
          <input
            type="text"
            value={label}
            placeholder="optional"
            onInput={(e) => setLabel((e.target as HTMLInputElement).value)}
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
          {/* Pointless with only guests aboard: there'd be nobody to hand the
              bill to, so it would quietly behave like a normal trip anyway. */}
          <button
            aria-pressed={taxi}
            disabled={paying.length === 0}
            onClick={() => setTaxi(true)}
          >
            I drove them
          </button>
        </div>
        <p class="muted" style="margin:8px 0 0">
          {taxi
            ? `A lift: the ${paying.length === 1 ? 'passenger covers' : 'passengers cover'} the cost, you pay nothing.`
            : guests.length > 0
              ? `A shared trip: the cost splits between the ${paying.length + 1} of you paying. ${guests.join(' and ')} ${guests.length === 1 ? 'rides' : 'ride'} free.`
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

/**
 * A trip being logged has just happened, so it ends now and started a couple of
 * hours ago — the opposite of Reserve, which looks forward. Copying Reserve's
 * "next half hour" default would stamp every logged trip with a future time.
 * Logging from a booking uses that booking's times instead.
 */
function defaultFrom(trip?: Trip, ride?: RideRequest, reservation?: Reservation): string {
  if (trip) return localDateTimeInput(new Date(trip.date));
  if (reservation) return localDateTimeInput(new Date(reservation.start));
  if (ride) return localDateTimeInput(new Date(ride.when));
  const d = new Date();
  d.setHours(d.getHours() - 2);
  return localDateTimeInput(d);
}

function defaultUntil(trip?: Trip, _ride?: RideRequest, reservation?: Reservation): string {
  if (trip?.until) return localDateTimeInput(new Date(trip.until));
  if (trip) return localDateTimeInput(new Date(trip.date));
  if (reservation) return localDateTimeInput(new Date(reservation.end));
  return localDateTimeInput(new Date());
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
