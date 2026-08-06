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
  personRideDays,
  totalMemberDays,
  totalRiderDays,
  tripCost,
  tripDistanceKm,
} from './cost';

// 6–31 August: €390 rental + €20 pickup, three members.
const settings: Settings = {
  totalCost: 410,
  rentalCost: 390,
  extras: 20,
  monthStart: '2026-08-06',
  monthEnd: '2026-08-31',
  totalMemberDays: 78,
  dailyRate: 410 / 78,
  fuelPrice: 2.03,
  consumption: 7.5,
  costPerKm: costPerKm(2.03, 7.5),
  riderDays: 0,
  dayRate: 410 / 78,
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
  joinDate: '2026-08-06',
  leaveDate: '2026-08-31',
  daysActive: 26,
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
  taxi: false,
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
  const members = ['Robin', 'Julia', 'Jonas'].map((name) => member({ name }));

  it('splits €410 three ways over 26 days when nobody else rides', () => {
    expect(totalMemberDays(members)).toBe(78);
    const rate = dayRate(members, settings);
    expect(rate).toBeCloseTo(5.2564, 4); // 410 / 78
    members.forEach((m) => expect(personCarCharge(m, rate)).toBeCloseTo(136.67, 2));
  });

  it('includes the pickup cost in the pot', () => {
    expect(settings.rentalCost + settings.extras).toBe(settings.totalCost);
  });

  it('widens the denominator when a rider clocks up half days', () => {
    const people = [
      ...members,
      member({ name: 'Lucia', included: false, role: 'Non-driver', rideDays: 1.5 }),
    ];
    expect(totalRiderDays(people)).toBe(1.5);

    const rate = dayRate(people, settings);
    expect(rate).toBeCloseTo(5.1572, 4); // 410 / 79.5

    expect(personCarCharge(people[3], rate)).toBeCloseTo(7.74, 2);
    members.forEach((m) => expect(personCarCharge(m, rate)).toBeCloseTo(134.09, 2));
  });

  it('still collects exactly €410 in total', () => {
    const people = [
      ...members,
      member({ name: 'Lucia', included: false, role: 'Non-driver', rideDays: 1.5 }),
      member({ name: 'John', included: false, role: 'Non-driver', rideDays: 3 }),
    ];
    const rate = dayRate(people, settings);
    const collected = people.reduce((sum, m) => sum + personCarCharge(m, rate), 0);
    expect(collected).toBeCloseTo(410, 6);
  });

  it('charges every member the identical rate per day — the reason this model was chosen', () => {
    const people = [
      ...members,
      member({ name: 'Leaves early', daysActive: 10 }),
      member({ name: 'Lucia', included: false, role: 'Non-driver', rideDays: 2.5 }),
    ];
    const rate = dayRate(people, settings);
    const perDay = people
      .filter((m) => m.included)
      .map((m) => personCarCharge(m, rate) / m.daysActive);
    perDay.forEach((r) => expect(r).toBeCloseTo(perDay[0], 10));
  });

  it('charges nothing to a rider who never rode', () => {
    const people = [...members, member({ name: 'Bonnie', included: false, rideDays: 0 })];
    expect(personCarCharge(people[3], dayRate(people, settings))).toBe(0);
  });
});

describe('half days', () => {
  const taxi = (over: Partial<Trip> = {}) =>
    trip({ driver: 'Julia', riders: ['Lucia'], taxi: true, tripType: 'One-way', ...over });

  it('charges half a day for a single one-way taxi drop-off', () => {
    expect(personRideDays('Lucia', [taxi()])).toBe(0.5);
  });

  it('charges a full day when the taxi waits and brings them back', () => {
    expect(personRideDays('Lucia', [taxi({ tripType: 'Round trip' })])).toBe(1);
  });

  it('charges a full day once they take a second ride that day', () => {
    expect(personRideDays('Lucia', [taxi({ id: 'a' }), taxi({ id: 'b' })])).toBe(1);
  });

  it('charges a full day for an ordinary shared trip, one-way or not', () => {
    const shared = trip({ driver: 'Julia', riders: ['Lucia'], taxi: false, tripType: 'One-way' });
    expect(personRideDays('Lucia', [shared])).toBe(1);
  });

  it('adds half days across separate dates', () => {
    const days = [taxi({ id: 'a', date: '2026-08-10' }), taxi({ id: 'b', date: '2026-08-12' })];
    expect(personRideDays('Lucia', days)).toBe(1);
  });

  it('gives the taxi driver no day at all', () => {
    expect(personRideDays('Julia', [taxi()])).toBe(0);
  });
});

describe('taxi trips', () => {
  it('divides the cost between the passengers and spares the driver', () => {
    const cost = tripCost({ distanceKm: 28, riderCount: 2, taxi: true }, settings);
    expect(cost.people).toBe(2);
    expect(cost.perPerson).toBeCloseTo(2.13, 2);
  });

  it('charges the driver nothing on their own taxi run', () => {
    const run = trip({
      driver: 'Julia',
      riders: ['Lucia', 'Bonnie'],
      taxi: true,
      people: 2,
      total: 4.26,
      perPerson: 2.13,
    });
    expect(personTripCosts('Julia', [run])).toBe(0);
    expect(personTripCosts('Lucia', [run])).toBeCloseTo(2.13, 2);
  });

  it('falls back to a normal split when a taxi run has no passengers', () => {
    const cost = tripCost({ distanceKm: 28, riderCount: 0, taxi: true }, settings);
    expect(cost.people).toBe(1);
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

  it('moves both sides by the same amount when someone settles up', () => {
    const people = [member({ name: 'Robin' }), member({ name: 'Julia' })];
    const rate = dayRate(people, settings);
    const before = people.map((m) => personLedger(m, [], [], rate));

    // What the backend writes: the payer's row positive, the receiver's negative.
    const settlement: Payment[] = [
      { date: '2026-08-10', name: 'Julia', type: 'settlement', amount: 50, note: '' },
      { date: '2026-08-10', name: 'Robin', type: 'settlement', amount: -50, note: '' },
    ];
    const after = people.map((m) => personLedger(m, [], settlement, rate));

    expect(after[1].balance).toBeCloseTo(before[1].balance - 50, 6);
    expect(after[0].balance).toBeCloseTo(before[0].balance + 50, 6);

    // A transfer moves money between ledgers; it does not create or destroy any.
    const sum = (ls: typeof before) => ls.reduce((s, l) => s + l.balance, 0);
    expect(sum(after)).toBeCloseTo(sum(before), 6);
  });

  it('leaves Robin owed the rest of the group after his prepayment', () => {
    const people = [
      member({ name: 'Robin' }),
      member({ name: 'Julia' }),
      member({ name: 'Jonas' }),
    ];
    const payments: Payment[] = [
      { date: '2026-08-06', name: 'Robin', type: 'prepayment', amount: 410, note: '' },
    ];
    const rate = dayRate(people, settings);
    const ledgers = people.map((m) => personLedger(m, [], payments, rate));

    // He fronted €410 and owes €136.67 of it himself.
    expect(ledgers[0].balance).toBeCloseTo(-273.33, 2);
    const owedByOthers = ledgers.slice(1).reduce((sum, l) => sum + l.balance, 0);
    expect(owedByOthers).toBeCloseTo(-ledgers[0].balance, 6);
  });
});
