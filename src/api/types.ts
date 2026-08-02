export interface Settings {
  totalCost: number;
  monthStart: string;
  monthEnd: string;
  totalMemberDays: number;
  dailyRate: number;
  fuelPrice: number;
  consumption: number;
  costPerKm: number;
}

export interface Member {
  name: string;
  included: boolean;
  joinDate: string;
  leaveDate: string;
  daysActive: number;
  share: number;
  paid: number;
  balance: number;
  karma: number;
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
}

export type TripType = 'Round trip' | 'One-way';

export interface Bootstrap {
  version: string;
  settings: Settings;
  members: Member[];
  spots: Spot[];
  karmaActions: KarmaAction[];
  reservations: Reservation[];
  recentTrips: Trip[];
}

export type OpName =
  | 'completeTrip'
  | 'createReservation'
  | 'cancelReservation'
  | 'logKarma'
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
