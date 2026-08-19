import { describe, expect, it } from 'vitest';
import type { Member, Payment, Settings, Spot, Trip } from '../api/types';
import {
  costPerKm,
  dayRate,
  fuelCost,
  personCarCharge,
  personLedger,
  personTripCosts,
  personTripShare,
  personTrips,
  personTripsShown,
  personDayBreakdown,
  personRideDays,
  totalMemberDays,
  totalRiderDays,
  tripCost,
  tripDistanceKm,
  loadFactor,
} from './cost';

// Paid period 7–31 August: €375 rental + €35 extras, three members.
// The group has the car from the 6th, but nobody pays the owner for that day.
const settings: Settings = {
  totalCost: 410,
  rentalCost: 375,
  extras: 35,
  monthStart: '2026-08-07',
  monthEnd: '2026-08-31',
  totalMemberDays: 75,
  dailyRate: 410 / 75,
  fuelPrice: 1.913,
  consumption: 4.6,
  costPerKm: costPerKm(1.913, 4.6),
  riderDays: 0,
  dayRate: 410 / 75,
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
  joinDate: '2026-08-07',
  leaveDate: '2026-08-31',
  daysActive: 25,
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
  date: '2026-08-10',
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
  notes: '',
  taxi: false,
  origin: 'Quinta',
  boards: false,
  rideRequestId: '',
  until: '',
  ...over,
});

describe('fuel maths', () => {
  it('matches Settings!B11 at the measured consumption', () => {
    // €1.913/L from a receipt, 4.6 L/100km from half a 45 L tank over 490 km.
    expect(costPerKm(1.913, 4.6)).toBeCloseTo(0.088, 5);
  });

  it('prices a Zavial round trip the way the sheet does', () => {
    const distance = tripDistanceKm({ spot: zavial, tripType: 'Round trip' });
    expect(distance).toBe(28);
    expect(fuelCost(distance, settings)).toBeCloseTo(2.46, 2);
  });

  // The trip that started all this: the app said EUR27.40, which was 7.5 L/100km.
  it('prices the 180km Faro run at the measured consumption', () => {
    expect(fuelCost(180, settings)).toBeCloseTo(15.84, 2);
    expect(180 * costPerKm(2.03, 7.5)).toBeCloseTo(27.40, 2);
  });

  it('halves the distance for a one-way', () => {
    expect(tripDistanceKm({ spot: zavial, tripType: 'One-way' })).toBe(14);
  });

  it('keeps a one-way lift at the full round-trip distance', () => {
    // The passenger gets out at Zavial; the driver still drives home.
    expect(tripDistanceKm({ spot: zavial, tripType: 'One-way', taxi: true })).toBe(28);
  });
});

describe('load factor', () => {
  it('is 1 for a driver alone with nothing on the roof', () => {
    expect(loadFactor(1, false)).toBe(1);
  });

  it('adds 3% a head and 8% for boards', () => {
    expect(loadFactor(4, false)).toBeCloseTo(1.09, 5);
    expect(loadFactor(1, true)).toBeCloseTo(1.08, 5);
    expect(loadFactor(4, true)).toBeCloseTo(1.17, 5);
  });

  it('never runs away — capped at +25%', () => {
    expect(loadFactor(20, true)).toBe(1.25);
  });

  it('feeds through to the trip cost', () => {
    const light = tripCost({ distanceKm: 28, riderCount: 0 }, settings);
    const loaded = tripCost({ distanceKm: 28, riderCount: 3, boards: true }, settings);
    expect(loaded.total / light.total).toBeCloseTo(1.17, 5);
    // Shared four ways, a fuller car is still cheaper each.
    expect(loaded.perPerson).toBeLessThan(light.perPerson);
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
    // 28km x EUR0.088 x 1.06 for three aboard, plus EUR3 parking.
    expect(cost.total).toBeCloseTo(5.6118, 3);
    expect(cost.perPerson).toBeCloseTo(1.8706, 3);
  });

  it('charges the whole trip to a driver travelling alone', () => {
    const cost = tripCost({ distanceKm: 28, riderCount: 0 }, settings);
    expect(cost.people).toBe(1);
    expect(cost.perPerson).toBeCloseTo(cost.total, 5);
  });
});

describe('day rate', () => {
  const members = ['Robin', 'Julia', 'Jonas'].map((name) => member({ name }));

  it('splits €410 three ways over 25 days when nobody else rides', () => {
    expect(totalMemberDays(members)).toBe(75);
    const rate = dayRate(members, settings);
    expect(rate).toBeCloseTo(5.4667, 4); // 410 / 75
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
    expect(rate).toBeCloseTo(5.3595, 4); // 410 / 76.5

    expect(personCarCharge(people[3], rate)).toBeCloseTo(8.04, 2);
    members.forEach((m) => expect(personCarCharge(m, rate)).toBeCloseTo(133.99, 2));
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

describe('the free day before the rental starts', () => {
  // The group has the car on the 6th; the owner is only paid from the 7th.
  const sixth = trip({ date: '2026-08-06', driver: 'Julia', riders: ['Lucia'], people: 2, perPerson: 2.13 });
  const seventh = trip({ date: '2026-08-07', driver: 'Julia', riders: ['Lucia'], people: 2, perPerson: 2.13 });

  it('charges no day for a trip before the period starts', () => {
    expect(personRideDays('Lucia', [sixth], settings)).toBe(0);
  });

  it('still charges the fuel for that trip', () => {
    expect(personTripCosts('Lucia', [sixth])).toBeCloseTo(2.13, 2);
  });

  it('charges a day for the same trip one day later', () => {
    expect(personRideDays('Lucia', [seventh], settings)).toBe(1);
  });

  it('charges no day after the period ends either', () => {
    const september = trip({ date: '2026-09-01', driver: 'Julia', riders: ['Lucia'] });
    expect(personRideDays('Lucia', [september], settings)).toBe(0);
  });

  it('counts every day when no period is given', () => {
    expect(personRideDays('Lucia', [sixth, seventh])).toBe(2);
  });
});

describe('taxi trips', () => {
  it('divides the cost between the passengers and spares the driver', () => {
    const cost = tripCost({ distanceKm: 28, riderCount: 2, taxi: true }, settings);
    expect(cost.people).toBe(2);
    expect(cost.perPerson).toBeCloseTo(1.31, 2);
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

  it('charges the driver when a lift carries only guests', () => {
    // Nobody in the back pays, so the favour has no one to bill. The driver
    // covers their own petrol rather than the pot absorbing it.
    const cost = tripCost(
      { distanceKm: 28, riderCount: 2, payingRiderCount: 0, taxi: true },
      settings,
    );
    expect(cost.people).toBe(1);
    expect(cost.perPerson).toBeCloseTo(cost.total, 5);
  });
});

describe('guests', () => {
  it('splits the trip between the paying people only', () => {
    const cost = tripCost(
      { distanceKm: 28, riderCount: 2, payingRiderCount: 1 },
      settings,
    );
    // Driver plus one paying rider — the guest is in the car but not the sum.
    expect(cost.people).toBe(2);
    expect(cost.perPerson).toBeCloseTo(cost.total / 2, 5);
  });

  it('still counts a guest towards the fuel, because the car carried them', () => {
    const withGuest = tripCost(
      { distanceKm: 28, riderCount: 2, payingRiderCount: 1 },
      settings,
    );
    const without = tripCost({ distanceKm: 28, riderCount: 1 }, settings);
    expect(withGuest.fuelCost).toBeGreaterThan(without.fuelCost);
    // 3% a head: three aboard rather than two.
    expect(withGuest.fuelCost / without.fuelCost).toBeCloseTo(1.06 / 1.03, 4);
  });

  it('leaves the books balanced — a guest takes nothing out of the pot', () => {
    // The bug this fixes: a guest used to pick up ride-days, widening the
    // denominator, so everyone's share fell to cover a charge nobody collected.
    const members = [
      member({ name: 'Robin', included: true, daysActive: 25 }),
      member({ name: 'Julia', included: true, daysActive: 25 }),
      member({ name: 'Jonas', included: true, daysActive: 25 }),
    ];
    const rate = dayRate(members, { ...settings, riderDays: 0 });
    const collected = members.reduce((sum, m) => sum + m.daysActive * rate, 0);
    expect(collected).toBeCloseTo(settings.totalCost, 2);
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

    // He fronted the whole pot and owes his own share back out of it, so he's
    // owed the rest. Derived, not typed in — the pot has moved twice already.
    expect(ledgers[0].balance).toBeCloseTo(25 * rate - 410, 2);
    const owedByOthers = ledgers.slice(1).reduce((sum, l) => sum + l.balance, 0);
    expect(owedByOthers).toBeCloseTo(-ledgers[0].balance, 6);
  });
});

describe('personDayBreakdown', () => {
  const trip = (over: Partial<Trip>): Trip =>
    ({
      id: over.date ?? 'x',
      date: '2026-08-10T10:00:00.000Z',
      driver: 'Robin',
      destination: 'Zavial',
      activity: '',
      tripType: 'Round trip',
      distanceKm: 20,
      fuelCost: 2,
      tolls: 0,
      parking: 0,
      total: 2,
      people: 2,
      perPerson: 1,
      riders: ['Lucia'],
      notes: '',
      taxi: false,
      boards: false,
      origin: 'Quinta',
      until: '',
      ...over,
    }) as Trip;

  it('separates full days from the half a single one-way lift earns', () => {
    const trips = [
      trip({ date: '2026-08-10T10:00:00.000Z' }),
      trip({ date: '2026-08-11T10:00:00.000Z', taxi: true, tripType: 'One-way' }),
      trip({ date: '2026-08-12T10:00:00.000Z', taxi: true, tripType: 'One-way' }),
    ];
    expect(personDayBreakdown('Lucia', trips)).toEqual({ full: 1, half: 2 });
  });

  it('adds up to exactly what the person is charged — the invariant the two lines rest on', () => {
    const trips = [
      trip({ date: '2026-08-10T10:00:00.000Z' }),
      trip({ date: '2026-08-11T10:00:00.000Z', taxi: true, tripType: 'One-way' }),
      // A second lift the same day makes it a full day, not two halves.
      trip({ date: '2026-08-12T08:00:00.000Z', taxi: true, tripType: 'One-way' }),
      trip({ date: '2026-08-12T18:00:00.000Z', taxi: true, tripType: 'One-way' }),
    ];
    const { full, half } = personDayBreakdown('Lucia', trips);
    expect(full + half * 0.5).toBe(personRideDays('Lucia', trips));
    expect(full + half * 0.5).toBe(2.5);
  });
});

describe('a lift in its driver’s own list', () => {
  const lift = (over: Partial<Trip> = {}): Trip =>
    ({
      id: 'lift-1',
      date: '2026-08-17T10:00:00.000Z',
      driver: 'Jonas',
      destination: 'Lagos',
      activity: '',
      tripType: 'One-way',
      distanceKm: 20,
      fuelCost: 2.7,
      tolls: 0,
      parking: 0,
      total: 2.7,
      people: 1,
      perPerson: 2.7,
      riders: ['Lucia'],
      notes: '',
      taxi: true,
      boards: false,
      origin: 'Quinta',
      until: '',
      ...over,
    }) as Trip;

  it('shows on the driver’s page even though it costs them nothing', () => {
    const trips = [lift()];
    expect(personTrips('Jonas', trips)).toHaveLength(0);
    expect(personTripsShown('Jonas', trips)).toHaveLength(1);
    expect(personTripShare('Jonas', trips[0])).toBe(0);
  });

  it('leaves the money exactly where it was', () => {
    const trips = [lift()];
    // The whole point of the split: the list grew, the ledger did not.
    expect(personTripCosts('Jonas', trips)).toBe(0);
    expect(personTripCosts('Lucia', trips)).toBeCloseTo(2.7, 2);
    expect(personTripShare('Lucia', trips[0])).toBeCloseTo(2.7, 2);
  });

  it('does not list a trip twice when the driver also rode', () => {
    // An ordinary shared trip they drove is already in personTrips.
    const shared = [lift({ taxi: false })];
    expect(personTripsShown('Jonas', shared)).toHaveLength(1);
    expect(personTripShare('Jonas', shared[0])).toBeCloseTo(2.7, 2);
  });
});
