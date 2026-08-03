import type {
  Bootstrap,
  LogKarmaPayload,
  Member,
  Op,
  Payment,
  PostResponse,
  Role,
  SettleUpPayload,
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
    totalCost: 465,
    monthStart: '2026-08-01T00:00:00.000Z',
    monthEnd: '2026-08-31T00:00:00.000Z',
    totalMemberDays: 124,
    dailyRate: 465 / 124,
    fuelPrice,
    consumption,
    costPerKm: (fuelPrice * consumption) / 100,
    riderDays: 2,
    dayRate: 465 / 126,
  },
  members: [
    member('Robin', true, 31, 3),
    member('Julia', true, 31, 5),
    member('Jonas', true, 31, 1),
    member('John', true, 31, 0),
    member('Lucia', false, 31, 0, 'Non-driver', 3),
    member('George', false, 31, 1, 'Non-driver', 2),
    member('Bonnie', false, 31, 0, 'Non-driver', 0),
    member('Roberta', false, 31, 2, 'Non-driver', 0),
    member('Holly', false, 31, 0, 'Non-driver', 1),
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
      amount: 465,
      note: 'Full rental paid upfront',
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
  const rate = 465 / 126;
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
