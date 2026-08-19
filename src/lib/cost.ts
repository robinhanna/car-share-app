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
  /** A lift: the driver returns empty, so the car covers the return leg too. */
  taxi?: boolean;
}

/**
 * How much more fuel a loaded car burns. Roughly 3% per passenger for the
 * weight and 8% for the drag of boards on the roof, capped at +25%.
 * Mirrors the load term in the Trip Log's fuel formula.
 */
export function loadFactor(people: number, boards: boolean): number {
  const factor = 1 + 0.03 * Math.max(people - 1, 0) + (boards ? 0.08 : 0);
  return Math.min(factor, 1.25);
}

/**
 * Trip Log column E. Priority: odometer reading, then a Surf Spots lookup
 * honouring the one-way / round-trip toggle, then manually typed km.
 */
export function tripDistanceKm(input: DistanceInput): number {
  const { odoStart, odoEnd, spot, tripType = 'Round trip', manualKm, taxi } = input;

  if (isNum(odoStart) && isNum(odoEnd)) {
    return Math.max(odoEnd - odoStart, 0);
  }
  if (spot) {
    // A one-way lift still counts double: the passenger gets out, the driver
    // drives home empty, and the car burnt the fuel for both legs.
    const legs = tripType === 'One-way' && !taxi ? 1 : 2;
    return spot.oneWayKm * legs;
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
  /** Everyone in the back, guests included — this is what the car carried. */
  riderCount: number;
  /**
   * How many of those actually share the bill. Guests ride free, so they add
   * weight but not a wallet. Defaults to riderCount when there are no guests.
   */
  payingRiderCount?: number;
  /** A favour, not a shared outing: the driver pays nothing. */
  taxi?: boolean;
  /** Boards on the roof — real drag, real fuel. */
  boards?: boolean;
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

  const paying = input.payingRiderCount ?? input.riderCount;

  // On a taxi run the cost divides between the passengers only. With nobody in
  // the back who pays — an empty car, or a car full of guests — there is no
  // favour being done at anyone's expense, so it falls back to the driver
  // covering their own petrol rather than dividing by zero or, worse, leaving
  // the fuel to come quietly out of the shared pot.
  const isTaxi = !!input.taxi && paying > 0;
  const people = isTaxi ? paying : Math.max(1 + paying, 1);

  // Weight is weight. The driver counts towards the load even on a lift they
  // aren't paying for, and so does a guest who isn't paying at all — the car
  // still carried them and still burned the fuel.
  const onboard = 1 + input.riderCount;
  const fuel = fuelCost(input.distanceKm, settings) * loadFactor(onboard, !!input.boards);
  const total = fuel + tolls + parking;

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

/**
 * Every trip this person was in.
 *
 * A taxi driver isn't "in" their own taxi run for costing purposes: they were
 * doing a favour, so the run neither charges them nor counts as their day.
 */
export function personTrips(name: string, trips: Trip[]): Trip[] {
  return trips.filter((t) => {
    if (t.riders.includes(name)) return true;
    return t.driver === name && !(t.taxi && t.riders.length > 0);
  });
}

/**
 * The same trips, plus the lifts they drove.
 *
 * personTrips leaves a taxi driver out of their own run on purpose — it feeds
 * personTripCosts, and putting them back would charge them for a favour they
 * did for free. But the run still happened and belongs in their history, so
 * the list on screen uses this and prices those rows at nothing. Two jobs, two
 * functions; the money keeps the stricter one.
 */
export function personTripsShown(name: string, trips: Trip[]): Trip[] {
  const own = personTrips(name, trips);
  const drovenAsFavour = trips.filter(
    (t) => t.driver === name && t.taxi && t.riders.length > 0 && !own.includes(t),
  );
  return [...own, ...drovenAsFavour];
}

/** Nothing, when they were doing the driving on a lift. */
export function personTripShare(name: string, trip: Trip): number {
  if (trip.driver === name && trip.taxi && trip.riders.length > 0) return 0;
  return trip.perPerson;
}

/**
 * What one calendar day in the car costs a rider. Mirrors dayCharge_ in
 * apps-script/Code.gs.
 *
 * Half a day is reserved for a single one-way taxi drop-off. Riding along on an
 * ordinary shared trip is a full day however short, and a second ride the same
 * day makes it a full day regardless.
 */
export function dayCharge(tripsThatDay: Trip[]): number {
  if (!tripsThatDay.length) return 0;
  const only = tripsThatDay[0];
  if (tripsThatDay.length === 1 && only.taxi && only.tripType === 'One-way') return 0.5;
  return 1;
}

/**
 * Their ride-days, half days included.
 *
 * Only days inside the paid rental period count. The group has the car on the
 * 6th but nobody is paying the owner for it, so a trip that day costs fuel and
 * no day rate. Mirrors the period check in rebuildRideDays_.
 */
/**
 * Splits a rider list into the people who share the bill and the guests who
 * don't. Mirrors payingRiders_ in Code.gs — same rule, both ends: a guest is
 * anyone missing from Members, or listed there with the role "Guest".
 *
 * Keeping the definition identical is what stops the running total on the form
 * disagreeing with what the sheet eventually stores.
 */
export function splitRiders(
  riders: string[],
  members: Member[],
): { paying: string[]; guests: string[] } {
  const pays = new Set(
    members.filter((m) => m.role !== 'Guest').map((m) => m.name.trim().toLowerCase()),
  );
  const paying: string[] = [];
  const guests: string[] = [];
  riders.forEach((name) => {
    (pays.has(name.trim().toLowerCase()) ? paying : guests).push(name);
  });
  return { paying, guests };
}

/**
 * The same walk as personRideDays, but keeping the shape of each day rather
 * than only the sum: how many days were charged in full and how many were the
 * half-day a single one-way lift earns.
 *
 * A passenger's bill is mostly half days, and a single total can't show that.
 * personRideDays is built on this so there is one rule, not two.
 */
export function personDayBreakdown(
  name: string,
  trips: Trip[],
  period?: { monthStart: string; monthEnd: string },
): { full: number; half: number } {
  const start = period?.monthStart.slice(0, 10);
  const end = period?.monthEnd.slice(0, 10);

  const byDay = new Map<string, Trip[]>();
  personTrips(name, trips).forEach((t) => {
    const day = (t.date || '').slice(0, 10);
    if (!day) return;
    if (start && day < start) return;
    if (end && day > end) return;
    byDay.set(day, [...(byDay.get(day) ?? []), t]);
  });

  let full = 0;
  let half = 0;
  byDay.forEach((dayTrips) => {
    const charge = dayCharge(dayTrips);
    if (charge === 0.5) half++;
    else if (charge > 0) full++;
  });
  return { full, half };
}

export function personRideDays(
  name: string,
  trips: Trip[],
  period?: { monthStart: string; monthEnd: string },
): number {
  const { full, half } = personDayBreakdown(name, trips, period);
  return full + half * 0.5;
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

/** Ride-days can be fractional — a single one-way taxi drop-off is half a day. */
export function days(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `${text} ${rounded === 1 ? 'day' : 'days'}`;
}

function isNum(v: number | null | undefined): v is number {
  return typeof v === 'number' && !Number.isNaN(v);
}
