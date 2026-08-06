import type {
  Bootstrap,
  CompleteTripPayload,
  LogKarmaPayload,
  Member,
  Op,
  Payment,
  PostResponse,
  Role,
  SettleUpPayload,
  RequestRidePayload,
  ClaimRidePayload,
  CancelRidePayload,
} from './types';

/**
 * Dev-only stand-in for the Sheet, so the app can be worked on before the
 * Apps Script backend exists. Numbers match the real spreadsheet.
 * Never used in a production build — the deploy workflow refuses to build
 * without API_URL.
 */
const fuelPrice = 2.03;
const consumption = 7.5;

let bootstrap: Bootstrap = {
  version: new Date().toISOString(),
  settings: {
    totalCost: 410,
    rentalCost: 390,
    extras: 20,
    monthStart: '2026-08-06T00:00:00.000Z',
    monthEnd: '2026-08-31T00:00:00.000Z',
    totalMemberDays: 78,
    dailyRate: 410 / 78,
    fuelPrice,
    consumption,
    costPerKm: (fuelPrice * consumption) / 100,
    riderDays: 1.5,
    dayRate: 410 / 79.5,
  },
  members: [
    member('Robin', true, 26, 3),
    member('Julia', true, 26, 5),
    member('Jonas', true, 26, 1),
    member('John', false, 26, 0, 'Non-driver', 1),
    member('Lucia', false, 26, 0, 'Non-driver', 0.5),
    member('George', false, 26, 1, 'Non-driver', 0),
    member('Bonnie', false, 26, 0, 'Non-driver', 0),
    member('Holly', false, 26, 0, 'Non-driver', 0),
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
  ],
  places: [
    { category: 'Town', name: 'Lagos', oneWayKm: 13, notes: '' },
    { category: 'Town', name: 'Burgau', oneWayKm: 3, notes: '' },
    { category: 'Town', name: 'Portimão', oneWayKm: 30, notes: '' },
    { category: 'Town', name: 'Faro', oneWayKm: 90, notes: 'Airport' },
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
      date: '2026-08-01',
      name: 'Robin',
      type: 'prepayment',
      amount: 410,
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
  const rate = 410 / 79.5;
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
            ? oneWayKm * (t.tripType === 'One-way' ? 1 : 2)
            : (t.manualKm ?? 0);

      const fuel = distanceKm * bootstrap.settings.costPerKm;
      const total = fuel + t.tolls + t.parking;
      const isTaxi = t.taxi && t.riders.length > 0;
      const people = isTaxi ? t.riders.length : 1 + t.riders.length;

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
            taxi: !!isTaxi,
          },
        ],
        rideRequests: bootstrap.rideRequests.map((r) =>
          r.id === t.rideRequestId ? { ...r, status: 'done' as const } : r,
        ),
      };
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

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));
