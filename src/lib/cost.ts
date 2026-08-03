import type { Member, Payment, Role, Settings, Spot, Trip, TripType } from '../api/types';

/**
 * The maths here mirrors the spreadsheet formulas exactly, so the summary a
 * driver sees offline matches what the Sheet will calculate once the trip
 * syncs. If one changes, change the other — the parity test in the plan exists
 * to catch drift.
 */

/** Settings!B11 — =B9*B10/100 */
export function costPerKm(fuelPrice: number, consumptionPer100km: number): number {
  return (fuelPrice * consumptionPer100km) / 100;
}

export interface DistanceInput {
  odoStart?: number | null;
  odoEnd?: number | null;
  spot?: Spot | null;
  tripType?: TripType;
  manualKm?: number | null;
}

/**
 * Trip Log column E. Priority: odometer reading, then a Surf Spots lookup
 * honouring the one-way / round-trip toggle, then manually typed km.
 */
export function tripDistanceKm(input: DistanceInput): number {
  const { odoStart, odoEnd, spot, tripType = 'Round trip', manualKm } = input;

  if (isNum(odoStart) && isNum(odoEnd)) {
    return Math.max(odoEnd - odoStart, 0);
  }
  if (spot) {
    return spot.oneWayKm * (tripType === 'One-way' ? 1 : 2);
  }
  return isNum(manualKm) ? manualKm : 0;
}

/** Trip Log column F — =E*Settings!B11 */
export function fuelCost(distanceKm: number, settings: Settings): number {
  return distanceKm * settings.costPerKm;
}

export interface TripCostInput {
  distanceKm: number;
  tolls?: number;
  parking?: number;
  riderCount: number;
}

export interface TripCost {
  distanceKm: number;
  fuelCost: number;
  tolls: number;
  parking: number;
  total: number;
  people: number;
  perPerson: number;
}

/**
 * Trip Log columns F, I, J, K. Headcount is the driver plus named riders, and
 * everyone in the car pays an equal share of that trip — including riders who
 * aren't paying into the membership, which is exactly the rule the spreadsheet
 * was built on.
 */
export function tripCost(input: TripCostInput, settings: Settings): TripCost {
  const tolls = input.tolls ?? 0;
  const parking = input.parking ?? 0;
  const fuel = fuelCost(input.distanceKm, settings);
  const total = fuel + tolls + parking;
  const people = Math.max(1 + input.riderCount, 1);

  return {
    distanceKm: input.distanceKm,
    fuelCost: fuel,
    tolls,
    parking,
    total,
    people,
    perPerson: total / people,
  };
}

/** Settings!B6 — =SUMIFS(Members days, Include?, "Yes") */
export function totalMemberDays(members: Member[]): number {
  return members.reduce((sum, m) => sum + (m.included ? m.daysActive : 0), 0);
}

/** Settings!B12 — ride-days belonging to everyone not paying into the rental. */
export function totalRiderDays(members: Member[]): number {
  return members.reduce((sum, m) => sum + (m.included ? 0 : m.rideDays), 0);
}

/**
 * Settings!B13 — the rate everyone pays per day, driver or not.
 *
 * Non-driver ride-days join the denominator rather than being credited back
 * afterwards. That is what makes "a non-driver pays what a member pays per day"
 * and "their money reduces what members owe" both true at once: as a rider
 * clocks up days the rate falls for everybody, and the total collected is still
 * exactly the rental cost.
 */
export function dayRate(members: Member[], settings: Settings): number {
  const denominator = totalMemberDays(members) + totalRiderDays(members);
  return denominator > 0 ? settings.totalCost / denominator : 0;
}

/** Members column F — days × day rate, ride-days for anyone not paying in. */
export function personCarCharge(member: Member, rate: number): number {
  return (member.included ? member.daysActive : member.rideDays) * rate;
}

/** Every trip this person was in, driver or rider. */
export function personTrips(name: string, trips: Trip[]): Trip[] {
  return trips.filter((t) => t.driver === name || t.riders.includes(name));
}

/** Their equal share of fuel, tolls and parking across those trips. */
export function personTripCosts(name: string, trips: Trip[]): number {
  return personTrips(name, trips).reduce((sum, t) => sum + t.perPerson, 0);
}

export function personPayments(name: string, payments: Payment[]): Payment[] {
  return payments.filter((p) => p.name === name);
}

export function personPaid(name: string, payments: Payment[]): number {
  return personPayments(name, payments).reduce((sum, p) => sum + p.amount, 0);
}

export interface PersonLedger {
  name: string;
  role: Role;
  chargedDays: number;
  carCharge: number;
  tripCosts: number;
  paid: number;
  /** Positive means they owe; negative means they are owed. */
  balance: number;
}

/** Members column H — car charge + trip costs − everything they have paid. */
export function personLedger(
  member: Member,
  trips: Trip[],
  payments: Payment[],
  rate: number,
): PersonLedger {
  const carCharge = personCarCharge(member, rate);
  const tripCosts = personTripCosts(member.name, trips);
  const paid = personPaid(member.name, payments);

  return {
    name: member.name,
    role: member.role,
    chargedDays: member.included ? member.daysActive : member.rideDays,
    carCharge,
    tripCosts,
    paid,
    balance: carCharge + tripCosts - paid,
  };
}

export function euro(value: number): string {
  return new Intl.NumberFormat('en-IE', { style: 'currency', currency: 'EUR' }).format(value);
}

export function km(value: number): string {
  return `${Math.round(value * 10) / 10} km`;
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}
