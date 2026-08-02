import type { Member, Settings, Spot, TripType } from '../api/types';

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

/** Members column F — =E/Settings!B6*Settings!B3, and only if Include? is Yes. */
export function membershipShare(member: Member, settings: Settings): number {
  if (!member.included) return 0;
  if (!settings.totalMemberDays) return 0;
  return (member.daysActive / settings.totalMemberDays) * settings.totalCost;
}

/** Settings!B6 — =SUMIFS(Members days, Include?, "Yes") */
export function totalMemberDays(members: Member[]): number {
  return members.reduce((sum, m) => sum + (m.included ? m.daysActive : 0), 0);
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
