export interface Settings {
  /** Rental + extras — the pot everyone shares. */
  totalCost: number;
  rentalCost: number;
  /** Pickup / one-off costs, e.g. the Uber to collect the car. */
  extras: number;
  monthStart: string;
  monthEnd: string;
  totalMemberDays: number;
  dailyRate: number;
  fuelPrice: number;
  consumption: number;
  costPerKm: number;
  /** Non-driver ride-days — the other half of the day-rate denominator. */
  riderDays: number;
  dayRate: number;
}

export type Role = 'Driver' | 'Non-driver' | 'Guest';

export interface Member {
  name: string;
  included: boolean;
  joinDate: string;
  leaveDate: string;
  daysActive: number;
  /** Days × day rate — active days if paying into the rental, else ride-days. */
  carCharge: number;
  paid: number;
  balance: number;
  karma: number;
  role: Role;
  rideDays: number;
  tripCosts: number;
}

export type PaymentType =
  | 'cash'
  | 'fuel'
  | 'tolls'
  | 'parking'
  | 'prepayment'
  /** One side of a transfer between two people — negative on the receiver's row. */
  | 'settlement';

export interface Payment {
  date: string;
  name: string;
  type: PaymentType;
  amount: number;
  note: string;
}

export interface KarmaEntry {
  date: string;
  name: string;
  action: string;
  points: number;
}

export interface Place {
  category: 'Town' | 'Activity';
  name: string;
  oneWayKm: number;
  notes: string;
}

export interface Spot {
  zone: string;
  name: string;
  oneWayKm: number;
  roundTripKm: number;
  driveMinutes: number;
  notes: string;
}

export interface KarmaAction {
  action: string;
  points: number;
}

export type ReservationStatus = 'reserved' | 'completed' | 'cancelled';

export interface Reservation {
  id: string;
  created: string;
  driver: string;
  riders: string[];
  start: string;
  end: string;
  destination: string;
  status: ReservationStatus;
  tripId: string;
  notes: string;
}

export interface Trip {
  id: string;
  date: string;
  driver: string;
  destination: string;
  distanceKm: number;
  fuelCost: number;
  tolls: number;
  parking: number;
  total: number;
  people: number;
  perPerson: number;
  riders: string[];
  tripType: TripType;
  activity: string;
  /** Driver was doing a favour: they pay nothing and are charged no day. */
  taxi: boolean;
  origin: string;
  boards: boolean;
  rideRequestId: string;
  /** When the car got back. Empty on trips logged before this existed. */
  until: string;
}

export type RideStatus = 'open' | 'claimed' | 'done' | 'cancelled';

export interface RideRequest {
  id: string;
  created: string;
  passenger: string;
  others: string[];
  when: string;
  from: string;
  to: string;
  notes: string;
  status: RideStatus;
  driver: string;
  tripId: string;
}

export type TripType = 'Round trip' | 'One-way';

export interface Bootstrap {
  version: string;
  settings: Settings;
  members: Member[];
  spots: Spot[];
  places: Place[];
  karmaActions: KarmaAction[];
  karmaLog: KarmaEntry[];
  payments: Payment[];
  reservations: Reservation[];
  rideRequests: RideRequest[];
  /** Every trip of the month — the per-person ledger needs the full set. */
  recentTrips: Trip[];
}

export type OpName =
  | 'completeTrip'
  | 'createReservation'
  | 'cancelReservation'
  | 'logKarma'
  | 'logPayment'
  | 'settleUp'
  | 'requestRide'
  | 'claimRide'
  | 'cancelRide'
  | 'joinReservation'
  | 'joinRide'
  | 'logRide'
  | 'editTrip'
  | 'deleteTrip'
  | 'resetTestData';

export interface CompleteTripPayload {
  date: string;
  driver: string;
  destination: string;
  manualKm: number | null;
  odoStart: number | null;
  odoEnd: number | null;
  tripType: TripType;
  riders: string[];
  tolls: number;
  parking: number;
  notes: string;
  reservationId: string;
  activity: string;
  taxi: boolean;
  rideRequestId: string;
  origin: string;
  boards: boolean;
  until: string;
}

export interface JoinPayload {
  id: string;
  name: string;
  join: boolean;
}

export interface LogRidePayload {
  id: string;
  date: string;
}

export interface EditTripPayload extends Omit<CompleteTripPayload, 'reservationId' | 'rideRequestId'> {
  tripId: string;
}

export interface DeleteTripPayload {
  tripId: string;
}

export interface RequestRidePayload {
  id: string;
  passenger: string;
  others: string[];
  when: string;
  from: string;
  to: string;
  notes: string;
}

export interface ClaimRidePayload {
  id: string;
  driver: string;
}

export interface CancelRidePayload {
  id: string;
}

export interface CreateReservationPayload {
  id: string;
  driver: string;
  riders: string[];
  start: string;
  end: string;
  destination: string;
  notes: string;
}

export interface CancelReservationPayload {
  id: string;
}

export interface LogKarmaPayload {
  date: string;
  name: string;
  action: string;
  points: number;
  /** Euros spent, if the action involved money (refuelling). Credited as a payment. */
  amount?: number;
}

export interface SettleUpPayload {
  date: string;
  from: string;
  to: string;
  amount: number;
  note: string;
}

export interface LogPaymentPayload {
  date: string;
  name: string;
  type: PaymentType;
  amount: number;
  note: string;
}

/** Testing only. The literal guards against a stray call doing damage. */
export interface ResetPayload {
  confirm: 'RESET';
}

export type OpPayload =
  | CompleteTripPayload
  | CreateReservationPayload
  | CancelReservationPayload
  | LogKarmaPayload
  | LogPaymentPayload
  | SettleUpPayload
  | RequestRidePayload
  | ClaimRidePayload
  | CancelRidePayload
  | JoinPayload
  | LogRidePayload
  | EditTripPayload
  | DeleteTripPayload
  | ResetPayload;

export interface Op {
  clientId: string;
  op: OpName;
  payload: OpPayload;
}

export interface OpResult {
  clientId: string;
  ok: boolean;
  error?: string;
  data?: unknown;
}

export interface PostResponse {
  ok: boolean;
  error?: string;
  results?: OpResult[];
  data?: Bootstrap;
}
