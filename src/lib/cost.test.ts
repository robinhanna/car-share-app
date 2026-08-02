import { describe, expect, it } from 'vitest';
import type { Member, Settings, Spot } from '../api/types';
import { costPerKm, fuelCost, membershipShare, totalMemberDays, tripCost, tripDistanceKm } from './cost';

// Values taken from output/car_rental_cost_split.xlsx — Settings B3, B9, B10, B11.
const settings: Settings = {
  totalCost: 465,
  monthStart: '2026-08-01',
  monthEnd: '2026-08-31',
  totalMemberDays: 124, // 4 included members x 31 days
  dailyRate: 465 / 124,
  fuelPrice: 2.03,
  consumption: 7.5,
  costPerKm: costPerKm(2.03, 7.5),
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
  share: 0,
  paid: 0,
  balance: 0,
  karma: 0,
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

describe('membership split', () => {
  it('splits €465 four ways at €116.25 each', () => {
    const members = [member(), member({ name: 'Julia' }), member({ name: 'Jonas' }), member({ name: 'John' })];
    const s = { ...settings, totalMemberDays: totalMemberDays(members) };
    expect(s.totalMemberDays).toBe(124);
    members.forEach((m) => expect(membershipShare(m, s)).toBeCloseTo(116.25, 2));
  });

  it('splits €465 five ways at €93 each', () => {
    const members = ['Robin', 'Julia', 'Jonas', 'John', 'Roberta'].map((name) => member({ name }));
    const s = { ...settings, totalMemberDays: totalMemberDays(members) };
    expect(s.totalMemberDays).toBe(155);
    members.forEach((m) => expect(membershipShare(m, s)).toBeCloseTo(93, 2));
  });

  it('charges nothing to an excluded member', () => {
    const roberta = member({ name: 'Roberta', included: false });
    expect(membershipShare(roberta, settings)).toBe(0);
  });

  it('prorates someone who joins halfway through', () => {
    const members = [member(), member({ name: 'Late', daysActive: 10 })];
    const s = { ...settings, totalMemberDays: totalMemberDays(members) };
    expect(membershipShare(members[1], s)).toBeCloseTo((10 / 41) * 465, 2);
  });
});
