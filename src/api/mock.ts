import { EXPECTED_CODE_VERSION } from '../config';
import { loadFactor } from '../lib/cost';
import type {
  Bootstrap,
  CompleteTripPayload,
  CreateReservationPayload,
  EditReservationPayload,
  LogKarmaPayload,
  Member,
  Op,
  Payment,
  PostResponse,
  Reservation,
  Role,
  SettleUpPayload,
  RequestRidePayload,
  ClaimRidePayload,
  CancelRidePayload,
  LogRidePayload,
  DeleteTripPayload,
  EditTripPayload,
  JoinPayload,
} from './types';

/**
 * Dev-only stand-in for the Sheet, so the app can be worked on before the
 * Apps Script backend exists. Numbers match the real spreadsheet.
 * Never used in a production build — the deploy workflow refuses to build
 * without API_URL.
 */
const fuelPrice = 2.03;
const consumption = 6.0;

let bootstrap: Bootstrap = {
  version: new Date().toISOString(),
  codeVersion: EXPECTED_CODE_VERSION,
  settings: {
    totalCost: 405,
    rentalCost: 375,
    extras: 30,
    monthStart: '2026-08-07T00:00:00.000Z',
    monthEnd: '2026-08-31T00:00:00.000Z',
    totalMemberDays: 75,
    dailyRate: 405 / 75,
    fuelPrice,
    consumption,
    costPerKm: (fuelPrice * consumption) / 100,
    riderDays: 1.5,
    dayRate: 405 / 76.5,
  },
  members: [
    member('Robin', true, 25, 3),
    member('Julia', true, 25, 5),
    member('Jonas', true, 25, 1),
    member('John', false, 25, 0, 'Non-driver', 1),
    member('Lucia', false, 25, 0, 'Non-driver', 0.5),
    member('George', false, 25, 1, 'Non-driver', 0),
    member('Bonnie', false, 25, 0, 'Non-driver', 0),
    member('Holly', false, 25, 0, 'Non-driver', 0),
  ],
  spots: [
    spot('Near base (Burgau-Lagos)', 'Praia do Burgau', 3, 5),
    spot('Near base (Burgau-Lagos)', 'Salema', 8, 12),
    spot('Near base (Burgau-Lagos)', 'Luz', 9, 13),
    spot('Near base (Burgau-Lagos)', 'Meia Praia (Lagos)', 13, 18),
    spot('South coast, west of base', 'Zavial', 14, 18),
    spot('South coast, west of base', 'Ingrina', 16, 20),
    spot('Sagres & west tip', 'Castelejo', 19, 24),
    spot('Sagres & west tip', 'Cordoama', 20, 25),
    spot('Alvor / Portimão', 'Alvor', 19, 24),
    spot('West coast — Carrapateira/Aljezur', 'Praia do Bordeira', 36, 40),
  ],
  places: [
    { category: 'Town', name: 'Lagos', oneWayKm: 13, notes: '' },
    { category: 'Town', name: 'Burgau', oneWayKm: 3, notes: '' },
    { category: 'Town', name: 'Portimão', oneWayKm: 30, notes: '' },
    { category: 'Town', name: 'Faro', oneWayKm: 90, notes: 'Airport' },
    // The road west towards Sagres — mirrors LATER_PLACES in setup.gs.
    { category: 'Town', name: 'Figueira', oneWayKm: 5, notes: 'The village near Budens' },
    { category: 'Town', name: 'Budens', oneWayKm: 6, notes: 'Shop, café' },
    { category: 'Town', name: 'Boca do Rio', oneWayKm: 9, notes: 'Beach below Budens' },
    { category: 'Town', name: 'Raposeira', oneWayKm: 11, notes: '' },
    { category: 'Town', name: 'Praia do Barranco', oneWayKm: 18, notes: '' },
    { category: 'Town', name: 'Praia das Furnas', oneWayKm: 19, notes: '' },
    { category: 'Activity', name: 'Groceries', oneWayKm: 0, notes: '' },
    { category: 'Activity', name: 'Party / night out', oneWayKm: 0, notes: '' },
    { category: 'Activity', name: 'Pharmacy', oneWayKm: 0, notes: '' },
  ],
  karmaActions: [
    { action: 'Cleaned the car', points: 1 },
    { action: 'Refuelled', points: 2 },
    { action: 'Drove others around', points: 1 },
    { action: 'Sorted the boards / gear', points: 1 },
  ],
  karmaLog: [{ date: '2026-08-03', name: 'Julia', action: 'Cleaned the car', points: 1 }],
  payments: [
    {
      date: '2026-08-07',
      name: 'Robin',
      type: 'prepayment',
      amount: 405,
      note: 'Rental and pickup paid upfront',
    },
  ],
  rideRequests: [
    {
      id: 'ride-1',
      created: new Date().toISOString(),
      passenger: 'Lucia',
      others: [],
      when: new Date(Date.now() + 2 * 3600_000).toISOString(),
      from: 'Quinta',
      to: 'Lagos',
      notes: 'Need to catch the bus',
      status: 'open',
      driver: '',
      tripId: '',
    },
  ],
  reservations: [
    {
      id: 'res-1',
      created: new Date().toISOString(),
      driver: 'Julia',
      riders: ['Jonas'],
      start: new Date(Date.now() + 3 * 3600_000).toISOString(),
      end: new Date(Date.now() + 7 * 3600_000).toISOString(),
      destination: 'Cordoama',
      status: 'reserved',
      tripId: '',
      notes: '',
      updated: '',
    },
  ],
  recentTrips: [],
};

function member(
  name: string,
  included: boolean,
  daysActive: number,
  karma: number,
  role: Role = 'Driver',
  rideDays = 0,
): Member {
  const rate = 405 / 76.5;
  const carCharge = (included ? daysActive : rideDays) * rate;
  return {
    name,
    included,
    joinDate: '2026-08-01T00:00:00.000Z',
    leaveDate: '2026-08-31T00:00:00.000Z',
    daysActive,
    carCharge,
    paid: 0,
    balance: carCharge,
    karma,
    role,
    rideDays,
    tripCosts: 0,
  };
}

function spot(zone: string, name: string, oneWayKm: number, driveMinutes: number) {
  return { zone, name, oneWayKm, roundTripKm: oneWayKm * 2, driveMinutes, notes: '' };
}

export async function mockBootstrap(): Promise<Bootstrap> {
  await delay(120);
  return structuredClone(bootstrap);
}

export async function mockPost(ops: Op[]): Promise<PostResponse> {
  await delay(200);
  ops.forEach((op) => {
    // Was missing entirely, so a booking made in dev vanished on save and the
    // reserve screen couldn't be exercised end to end.
    if (op.op === 'createReservation') {
      const r = op.payload as CreateReservationPayload;
      bootstrap = {
        ...bootstrap,
        reservations: [
          ...bootstrap.reservations,
          { ...r, created: new Date().toISOString(), status: 'reserved', tripId: '', updated: '' },
        ],
      };
    }

    // Mirrors editReservation_: the five editable fields plus the stamp, and
    // nothing else — driver and status stay where they are.
    if (op.op === 'editReservation') {
      const e = op.payload as EditReservationPayload;
      bootstrap = {
        ...bootstrap,
        reservations: bootstrap.reservations.map((r) =>
          r.id === e.id
            ? {
                ...r,
                riders: e.riders,
                start: e.start,
                end: e.end,
                destination: e.destination,
                notes: e.notes,
                updated: new Date().toISOString(),
              }
            : r,
        ),
      };
    }

    if (op.op === 'cancelReservation') {
      const { id } = op.payload as { id: string };
      bootstrap = {
        ...bootstrap,
        reservations: bootstrap.reservations.filter((r) => r.id !== id),
      };
    }

    if (op.op === 'logPayment') {
      bootstrap = { ...bootstrap, payments: [...bootstrap.payments, op.payload as Payment] };
    }

    // Mirrors settleUp_: two rows, so both ledgers move together.
    if (op.op === 'settleUp') {
      const s = op.payload as SettleUpPayload;
      bootstrap = {
        ...bootstrap,
        payments: [
          ...bootstrap.payments,
          {
            date: s.date,
            name: s.from,
            type: 'settlement',
            amount: s.amount,
            note: `Settled with ${s.to}`,
          },
          {
            date: s.date,
            name: s.to,
            type: 'settlement',
            amount: -s.amount,
            note: `Received from ${s.from}`,
          },
        ],
      };
    }

    if (op.op === 'completeTrip') {
      const t = op.payload as CompleteTripPayload;
      const spot = bootstrap.spots.find((s) => s.name === t.destination);
      const place = bootstrap.places.find((p) => p.name === t.destination);
      const oneWayKm = spot?.oneWayKm ?? place?.oneWayKm ?? 0;
      const distanceKm =
        t.odoStart != null && t.odoEnd != null
          ? Math.max(t.odoEnd - t.odoStart, 0)
          : oneWayKm
            ? oneWayKm * (t.tripType === 'One-way' && !t.taxi ? 1 : 2)
            : (t.manualKm ?? 0);

      const isTaxi = t.taxi && t.riders.length > 0;
      const people = isTaxi ? t.riders.length : 1 + t.riders.length;
      const load = loadFactor(1 + t.riders.length, t.boards);
      const fuel = distanceKm * bootstrap.settings.costPerKm * load;
      const total = fuel + t.tolls + t.parking;

      bootstrap = {
        ...bootstrap,
        recentTrips: [
          ...bootstrap.recentTrips,
          {
            id: op.clientId,
            date: t.date,
            driver: t.driver,
            destination: t.destination,
            distanceKm,
            fuelCost: fuel,
            tolls: t.tolls,
            parking: t.parking,
            total,
            people,
            perPerson: total / people,
            riders: t.riders,
            tripType: t.tripType,
            activity: t.activity,
            notes: t.notes,
            taxi: !!isTaxi,
            origin: t.origin,
            boards: t.boards,
            rideRequestId: t.rideRequestId,
            until: t.until,
          },
        ],
        rideRequests: bootstrap.rideRequests.map((r) =>
          r.id === t.rideRequestId ? { ...r, status: 'done' as const } : r,
        ),
        // Mirrors completeTrip_ and tripMatchesReservation_: a linked booking
        // closes only when the trip actually falls in its window, a day's grace
        // either side. The mock ignored reservations entirely, so nothing that
        // depends on a booking closing could be checked here.
        reservations: bootstrap.reservations.filter(
          (r) => !(r.id === t.reservationId && tripClosesBooking(t.date, r)),
        ),
      };
    }

    // Mirrors logRide_: logs a claimed lift outright, doubled distance and all.
    if (op.op === 'logRide') {
      const { id, date } = op.payload as LogRidePayload;
      const ride = bootstrap.rideRequests.find((r) => r.id === id);
      if (ride && ride.status === 'claimed') {
        const place = bootstrap.places.find((pl) => pl.name === ride.to);
        const spotHit = bootstrap.spots.find((sp) => sp.name === ride.to);
        const oneWayKm = spotHit?.oneWayKm ?? place?.oneWayKm ?? 0;
        if (oneWayKm > 0) {
          const passengers = [ride.passenger, ...ride.others].filter((n) => n !== ride.driver);
          const distanceKm = oneWayKm * 2;
          const load = loadFactor(1 + passengers.length, false);
          const fuel = distanceKm * bootstrap.settings.costPerKm * load;
          bootstrap = {
            ...bootstrap,
            recentTrips: [
              ...bootstrap.recentTrips,
              {
                id: op.clientId,
                date,
                driver: ride.driver,
                destination: ride.to,
                distanceKm,
                fuelCost: fuel,
                tolls: 0,
                parking: 0,
                total: fuel,
                people: passengers.length,
                perPerson: fuel / passengers.length,
                riders: passengers,
                tripType: 'One-way',
                activity: '',
                notes: ride.notes,
                taxi: true,
                origin: ride.from,
                boards: false,
                rideRequestId: ride.id,
                until: date,
              },
            ],
            rideRequests: bootstrap.rideRequests.map((r) =>
              r.id === id ? { ...r, status: 'done' as const } : r,
            ),
          };
        }
      }
    }

    if (op.op === 'editTrip') {
      const e = op.payload as EditTripPayload;
      bootstrap = {
        ...bootstrap,
        recentTrips: bootstrap.recentTrips.map((t) => {
          if (t.id !== e.tripId) return t;
          const spotHit = bootstrap.spots.find((sp) => sp.name === e.destination);
          const place = bootstrap.places.find((pl) => pl.name === e.destination);
          const oneWayKm = spotHit?.oneWayKm ?? place?.oneWayKm ?? 0;
          const distanceKm = oneWayKm
            ? oneWayKm * (e.tripType === 'One-way' && !e.taxi ? 1 : 2)
            : (e.manualKm ?? t.distanceKm);
          const isTaxi = e.taxi && e.riders.length > 0;
          const people = isTaxi ? e.riders.length : 1 + e.riders.length;
          const fuel =
            distanceKm * bootstrap.settings.costPerKm * loadFactor(1 + e.riders.length, e.boards);
          const total = fuel + e.tolls + e.parking;
          return {
            ...t,
            date: e.date,
            destination: e.destination,
            activity: e.activity,
            // editTrip_ overwrites the cell with whatever the client sends, so
            // mirror that rather than letting `...t` quietly preserve the old
            // value — that difference hid the form wiping notes on every edit.
            notes: e.notes,
            distanceKm,
            fuelCost: fuel,
            tolls: e.tolls,
            parking: e.parking,
            total,
            people,
            perPerson: total / people,
            riders: e.riders,
            tripType: e.tripType,
            taxi: !!isTaxi,
            origin: e.origin,
            boards: e.boards,
            until: e.until,
          };
        }),
      };
    }

    if (op.op === 'deleteTrip') {
      const { tripId } = op.payload as DeleteTripPayload;
      bootstrap = {
        ...bootstrap,
        recentTrips: bootstrap.recentTrips.filter((t) => t.id !== tripId),
      };
    }

    if (op.op === 'joinReservation' || op.op === 'joinRide') {
      const { id, name, join } = op.payload as JoinPayload;
      const toggle = (list: string[]) => {
        const without = list.filter((n) => n !== name);
        return join ? [...without, name] : without;
      };
      bootstrap = {
        ...bootstrap,
        reservations: bootstrap.reservations.map((r) =>
          r.id === id ? { ...r, riders: toggle(r.riders) } : r,
        ),
        rideRequests: bootstrap.rideRequests.map((r) =>
          r.id === id ? { ...r, others: toggle(r.others) } : r,
        ),
      };
    }

    if (op.op === 'claimRide') {
      const { id, driver } = op.payload as ClaimRidePayload;
      const action = bootstrap.karmaActions.find((a) => /dr(o|i)ve|lift|taxi/i.test(a.action));
      if (action && bootstrap.rideRequests.some((r) => r.id === id && r.status === 'open')) {
        bootstrap = {
          ...bootstrap,
          karmaLog: [
            ...bootstrap.karmaLog,
            { date: new Date().toISOString(), name: driver, action: action.action, points: action.points },
          ],
        };
      }
    }

    if (op.op === 'requestRide') {
      const r = op.payload as RequestRidePayload;
      bootstrap = {
        ...bootstrap,
        rideRequests: [
          ...bootstrap.rideRequests,
          { ...r, created: new Date().toISOString(), status: 'open', driver: '', tripId: '' },
        ],
      };
    }

    if (op.op === 'claimRide') {
      const { id, driver } = op.payload as ClaimRidePayload;
      bootstrap = {
        ...bootstrap,
        rideRequests: bootstrap.rideRequests.map((r) =>
          r.id === id && r.status === 'open' ? { ...r, status: 'claimed', driver } : r,
        ),
      };
    }

    if (op.op === 'cancelRide') {
      const { id } = op.payload as CancelRidePayload;
      bootstrap = {
        ...bootstrap,
        rideRequests: bootstrap.rideRequests.filter((r) => r.id !== id),
      };
    }

    // The real backend credits pump spending from logKarma; mirror it so the
    // dev ledger tells the truth.
    if (op.op === 'logKarma') {
      const k = op.payload as LogKarmaPayload;
      if (k.amount && k.amount > 0) {
        bootstrap = {
          ...bootstrap,
          payments: [
            ...bootstrap.payments,
            { date: k.date, name: k.name, type: 'fuel', amount: k.amount, note: k.action },
          ],
        };
      }
    }
  });
  return {
    ok: true,
    results: ops.map((op) => ({
      clientId: op.clientId,
      ok: true,
      data:
        op.op === 'resetTestData'
          ? { cleared: { trips: 0, karma: 0, reservations: 0 }, backup: 'mock backup' }
          : undefined,
    })),
    data: structuredClone(bootstrap),
  };
}

/** Mirrors tripMatchesReservation_ in Code.gs, grace window included. */
function tripClosesBooking(tripDate: string, r: Reservation): boolean {
  const GRACE = 24 * 3600_000;
  const when = new Date(tripDate).getTime();
  if (Number.isNaN(when)) return false;
  return when >= new Date(r.start).getTime() - GRACE && when <= new Date(r.end).getTime() + GRACE;
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
