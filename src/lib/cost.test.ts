import { describe, expect, it } from 'vitest';
import type { Member, Payment, Settings, Spot, Trip } from '../api/types';
import {
  costPerKm,
  dayRate,
  fuelCost,
  personCarCharge,
  personLedger,
  personTripCosts,
  personTrips,
  totalMemberDays,
  totalRiderDays,
  tripCost,
  tripDistanceKm,
} from './cost';

// Values taken from output/car_rental_cost_split.xlsx — Settings B3, B9, B10, B11.
const settings: Settings = {
  totalCost: 465,
  monthStart: '2026-08-01',
  monthEnd: '2026-08-31',
  totalMemberDays: 124,
  dailyRate: 465 / 124,
  fuelPrice: 2.03,
  consumption: 7.5,
  costPerKm: costPerKm(2.03, 7.5),
  riderDays: 0,
  dayRate: 465 / 124,
};

const zavial: Spot = {
  zone: 'South coast, west of base',
  name: 'Zavial',
  oneWayKm: 14,
  roundTripKm: 28,
  driveMinutes: 18,
  notes: '',
};

const member = (over: Partial<Member> = {}): Member => ({
  name: 'Robin',
  included: true,
  joinDate: '2026-08-01',
  leaveDate: '2026-08-31',
  daysActive: 31,
  carCharge: 0,
  paid: 0,
  balance: 0,
  karma: 0,
  role: 'Driver',
  rideDays: 0,
  tripCosts: 0,
  ...over,
});

const trip = (over: Partial<Trip> = {}): Trip => ({
  id: 't1',
  date: '2026-08-05',
  driver: 'Robin',
  destination: 'Zavial',
  distanceKm: 28,
  fuelCost: 4.26,
  tolls: 0,
  parking: 0,
  total: 4.26,
  people: 1,
  perPerson: 4.26,
  riders: [],
  tripType: 'Round trip',
  activity: '',
  ...over,
});

describe('fuel maths', () => {
  it('matches Settings!B11', () => {
    expect(costPerKm(2.03, 7.5)).toBeCloseTo(0.15225, 5);
  });

  it('prices a Zavial round trip the way the sheet does', () => {
    const distance = tripDistanceKm({ spot: zavial, tripType: 'Round trip' });
    expect(distance).toBe(28);
    expect(fuelCost(distance, settings)).toBeCloseTo(4.26, 2);
  });

  it('halves the distance for a one-way', () => {
    expect(tripDistanceKm({ spot: zavial, tripType: 'One-way' })).toBe(14);
  });
});

describe('distance priority', () => {
  it('prefers the odometer over everything else', () => {
    expect(tripDistanceKm({ odoStart: 100_000, odoEnd: 100_037, spot: zavial })).toBe(37);
  });

  it('falls back to manual km when there is no spot', () => {
    expect(tripDistanceKm({ manualKm: 42 })).toBe(42);
  });

  it('never returns a negative distance from a mistyped odometer', () => {
    expect(tripDistanceKm({ odoStart: 100_100, odoEnd: 100_000 })).toBe(0);
  });

  it('is zero when nothing is entered', () => {
    expect(tripDistanceKm({})).toBe(0);
  });
});

describe('trip split', () => {
  it('divides the trip total between driver and riders', () => {
    const cost = tripCost({ distanceKm: 28, tolls: 0, parking: 3, riderCount: 2 }, settings);
    expect(cost.people).toBe(3);
    expect(cost.total).toBeCloseTo(7.26, 2);
    expect(cost.perPerson).toBeCloseTo(2.42, 2);
  });

  it('charges the whole trip to a driver travelling alone', () => {
    const cost = tripCost({ distanceKm: 28, riderCount: 0 }, settings);
    expect(cost.people).toBe(1);
    expect(cost.perPerson).toBeCloseTo(cost.total, 5);
  });
});

describe('day rate', () => {
  const drivers = ['Robin', 'Julia', 'Jonas', 'John'].map((name) => member({ name }));

  it('splits €465 four ways when nobody else rides', () => {
    expect(totalMemberDays(drivers)).toBe(124);
    expect(dayRate(drivers, settings)).toBeCloseTo(3.75, 4);
    drivers.forEach((m) => expect(personCarCharge(m, 3.75)).toBeCloseTo(116.25, 2));
  });

  it('widens the denominator when a non-driver rides', () => {
    const people = [...drivers, member({ name: 'Ana', included: false, role: 'Non-driver', rideDays: 5 })];
    expect(totalRiderDays(people)).toBe(5);

    const rate = dayRate(people, settings);
    expect(rate).toBeCloseTo(3.6047, 4); // 465 / 129

    const ana = people[4];
    expect(personCarCharge(ana, rate)).toBeCloseTo(18.02, 2);
    drivers.forEach((m) => expect(personCarCharge(m, rate)).toBeCloseTo(111.74, 2));
  });

  it('still collects exactly €465 in total', () => {
    const people = [...drivers, member({ name: 'Ana', included: false, role: 'Guest', rideDays: 5 })];
    const rate = dayRate(people, settings);
    const collected = people.reduce((sum, m) => sum + personCarCharge(m, rate), 0);
    expect(collected).toBeCloseTo(465, 6);
  });

  it('charges every driver the identical rate per day — the reason this model was chosen', () => {
    const people = [
      ...drivers,
      member({ name: 'Leaves early', daysActive: 10 }),
      member({ name: 'Ana', included: false, role: 'Guest', rideDays: 5 }),
    ];
    const rate = dayRate(people, settings);
    const perDay = people
      .filter((m) => m.included)
      .map((m) => personCarCharge(m, rate) / m.daysActive);
    perDay.forEach((r) => expect(r).toBeCloseTo(perDay[0], 10));
  });

  it('charges nothing to a non-driver who never rode', () => {
    const people = [...drivers, member({ name: 'Roberta', included: false, rideDays: 0 })];
    expect(personCarCharge(people[4], dayRate(people, settings))).toBe(0);
  });
});

describe('person ledger', () => {
  const trips: Trip[] = [
    trip({ id: 'a', driver: 'Robin', riders: ['Ana'], people: 2, total: 4.26, perPerson: 2.13 }),
    trip({ id: 'b', driver: 'Julia', riders: ['Ana'], people: 2, total: 10, perPerson: 5 }),
    trip({ id: 'c', driver: 'Julia', riders: [], people: 1, total: 6, perPerson: 6 }),
  ];

  it('finds every trip a person was in, as driver or rider', () => {
    expect(personTrips('Ana', trips).map((t) => t.id)).toEqual(['a', 'b']);
    expect(personTrips('Julia', trips).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('sums their share across those trips', () => {
    expect(personTripCosts('Ana', trips)).toBeCloseTo(7.13, 2);
    expect(personTripCosts('Julia', trips)).toBeCloseTo(11, 2);
  });

  it('nets charges against payments', () => {
    const payments: Payment[] = [
      { date: '2026-08-03', name: 'Ana', type: 'fuel', amount: 40, note: 'Filled the tank' },
      { date: '2026-08-04', name: 'Ana', type: 'cash', amount: 5, note: '' },
    ];
    const ana = member({ name: 'Ana', included: false, role: 'Guest', rideDays: 2 });
    const ledger = personLedger(ana, trips, payments, 3.6047);

    expect(ledger.chargedDays).toBe(2);
    expect(ledger.carCharge).toBeCloseTo(7.21, 2);
    expect(ledger.tripCosts).toBeCloseTo(7.13, 2);
    expect(ledger.paid).toBe(45);
    expect(ledger.balance).toBeCloseTo(7.21 + 7.13 - 45, 2);
    expect(ledger.balance).toBeLessThan(0); // she is owed money
  });

  it('leaves Robin owed the rest of the group after his prepayment', () => {
    const people = [
      member({ name: 'Robin' }),
      member({ name: 'Julia' }),
      member({ name: 'Jonas' }),
      member({ name: 'John' }),
    ];
    const payments: Payment[] = [
      { date: '2026-08-01', name: 'Robin', type: 'prepayment', amount: 465, note: '' },
    ];
    const rate = dayRate(people, settings);
    const ledgers = people.map((m) => personLedger(m, [], payments, rate));

    expect(ledgers[0].balance).toBeCloseTo(-348.75, 2);
    const owedByOthers = ledgers.slice(1).reduce((sum, l) => sum + l.balance, 0);
    expect(owedByOthers).toBeCloseTo(-ledgers[0].balance, 6);
  });
});
