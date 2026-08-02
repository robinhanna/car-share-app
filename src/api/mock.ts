import type { Bootstrap, Op, PostResponse } from './types';

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
  },
  members: [
    member('Robin', true, 31, 116.25, 116.25, 3),
    member('Julia', true, 31, 116.25, 50, 5),
    member('Jonas', true, 31, 116.25, 0, 1),
    member('John', true, 31, 116.25, 116.25, 0),
    member('Roberta', false, 31, 0, 0, 2),
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
  karmaActions: [
    { action: 'Cleaned the car', points: 1 },
    { action: 'Refuelled', points: 2 },
    { action: 'Drove others around', points: 1 },
    { action: 'Sorted the boards / gear', points: 1 },
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
  share: number,
  paid: number,
  karma: number,
) {
  return {
    name,
    included,
    joinDate: '2026-08-01T00:00:00.000Z',
    leaveDate: '2026-08-31T00:00:00.000Z',
    daysActive,
    share,
    paid,
    balance: share - paid,
    karma,
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
