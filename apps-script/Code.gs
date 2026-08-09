/**
 * Car Share API — Soul & Surf, Almádena, August 2026.
 *
 * Bound to the "Car Share — August 2026" spreadsheet. Deployed as a Web App
 * (Execute as: Me / Who has access: Anyone) so the PWA can read and write
 * without any credentials of its own.
 *
 * Run setupSheet() once before the first deployment — see setup.gs.
 */

/**
 * Bumped whenever this file changes in a way the app depends on.
 *
 * Pasting the code into the editor is not the same as deploying it: without
 * Bereitstellen → Neue Version the web app keeps serving the old code, which
 * has now caused three rounds of "my changes aren't being accepted". The
 * bootstrap returns this number so the app can say so out loud, and
 * verifyInstall() compares it against what setup.gs expects.
 */
var CODE_VERSION = 14;

var SHEETS = {
  settings: 'Settings',
  spots: 'Surf Spots',
  places: 'Places',
  members: 'Members',
  trips: 'Trip Log',
  karma: 'Karma Log',
  reservations: 'Reservations',
  karmaActions: 'Karma Actions',
  payments: 'Payments',
  rideDays: 'Ride Days',
  rideRequests: 'Ride Requests',
};

// Trip Log columns (1-indexed), A-L are the original spreadsheet, M-V are new.
var TRIP = {
  date: 1, driver: 2, destination: 3, manualKm: 4, distance: 5, fuel: 6,
  tolls: 7, parking: 8, total: 9, people: 10, perPerson: 11, notes: 12,
  id: 13, riders: 14, tripType: 15, reservationId: 16, clientId: 17,
  odoStart: 18, odoEnd: 19, activity: 20, taxi: 21, rideRequestId: 22,
  origin: 23, boards: 24, until: 25,
};

var RIDE_REQ = {
  id: 1, created: 2, passenger: 3, others: 4, when: 5, from: 6, to: 7,
  notes: 8, status: 9, driver: 10, tripId: 11, clientId: 12,
};

var RES = {
  id: 1, created: 2, driver: 3, riders: 4, start: 5, end: 6,
  destination: 7, status: 8, tripId: 9, clientId: 10, notes: 11,
  // When the driver last changed the plan. The app compares this against what
  // each phone last acknowledged to decide who needs telling.
  updated: 12,
};

var KARMA = { date: 1, name: 2, action: 3, points: 4, clientId: 5 };

var MEMBER = {
  name: 1, include: 2, join: 3, leave: 4, days: 5, share: 6, paid: 7,
  balance: 8, karma: 9, role: 10, rideDays: 11, tripCosts: 12,
};

var PAY = { date: 1, name: 2, type: 3, amount: 4, note: 5, clientId: 6 };

var RIDE = { name: 1, role: 2, days: 3, carCharge: 4, tripCosts: 5 };

var PLACE = { category: 1, name: 2, km: 3, notes: 4 };

var FIRST_DATA_ROW = 3;

/**
 * Seats on the Members tab (rows 3-22). Ten was the spreadsheet's original
 * block and the group already fills nine of them; an eleventh name would land
 * outside every formula and every range and quietly show as €0.00.
 */
var MEMBER_ROWS = 20;

/** Rows the Members block must not mistake for people. */
var MEMBER_FURNITURE = /^(total|check\b)/i;

/** Who fronted the rental. Used to seed the prepayment row. */
var ADMIN_NAME = 'Robin';

/**
 * The karma action awarded for driving someone. Named in one place because
 * setup.gs seeds it, migrateConfig_ renames it, and liftKarmaAction_ falls back
 * to it — three copies of a string is three chances to drift.
 */
var LIFT_ACTION = 'Gave people a lift';

// ---------------------------------------------------------------- endpoints

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'bootstrap';
  try {
    if (action === 'bootstrap') {
      // Throttled inside, so this costs nothing on most requests.
      try { sweepDueRides_(); } catch (err) { Logger.log('Sweep failed: ' + err); }
      return json_({ ok: true, data: bootstrap_() });
    }
    return json_({ ok: false, error: 'Unknown action: ' + action });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  }
}

/**
 * Body: { token, ops: [{ clientId, op, payload }] }
 * Returns one result per op, in order. Ops are idempotent on clientId, which is
 * what makes the client's offline replay safe to retry.
 */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    var body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (!checkToken_(body.token)) return json_({ ok: false, error: 'Bad token' });

    var ops = body.ops || [];
    if (!ops.length) return json_({ ok: true, results: [] });

    lock.waitLock(30000);
    try { sweepDueRides_(); } catch (err) { Logger.log('Sweep failed: ' + err); }

    var results = ops.map(function (op) {
      try {
        return { clientId: op.clientId, ok: true, data: applyOp_(op) };
      } catch (err) {
        return { clientId: op.clientId, ok: false, error: String(err) };
      }
    });

    return json_({ ok: true, results: results, data: bootstrap_() });
  } catch (err) {
    return json_({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function applyOp_(op) {
  switch (op.op) {
    case 'completeTrip': return completeTrip_(op.clientId, op.payload || {});
    case 'createReservation': return createReservation_(op.clientId, op.payload || {});
    case 'editReservation': return editReservation_(op.payload || {});
    case 'cancelReservation': return cancelReservation_(op.payload || {});
    case 'logKarma': return logKarma_(op.clientId, op.payload || {});
    case 'deleteKarma': return deleteKarma_(op.payload || {});
    case 'logPayment': return logPayment_(op.clientId, op.payload || {});
    case 'settleUp': return settleUp_(op.clientId, op.payload || {});
    case 'requestRide': return requestRide_(op.clientId, op.payload || {});
    case 'claimRide': return claimRide_(op.payload || {});
    case 'cancelRide': return cancelRide_(op.payload || {});
    case 'joinReservation': return joinReservation_(op.payload || {});
    case 'joinRide': return joinRide_(op.payload || {});
    case 'logRide': return logRide_(op.clientId, op.payload || {});
    case 'editTrip': return editTrip_(op.payload || {});
    case 'deleteTrip': return deleteTrip_(op.payload || {});
    case 'resetTestData': return resetTestData_(op.payload || {});
    default: throw new Error('Unknown op: ' + op.op);
  }
}

// ---------------------------------------------------------------- bootstrap

function bootstrap_() {
  var ss = SpreadsheetApp.getActive();
  return {
    version: new Date().toISOString(),
    codeVersion: CODE_VERSION,
    settings: readSettings_(ss),
    members: readMembers_(ss),
    spots: readSpots_(ss),
    places: readPlaces_(ss),
    karmaActions: readKarmaActions_(ss),
    karmaLog: readKarmaLog_(ss),
    payments: readPayments_(ss),
    reservations: readReservations_(ss),
    rideRequests: readRideRequests_(ss),
    recentTrips: readTrips_(ss),
  };
}

function readSettings_(ss) {
  var s = ss.getSheetByName(SHEETS.settings);
  return {
    // What everyone shares: the rental plus any extras such as the Uber to
    // collect the car. B3 alone is just the rental.
    totalCost: num_(s.getRange('B15').getValue()),
    rentalCost: num_(s.getRange('B3').getValue()),
    extras: num_(s.getRange('B14').getValue()),
    // Plain yyyy-MM-dd in the sheet's own timezone. toISOString() would turn
    // 7 August in Lisbon into "2026-08-06T23:00Z", and the client compares
    // these against trip dates by string — an off-by-one on both ends.
    monthStart: dateKey_(s.getRange('B4').getValue()),
    monthEnd: dateKey_(s.getRange('B5').getValue()),
    totalMemberDays: num_(s.getRange('B6').getValue()),
    dailyRate: num_(s.getRange('B7').getValue()),
    fuelPrice: num_(s.getRange('B9').getValue()),
    consumption: num_(s.getRange('B10').getValue()),
    costPerKm: num_(s.getRange('B11').getValue()),
    riderDays: num_(s.getRange('B12').getValue()),
    dayRate: num_(s.getRange('B13').getValue()),
  };
}

/** Members tab only, without the Ride Days merge — used by rebuildRideDays_. */
function rawMembers_(ss) {
  var s = ss.getSheetByName(SHEETS.members);
  var rows = s.getRange(FIRST_DATA_ROW, 1, MEMBER_ROWS, MEMBER.tripCosts).getValues();
  return rows
    .filter(function (r) {
      // The widened block spans the old TOTAL and Check rows. setupSheet moves
      // them out of the way, but this guards the window between someone
      // deploying new code and running the migration — otherwise "TOTAL" shows
      // up in the app as a member.
      var name = String(r[MEMBER.name - 1]).trim();
      return name !== '' && !MEMBER_FURNITURE.test(name);
    })
    .map(function (r) {
      return {
        name: String(r[MEMBER.name - 1]).trim(),
        included: String(r[MEMBER.include - 1]).trim().toLowerCase() === 'yes',
        joinDate: iso_(r[MEMBER.join - 1]),
        leaveDate: iso_(r[MEMBER.leave - 1]),
        daysActive: num_(r[MEMBER.days - 1]),
        carCharge: num_(r[MEMBER.share - 1]),
        paid: num_(r[MEMBER.paid - 1]),
        balance: num_(r[MEMBER.balance - 1]),
        karma: num_(r[MEMBER.karma - 1]),
        role: String(r[MEMBER.role - 1] || '').trim(),
        rideDays: num_(r[MEMBER.rideDays - 1]),
        tripCosts: num_(r[MEMBER.tripCosts - 1]),
      };
    });
}

/**
 * Members plus guests. A guest is someone who has been in the car but isn't on
 * the Members tab — they still accrue ride-days and a balance, so the app has
 * to see them.
 */
function readMembers_(ss) {
  var members = rawMembers_(ss);
  var known = {};
  members.forEach(function (m) {
    if (!m.role) m.role = m.included ? 'Driver' : 'Non-driver';
    known[m.name] = true;
  });

  readRideDays_(ss).forEach(function (r) {
    if (known[r.name]) return;
    members.push({
      name: r.name,
      included: false,
      joinDate: '',
      leaveDate: '',
      daysActive: 0,
      carCharge: r.carCharge,
      paid: sumPaymentsFor_(ss, r.name),
      balance: r.carCharge + r.tripCosts - sumPaymentsFor_(ss, r.name),
      karma: 0,
      role: 'Guest',
      rideDays: r.rideDays,
      tripCosts: r.tripCosts,
    });
  });

  return members;
}

function readRideDays_(ss) {
  var s = ss.getSheetByName(SHEETS.rideDays);
  if (!s) return [];
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, 5).getValues()
    .filter(function (r) { return String(r[RIDE.name - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        name: String(r[RIDE.name - 1]).trim(),
        role: String(r[RIDE.role - 1] || ''),
        rideDays: num_(r[RIDE.days - 1]),
        carCharge: num_(r[RIDE.carCharge - 1]),
        tripCosts: num_(r[RIDE.tripCosts - 1]),
      };
    });
}

function sumPaymentsFor_(ss, name) {
  return readPayments_(ss).reduce(function (sum, p) {
    return p.name === name ? sum + p.amount : sum;
  }, 0);
}

function readPlaces_(ss) {
  var s = ss.getSheetByName(SHEETS.places);
  if (!s) return [];
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, 4).getValues()
    .filter(function (r) { return String(r[PLACE.name - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        category: String(r[PLACE.category - 1]).trim(),
        name: String(r[PLACE.name - 1]).trim(),
        oneWayKm: num_(r[PLACE.km - 1]),
        notes: String(r[PLACE.notes - 1] || ''),
      };
    });
}

function readPayments_(ss) {
  var s = ss.getSheetByName(SHEETS.payments);
  if (!s) return [];
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, 6).getValues()
    .filter(function (r) { return String(r[PAY.name - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        date: iso_(r[PAY.date - 1]),
        name: String(r[PAY.name - 1]).trim(),
        type: String(r[PAY.type - 1] || 'cash'),
        amount: num_(r[PAY.amount - 1]),
        note: String(r[PAY.note - 1] || ''),
      };
    });
}

function readKarmaLog_(ss) {
  var s = ss.getSheetByName(SHEETS.karma);
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, KARMA.clientId).getValues()
    .filter(function (r) { return String(r[KARMA.name - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        // Without this the app can name a karma row but not point at one, which
        // is why a mis-tapped point used to be impossible to take back.
        id: String(r[KARMA.clientId - 1] || ''),
        date: iso_(r[KARMA.date - 1]),
        name: String(r[KARMA.name - 1]).trim(),
        action: String(r[KARMA.action - 1] || ''),
        points: num_(r[KARMA.points - 1]),
      };
    });
}

function readSpots_(ss) {
  var s = ss.getSheetByName(SHEETS.spots);
  var rows = s.getRange(FIRST_DATA_ROW, 1, Math.max(s.getLastRow() - 2, 0), 6).getValues();
  return rows
    .filter(function (r) { return String(r[1]).trim() !== ''; })
    .map(function (r) {
      return {
        zone: String(r[0]).trim(),
        name: String(r[1]).trim(),
        oneWayKm: num_(r[2]),
        roundTripKm: num_(r[3]),
        driveMinutes: num_(r[4]),
        notes: String(r[5] || ''),
      };
    });
}

function readKarmaActions_(ss) {
  var s = ss.getSheetByName(SHEETS.karmaActions);
  if (!s) return [];
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, 3).getValues()
    .filter(function (r) {
      return String(r[0]).trim() !== '' && String(r[2]).trim().toLowerCase() !== 'no';
    })
    .map(function (r) { return { action: String(r[0]).trim(), points: num_(r[1]) }; });
}

function readReservations_(ss) {
  var s = ss.getSheetByName(SHEETS.reservations);
  if (!s) return [];
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  var cutoff = new Date(Date.now() - 24 * 3600 * 1000);
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, RES.updated).getValues()
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        id: String(r[RES.id - 1]),
        created: iso_(r[RES.created - 1]),
        driver: String(r[RES.driver - 1]),
        riders: splitList_(r[RES.riders - 1]),
        start: iso_(r[RES.start - 1]),
        end: iso_(r[RES.end - 1]),
        destination: String(r[RES.destination - 1] || ''),
        status: String(r[RES.status - 1] || 'reserved'),
        tripId: String(r[RES.tripId - 1] || ''),
        notes: String(r[RES.notes - 1] || ''),
        updated: iso_(r[RES.updated - 1]),
      };
    })
    .filter(function (r) {
      // Everything still open, plus anything that ended in the last day so the
      // home screen can show "just finished".
      return r.status === 'reserved' && (!r.end || new Date(r.end) > cutoff);
    });
}

/** Every trip in the sheet — the per-person ledger needs the full set. */
function readTrips_(ss) {
  var s = ss.getSheetByName(SHEETS.trips);
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  var rows = s.getRange(FIRST_DATA_ROW, 1, last - 2, TRIP.until).getValues()
    .filter(function (r) { return String(r[TRIP.driver - 1]).trim() !== ''; });
  return rows.map(function (r) {
    return {
      id: String(r[TRIP.id - 1] || ''),
      date: iso_(r[TRIP.date - 1]),
      driver: String(r[TRIP.driver - 1]),
      destination: String(r[TRIP.destination - 1] || ''),
      distanceKm: num_(r[TRIP.distance - 1]),
      fuelCost: num_(r[TRIP.fuel - 1]),
      tolls: num_(r[TRIP.tolls - 1]),
      parking: num_(r[TRIP.parking - 1]),
      total: num_(r[TRIP.total - 1]),
      people: num_(r[TRIP.people - 1]),
      perPerson: num_(r[TRIP.perPerson - 1]),
      riders: splitList_(r[TRIP.riders - 1]),
      tripType: String(r[TRIP.tripType - 1] || ''),
      activity: String(r[TRIP.activity - 1] || ''),
      // Written since the first version, never read back — so a note you typed
      // landed in column L and then vanished from the app, which looks exactly
      // like it was never saved.
      notes: String(r[TRIP.notes - 1] || ''),
      taxi: String(r[TRIP.taxi - 1]).trim().toLowerCase() === 'yes',
      origin: String(r[TRIP.origin - 1] || ''),
      until: iso_(r[TRIP.until - 1]),
      boards: String(r[TRIP.boards - 1]).trim().toLowerCase() === 'yes',
      rideRequestId: String(r[TRIP.rideRequestId - 1] || ''),
    };
  });
}

// ---------------------------------------------------------------- mutations

function completeTrip_(clientId, p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.trips);

  var existing = findByClientId_(sheet, TRIP.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var row = firstEmptyRow_(sheet, TRIP.driver);
  ensureTripFormulas_(sheet, row);

  var riders = p.riders || [];
  // Guests are in the car but not in the sum, so headcount counts wallets.
  // A "taxi" with nobody in the back who pays — empty, or carrying only guests
  // — is just a drive, so it falls through to the driver covering their own
  // petrol rather than dividing by zero or leaving the pot to absorb it.
  var paying = payingRiders_(SpreadsheetApp.getActive(), riders);
  var isTaxi = !!p.taxi && paying.length > 0;
  var people = isTaxi ? paying.length : 1 + paying.length;
  var tripId = p.tripId || clientId;

  sheet.getRange(row, TRIP.date).setValue(p.date ? new Date(p.date) : new Date());
  sheet.getRange(row, TRIP.driver).setValue(p.driver || '');
  sheet.getRange(row, TRIP.destination).setValue(p.destination || '');
  sheet.getRange(row, TRIP.manualKm).setValue(p.manualKm == null ? '' : p.manualKm);
  sheet.getRange(row, TRIP.tolls).setValue(p.tolls || 0);
  sheet.getRange(row, TRIP.parking).setValue(p.parking || 0);
  sheet.getRange(row, TRIP.people).setValue(people);
  sheet.getRange(row, TRIP.notes).setValue(p.notes || '');
  sheet.getRange(row, TRIP.id).setValue(tripId);
  sheet.getRange(row, TRIP.riders).setValue(riders.join(', '));
  sheet.getRange(row, TRIP.tripType).setValue(p.tripType || 'Round trip');
  sheet.getRange(row, TRIP.reservationId).setValue(p.reservationId || '');
  sheet.getRange(row, TRIP.clientId).setValue(clientId);
  sheet.getRange(row, TRIP.odoStart).setValue(p.odoStart == null ? '' : p.odoStart);
  sheet.getRange(row, TRIP.odoEnd).setValue(p.odoEnd == null ? '' : p.odoEnd);
  sheet.getRange(row, TRIP.activity).setValue(p.activity || '');
  sheet.getRange(row, TRIP.taxi).setValue(isTaxi ? 'Yes' : 'No');
  sheet.getRange(row, TRIP.rideRequestId).setValue(p.rideRequestId || '');
  sheet.getRange(row, TRIP.origin).setValue(p.origin || '');
  sheet.getRange(row, TRIP.boards).setValue(p.boards ? 'Yes' : 'No');
  sheet.getRange(row, TRIP.until).setValue(p.until ? new Date(p.until) : '');

  var when = p.date ? new Date(p.date) : new Date();

  // A reservation is only closed when the trip actually falls in its window.
  // Without this check, logging a forgotten trip from yesterday would close a
  // booking for today — which is exactly what happened to Robin's Odeceixe
  // reservation.
  var closedReservation = false;
  if (p.reservationId) {
    if (tripMatchesReservation_(ss, p.reservationId, when)) {
      closeReservation_(ss, p.reservationId, 'completed', tripId);
      closedReservation = true;
    } else {
      Logger.log('Trip ' + tripId + ' left reservation ' + p.reservationId +
        ' open — the dates do not line up.');
    }
  }
  if (p.rideRequestId) closeRideRequest_(ss, p.rideRequestId, 'done', '', tripId);

  // The driver fronted the tolls and parking, so credit them — otherwise they
  // are charged a share of money they have already spent.
  if (num_(p.tolls) > 0) {
    writePayment_(ss, clientId + ':tolls', when, p.driver, 'tolls', num_(p.tolls), 'Trip ' + tripId);
  }
  if (num_(p.parking) > 0) {
    writePayment_(ss, clientId + ':parking', when, p.driver, 'parking', num_(p.parking), 'Trip ' + tripId);
  }

  SpreadsheetApp.flush();
  rebuildRideDays_(ss);
  return {
    row: row,
    tripId: tripId,
    closedReservation: closedReservation,
    distanceKm: num_(sheet.getRange(row, TRIP.distance).getValue()),
    fuelCost: num_(sheet.getRange(row, TRIP.fuel).getValue()),
    total: num_(sheet.getRange(row, TRIP.total).getValue()),
    perPerson: num_(sheet.getRange(row, TRIP.perPerson).getValue()),
  };
}

function createReservation_(clientId, p) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.reservations);

  var existing = findByClientId_(sheet, RES.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var row = firstEmptyRow_(sheet, RES.id);
  var id = p.id || clientId;
  sheet.getRange(row, RES.id, 1, RES.updated).setValues([[
    id,
    new Date().toISOString(),
    p.driver || '',
    (p.riders || []).join(', '),
    p.start ? new Date(p.start) : '',
    p.end ? new Date(p.end) : '',
    p.destination || '',
    'reserved',
    '',
    clientId,
    p.notes || '',
    // Never edited, so nothing to tell anyone about yet.
    '',
  ]]);
  return { row: row, id: id };
}

function cancelReservation_(p) {
  var ss = SpreadsheetApp.getActive();
  var found = closeReservation_(ss, p.id, 'cancelled', '');
  if (!found) throw new Error('Reservation not found: ' + p.id);
  return { id: p.id, status: 'cancelled' };
}

/**
 * Adding or removing yourself from someone else's booking.
 *
 * No cost follows from this — nobody is charged until a trip is actually
 * logged — so there's no ride-day rebuild. What it buys is that the driver
 * finds you already in the car when they come to log it.
 */
/**
 * Deliberately does not stamp RES.updated: someone hopping on isn't the driver
 * changing the plan, and pilling everyone for it would make the pill noise.
 */
function joinReservation_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.reservations);
  var row = findReservationRow_(sheet, p.id);
  if (!row) throw new Error('Reservation not found: ' + p.id);

  var riders = toggleName_(splitList_(sheet.getRange(row, RES.riders).getValue()), p.name, p.join);
  sheet.getRange(row, RES.riders).setValue(riders.join(', '));
  return { id: p.id, riders: riders };
}

function joinRide_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  var row = findRideRequest_(sheet, p.id);
  if (!row) throw new Error('Ride request not found: ' + p.id);

  var others = toggleName_(splitList_(sheet.getRange(row, RIDE_REQ.others).getValue()), p.name, p.join);
  sheet.getRange(row, RIDE_REQ.others).setValue(others.join(', '));
  return { id: p.id, others: others };
}

/** Idempotent either way: joining twice adds one name, leaving twice is fine. */
function toggleName_(names, name, join) {
  var clean = String(name || '').trim();
  if (!clean) return names;
  var without = names.filter(function (n) { return n !== clean; });
  return join ? without.concat([clean]) : without;
}

/**
 * Does this trip plausibly belong to that booking?
 *
 * A day's grace either side, because people log trips late and a booking that
 * ran until midnight is often written up the next morning. Beyond that the two
 * are unrelated and the booking should survive.
 */
var RESERVATION_GRACE_MS = 24 * 60 * 60 * 1000;

function tripMatchesReservation_(ss, reservationId, tripStart) {
  var sheet = ss.getSheetByName(SHEETS.reservations);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return false;

  var ids = sheet.getRange(FIRST_DATA_ROW, RES.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(reservationId)) continue;
    var row = FIRST_DATA_ROW + i;
    var start = sheet.getRange(row, RES.start).getValue();
    var end = sheet.getRange(row, RES.end).getValue();
    if (!(start instanceof Date) || !(end instanceof Date)) return true; // no window to judge by
    var t = tripStart.getTime();
    return t >= start.getTime() - RESERVATION_GRACE_MS &&
      t <= end.getTime() + RESERVATION_GRACE_MS;
  }
  return false;
}

/**
 * Who in this rider list actually pays.
 *
 * A guest is anyone not on the Members tab, or on it with the role "Guest".
 * They ride free: no share of the petrol, no ride-day, nothing on the Ride Days
 * tab. Their name lives in the trip's Riders cell and nowhere else, which is the
 * whole point — it records who was in the car without turning them into someone
 * the app has to keep.
 *
 * Before this, a guest picked up ride-days like an ordinary non-driver. Those
 * days widened the day-rate denominator, so everyone else's share fell to cover
 * a charge nobody would ever collect — the pot came up short by exactly the
 * guest's own bill, every time.
 */
/**
 * True when this occupant rides free — either no Members row at all (a name
 * typed into the trip form) or one whose role is "Guest".
 *
 * Takes the already-looked-up entry rather than a name, so rebuildRideDays_
 * doesn't create the very row we're deciding not to create.
 */
function isFreeRider_(entry) {
  if (!entry || !entry.member) return true;
  return String(entry.member.role).trim().toLowerCase() === 'guest';
}

function payingRiders_(ss, riders) {
  var paying = {};
  rawMembers_(ss).forEach(function (m) {
    if (String(m.role).trim().toLowerCase() !== 'guest') paying[m.name.toLowerCase()] = true;
  });
  return (riders || []).filter(function (name) {
    return paying[String(name).trim().toLowerCase()];
  });
}

/** Row number for a reservation id, or 0. Mirrors findRideRequest_. */
function findReservationRow_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;
  var ids = sheet.getRange(FIRST_DATA_ROW, RES.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return FIRST_DATA_ROW + i;
  }
  return 0;
}

function closeReservation_(ss, reservationId, status, tripId) {
  var sheet = ss.getSheetByName(SHEETS.reservations);
  var row = findReservationRow_(sheet, reservationId);
  if (!row) return false;
  sheet.getRange(row, RES.status).setValue(status);
  if (tripId) sheet.getRange(row, RES.tripId).setValue(tripId);
  return true;
}

/**
 * Change the plan on an existing booking.
 *
 * Only the five fields the driver can actually edit, plus the timestamp.
 * Driver, created, status, tripId and clientId are deliberately untouched: an
 * edit changes when and where, it doesn't hand the car to someone else or
 * bring a cancelled booking back to life.
 */
function editReservation_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.reservations);
  var row = findReservationRow_(sheet, p.id);
  if (!row) throw new Error('Reservation not found: ' + p.id);

  var status = String(sheet.getRange(row, RES.status).getValue() || 'reserved').trim();
  if (status !== 'reserved') {
    throw new Error('That booking is ' + status + ' — it can no longer be changed.');
  }

  var updated = new Date().toISOString();
  sheet.getRange(row, RES.riders).setValue((p.riders || []).join(', '));
  sheet.getRange(row, RES.start).setValue(p.start ? new Date(p.start) : '');
  sheet.getRange(row, RES.end).setValue(p.end ? new Date(p.end) : '');
  sheet.getRange(row, RES.destination).setValue(p.destination || '');
  sheet.getRange(row, RES.notes).setValue(p.notes || '');
  sheet.getRange(row, RES.updated).setValue(updated);
  return { id: p.id, row: row, updated: updated };
}

function logKarma_(clientId, p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.karma);

  var existing = findByClientId_(sheet, KARMA.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var when = p.date ? new Date(p.date) : new Date();
  var row = firstEmptyRow_(sheet, KARMA.name);
  sheet.getRange(row, KARMA.date, 1, 5).setValues([[
    when,
    p.name || '',
    p.action || '',
    p.points || 0,
    clientId,
  ]]);

  // Refuelling earns the karma point *and* credits the euros spent. The two are
  // independent: the point recognises the effort, the payment records the cash.
  var amount = num_(p.amount);
  if (amount > 0) {
    writePayment_(ss, clientId + ':spend', when, p.name, 'fuel', amount, p.action || '');
    rebuildRideDays_(ss);
  }

  return { row: row, credited: amount };
}

/**
 * Takes a karma entry back.
 *
 * A point is easy to award by accident and there was no way to undo one. The
 * awkward part is money: a refuelling entry also wrote a Payments row under
 * `clientId + ':spend'`, so removing the karma alone would leave the group
 * crediting cash for something that no longer happened. Both go, or neither.
 *
 * Returns how much was refunded so the app can say so before it happens.
 */
function deleteKarma_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.karma);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) throw new Error('Karma entry not found: ' + p.id);

  var ids = sheet.getRange(FIRST_DATA_ROW, KARMA.clientId, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(p.id)) continue;
    var row = FIRST_DATA_ROW + i;
    var name = String(sheet.getRange(row, KARMA.name).getValue()).trim();
    sheet.getRange(row, 1, 1, KARMA.clientId).clearContent();

    var removed = removePayment_(ss, p.id + ':spend');
    if (removed > 0) rebuildRideDays_(ss);
    return { id: p.id, name: name, refunded: removed };
  }
  throw new Error('Karma entry not found: ' + p.id);
}

/** Clears a Payments row by client ID. Returns the amount removed, or 0. */
function removePayment_(ss, clientId) {
  var sheet = ss.getSheetByName(SHEETS.payments);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;

  var rows = sheet.getRange(FIRST_DATA_ROW, 1, last - 2, PAY.clientId).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][PAY.clientId - 1]) !== String(clientId)) continue;
    var amount = num_(rows[i][PAY.amount - 1]);
    sheet.getRange(FIRST_DATA_ROW + i, 1, 1, PAY.clientId).clearContent();
    return amount;
  }
  return 0;
}

/**
 * A payment reduces what someone owes: cash handed over, fuel bought at the
 * pump, tolls or parking fronted on a trip.
 */
function logPayment_(clientId, p) {
  var ss = SpreadsheetApp.getActive();
  var amount = num_(p.amount);
  if (!(amount > 0)) throw new Error('A payment needs a positive amount');
  if (!String(p.name || '').trim()) throw new Error('A payment needs a name');

  var result = writePayment_(
    ss,
    clientId,
    p.date ? new Date(p.date) : new Date(),
    p.name,
    p.type || 'cash',
    amount,
    p.note || '',
  );
  rebuildRideDays_(ss);
  return result;
}

/**
 * Money changing hands between two people — almost always someone paying Robin.
 *
 * This writes *two* rows, because a transfer has two sides: the payer's debt
 * falls and the receiver is owed that much less. Recording only the payer's
 * side leaves the books out by the amount, which is how "everyone has settled
 * up but Robin is still owed €200" happens.
 *
 * Fuel, tolls and parking stay single-entry on purpose — there the counterparty
 * is the petrol station, not another member.
 */
function settleUp_(clientId, p) {
  var ss = SpreadsheetApp.getActive();
  var amount = num_(p.amount);
  var from = String(p.from || '').trim();
  var to = String(p.to || ADMIN_NAME).trim();

  if (!(amount > 0)) throw new Error('A settle-up needs a positive amount');
  if (!from || !to) throw new Error('A settle-up needs both people');
  if (from === to) throw new Error('Cannot settle up with yourself');

  var when = p.date ? new Date(p.date) : new Date();
  var note = p.note ? String(p.note) : '';

  var payer = writePayment_(ss, clientId + ':from', when, from, 'settlement', amount,
    ('Settled with ' + to + (note ? ' — ' + note : '')));
  var receiver = writePayment_(ss, clientId + ':to', when, to, 'settlement', -amount,
    ('Received from ' + from + (note ? ' — ' + note : '')));

  rebuildRideDays_(ss);
  return { from: from, to: to, amount: amount, rows: [payer.row, receiver.row] };
}

function writePayment_(ss, clientId, when, name, type, amount, note) {
  var sheet = ss.getSheetByName(SHEETS.payments);

  var existing = findByClientId_(sheet, PAY.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var row = firstEmptyRow_(sheet, PAY.name);
  sheet.getRange(row, PAY.date, 1, 6).setValues([[
    when, String(name).trim(), type, amount, note, clientId,
  ]]);
  return { row: row, amount: amount };
}

// ------------------------------------------------------------ ride requests

/**
 * Someone without the car asking to be driven somewhere. A driver picks it up,
 * and the passenger sees who. When it's completed the resulting trip is flagged
 * as a taxi run, which is what keeps the driver off the bill.
 */
function requestRide_(clientId, p) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.rideRequests);

  var existing = findByClientId_(sheet, RIDE_REQ.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var id = p.id || clientId;
  var row = firstEmptyRow_(sheet, RIDE_REQ.id);
  sheet.getRange(row, RIDE_REQ.id, 1, 12).setValues([[
    id,
    new Date().toISOString(),
    p.passenger || '',
    (p.others || []).join(', '),
    p.when ? new Date(p.when) : '',
    p.from || '',
    p.to || '',
    p.notes || '',
    'open',
    '',
    '',
    clientId,
  ]]);
  return { row: row, id: id };
}

function claimRide_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  var found = findRideRequest_(sheet, p.id);
  if (!found) throw new Error('Ride request not found: ' + p.id);

  var status = String(sheet.getRange(found, RIDE_REQ.status).getValue()).trim();
  var driver = String(sheet.getRange(found, RIDE_REQ.driver).getValue()).trim();
  // Two drivers can tap Claim at the same time, or one phone can replay an
  // offline claim after another has taken it. First one wins.
  if (status === 'claimed' && driver && driver !== p.driver) {
    return { id: p.id, driver: driver, alreadyClaimed: true };
  }
  if (status === 'done' || status === 'cancelled') {
    return { id: p.id, status: status, alreadyClaimed: true };
  }

  sheet.getRange(found, RIDE_REQ.status).setValue('claimed');
  sheet.getRange(found, RIDE_REQ.driver).setValue(p.driver || '');

  // Picking someone up is exactly the kind of thing karma is for, so it lands
  // without anyone having to remember to tap it.
  awardLiftKarma_(ss, p.id, p.driver);

  return { id: p.id, driver: p.driver, status: 'claimed' };
}

/** Karma for driving someone, keyed to the ride so it can be taken back. */
function awardLiftKarma_(ss, rideId, driver) {
  if (!driver) return;
  var action = liftKarmaAction_(ss);
  logKarma_('ride:' + rideId, {
    date: new Date(),
    name: driver,
    action: action.action,
    points: action.points,
  });
}

/** Uses whatever Robin has called it on the Karma Actions tab. */
function liftKarmaAction_(ss) {
  var actions = readKarmaActions_(ss);
  for (var i = 0; i < actions.length; i++) {
    if (/dr(o|i)ve|lift|taxi/i.test(actions[i].action)) return actions[i];
  }
  return { action: LIFT_ACTION, points: 1 };
}

/** Undoes the karma when a claimed lift is called off. */
function removeLiftKarma_(ss, rideId) {
  var sheet = ss.getSheetByName(SHEETS.karma);
  var rows = findByClientId_(sheet, KARMA.clientId);
  var row = rows['ride:' + rideId];
  if (row) sheet.getRange(row, 1, 1, KARMA.clientId).clearContent();
}

function cancelRide_(p) {
  var ss = SpreadsheetApp.getActive();
  if (!closeRideRequest_(ss, p.id, 'cancelled', '', '')) {
    throw new Error('Ride request not found: ' + p.id);
  }
  removeLiftKarma_(ss, p.id);
  rebuildRideDays_(ss);
  return { id: p.id, status: 'cancelled' };
}

/**
 * Logs a claimed lift outright, without anyone filling in a form.
 *
 * Everything needed is already on the request — who, where to, how many — and
 * the distance comes from the same Places/Surf Spots lookup the trip form uses.
 * A destination we can't price is left alone rather than logged at zero km,
 * because a wrong number is worse than an absent one.
 */
function logRide_(clientId, p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  var row = findRideRequest_(sheet, p.id);
  if (!row) throw new Error('Ride request not found: ' + p.id);

  var status = String(sheet.getRange(row, RIDE_REQ.status).getValue()).trim();
  if (status === 'done') {
    return { id: p.id, alreadyLogged: true, tripId: String(sheet.getRange(row, RIDE_REQ.tripId).getValue()) };
  }
  if (status === 'cancelled') return { id: p.id, cancelled: true };

  var driver = String(sheet.getRange(row, RIDE_REQ.driver).getValue()).trim() || p.driver;
  if (!driver) throw new Error('Nobody has claimed this lift yet');

  var passengers = [String(sheet.getRange(row, RIDE_REQ.passenger).getValue()).trim()]
    .concat(splitList_(sheet.getRange(row, RIDE_REQ.others).getValue()))
    .filter(function (n) { return n && n !== driver; });
  if (!passengers.length) throw new Error('This lift has no passengers');

  var destination = String(sheet.getRange(row, RIDE_REQ.to).getValue()).trim();
  if (!knownDistance_(ss, destination)) {
    return { id: p.id, unknownDestination: destination };
  }

  return completeTrip_(clientId, {
    date: p.date || new Date().toISOString(),
    driver: driver,
    destination: destination,
    origin: String(sheet.getRange(row, RIDE_REQ.from).getValue()).trim(),
    tripType: 'One-way',
    riders: passengers,
    taxi: true,
    rideRequestId: p.id,
    notes: String(sheet.getRange(row, RIDE_REQ.notes).getValue()).trim(),
    tolls: 0,
    parking: 0,
  });
}

/** Can the sheet price a trip to this place? */
function knownDistance_(ss, name) {
  if (!name) return false;
  var spots = readSpots_(ss);
  for (var i = 0; i < spots.length; i++) if (spots[i].name === name) return true;
  var places = readPlaces_(ss);
  for (var j = 0; j < places.length; j++) {
    if (places[j].name === name && places[j].oneWayKm > 0) return true;
  }
  return false;
}

/**
 * Logs claimed lifts nobody got round to logging.
 *
 * Two hours after the pickup time a lift is assumed to have happened, unless it
 * was cancelled. Runs off the back of ordinary requests rather than a
 * time-driven trigger: a trigger would need a new OAuth scope, which means
 * re-authorising the whole web app, and the group opens this often enough that
 * a sweep on request is timely enough.
 */
var SWEEP_EVERY_MS = 5 * 60 * 1000;
var LIFT_GRACE_MS = 2 * 60 * 60 * 1000;

function sweepDueRides_(ss) {
  var props = PropertiesService.getScriptProperties();
  var last = Number(props.getProperty('lastSweep') || 0);
  if (Date.now() - last < SWEEP_EVERY_MS) return { skipped: true };
  props.setProperty('lastSweep', String(Date.now()));

  ss = ss || SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  if (!sheet) return { logged: 0 };
  var lastRow = sheet.getLastRow();
  if (lastRow < FIRST_DATA_ROW) return { logged: 0 };

  var rows = sheet.getRange(FIRST_DATA_ROW, 1, lastRow - 2, 12).getValues();
  var logged = 0;

  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[RIDE_REQ.status - 1]).trim() !== 'claimed') continue;

    var when = r[RIDE_REQ.when - 1];
    if (!(when instanceof Date)) continue;
    if (Date.now() - when.getTime() < LIFT_GRACE_MS) continue;

    try {
      var result = logRide_('autolog:' + r[RIDE_REQ.id - 1], { id: String(r[RIDE_REQ.id - 1]) });
      if (result && !result.unknownDestination) logged++;
    } catch (err) {
      Logger.log('Auto-log skipped for ride ' + r[RIDE_REQ.id - 1] + ': ' + err);
    }
  }

  return { logged: logged };
}

/**
 * Rewrites a logged trip. Anyone can: people mistype who was in the car, and
 * the fix should be as easy as the mistake.
 *
 * Only the input columns are touched — distance, fuel and the split are
 * formulas and recalculate themselves.
 */
function editTrip_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.trips);
  var row = findTripRow_(sheet, p.tripId);
  if (!row) throw new Error('Trip not found: ' + p.tripId);

  var riders = p.riders || [];
  var paying = payingRiders_(ss, riders);
  var isTaxi = !!p.taxi && paying.length > 0;

  if (p.date) sheet.getRange(row, TRIP.date).setValue(new Date(p.date));
  if (p.driver) sheet.getRange(row, TRIP.driver).setValue(p.driver);
  sheet.getRange(row, TRIP.destination).setValue(p.destination || '');
  sheet.getRange(row, TRIP.manualKm).setValue(p.manualKm == null ? '' : p.manualKm);
  sheet.getRange(row, TRIP.tolls).setValue(p.tolls || 0);
  sheet.getRange(row, TRIP.parking).setValue(p.parking || 0);
  sheet.getRange(row, TRIP.people).setValue(isTaxi ? paying.length : 1 + paying.length);
  sheet.getRange(row, TRIP.notes).setValue(p.notes || '');
  sheet.getRange(row, TRIP.riders).setValue(riders.join(', '));
  sheet.getRange(row, TRIP.tripType).setValue(p.tripType || 'Round trip');
  sheet.getRange(row, TRIP.odoStart).setValue(p.odoStart == null ? '' : p.odoStart);
  sheet.getRange(row, TRIP.odoEnd).setValue(p.odoEnd == null ? '' : p.odoEnd);
  sheet.getRange(row, TRIP.activity).setValue(p.activity || '');
  sheet.getRange(row, TRIP.taxi).setValue(isTaxi ? 'Yes' : 'No');
  sheet.getRange(row, TRIP.origin).setValue(p.origin || '');
  sheet.getRange(row, TRIP.boards).setValue(p.boards ? 'Yes' : 'No');
  sheet.getRange(row, TRIP.until).setValue(p.until ? new Date(p.until) : '');

  SpreadsheetApp.flush();
  rebuildRideDays_(ss);

  return {
    tripId: p.tripId,
    row: row,
    distanceKm: num_(sheet.getRange(row, TRIP.distance).getValue()),
    total: num_(sheet.getRange(row, TRIP.total).getValue()),
    perPerson: num_(sheet.getRange(row, TRIP.perPerson).getValue()),
  };
}

function findTripRow_(sheet, tripId) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW || !tripId) return 0;
  var ids = sheet.getRange(FIRST_DATA_ROW, TRIP.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(tripId)) return FIRST_DATA_ROW + i;
  }
  return 0;
}

/** Removes a logged trip. Admin-only in the UI; the row goes, the charge goes. */
function deleteTrip_(p) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.trips);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) throw new Error('No trips logged');

  var ids = sheet.getRange(FIRST_DATA_ROW, TRIP.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) !== String(p.tripId)) continue;
    var row = FIRST_DATA_ROW + i;

    // Reopen the lift if this trip came from one, so it isn't silently lost.
    var rideId = String(sheet.getRange(row, TRIP.rideRequestId).getValue()).trim();
    if (rideId) closeRideRequest_(ss, rideId, 'cancelled', '', '');

    [TRIP.date, TRIP.driver, TRIP.destination, TRIP.manualKm, TRIP.tolls, TRIP.parking,
     TRIP.people, TRIP.notes, TRIP.id, TRIP.riders, TRIP.tripType, TRIP.reservationId,
     TRIP.clientId, TRIP.odoStart, TRIP.odoEnd, TRIP.activity, TRIP.taxi,
     TRIP.rideRequestId, TRIP.origin, TRIP.boards, TRIP.until].forEach(function (col) {
      sheet.getRange(row, col).clearContent();
    });

    SpreadsheetApp.flush();
    rebuildRideDays_(ss);
    return { tripId: p.tripId, row: row, deleted: true };
  }
  throw new Error('Trip not found: ' + p.tripId);
}

function closeRideRequest_(ss, id, status, driver, tripId) {
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  var row = findRideRequest_(sheet, id);
  if (!row) return false;
  sheet.getRange(row, RIDE_REQ.status).setValue(status);
  if (driver) sheet.getRange(row, RIDE_REQ.driver).setValue(driver);
  if (tripId) sheet.getRange(row, RIDE_REQ.tripId).setValue(tripId);
  return true;
}

function findRideRequest_(sheet, id) {
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;
  var ids = sheet.getRange(FIRST_DATA_ROW, RIDE_REQ.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(id)) return FIRST_DATA_ROW + i;
  }
  return 0;
}

function readRideRequests_(ss) {
  var sheet = ss.getSheetByName(SHEETS.rideRequests);
  if (!sheet) return [];
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  var cutoff = new Date(Date.now() - 2 * 24 * 3600 * 1000);

  return sheet.getRange(FIRST_DATA_ROW, 1, last - 2, 12).getValues()
    .filter(function (r) { return String(r[RIDE_REQ.id - 1]).trim() !== ''; })
    .map(function (r) {
      return {
        id: String(r[RIDE_REQ.id - 1]),
        created: iso_(r[RIDE_REQ.created - 1]),
        passenger: String(r[RIDE_REQ.passenger - 1]),
        others: splitList_(r[RIDE_REQ.others - 1]),
        when: iso_(r[RIDE_REQ.when - 1]),
        from: String(r[RIDE_REQ.from - 1] || ''),
        to: String(r[RIDE_REQ.to - 1] || ''),
        notes: String(r[RIDE_REQ.notes - 1] || ''),
        status: String(r[RIDE_REQ.status - 1] || 'open'),
        driver: String(r[RIDE_REQ.driver - 1] || ''),
        tripId: String(r[RIDE_REQ.tripId - 1] || ''),
      };
    })
    .filter(function (r) {
      // Everything still live, plus the last couple of days of history so a
      // passenger can still see who drove them.
      if (r.status === 'open' || r.status === 'claimed') return true;
      return r.created && new Date(r.created) > cutoff;
    });
}

// ---------------------------------------------------------------- ride days

/**
 * Rebuilds the Ride Days tab, which is what makes the cost model work.
 *
 * The day rate is  totalCost / (member-days + non-driver ride-days).  Widening
 * the denominator like this is what lets a non-driver pay the same per day as a
 * member while still reducing what members owe — the two requirements are
 * circular if you treat non-driver money as a credit applied afterwards.
 *
 * Counting has to happen here rather than in a formula: a person is in a trip
 * if they are the driver or appear in the comma-separated Riders cell, and
 * SEARCH("John", "Johnny, Ana") would happily match the wrong person.
 */
function rebuildRideDays_(ss) {
  ss = ss || SpreadsheetApp.getActive();

  var members = rawMembers_(ss);
  var byName = {};
  var order = [];

  function person(name) {
    var key = name.trim();
    if (!key) return null;
    if (!byName[key]) {
      // days maps a calendar day to the trips that person took on it, because
      // half-day pricing depends on how many and what kind, not just whether.
      byName[key] = { name: key, days: {}, tripCosts: 0, member: null };
      order.push(key);
    }
    return byName[key];
  }

  members.forEach(function (m) {
    var p = person(m.name);
    if (p) p.member = m;
  });

  // The paid rental period. Days outside it — the group had the car on the 6th
  // but nobody is paying the owner for it — cost fuel but no day rate.
  var settingsSheet = ss.getSheetByName(SHEETS.settings);
  var periodStart = dateKey_(settingsSheet.getRange('B4').getValue());
  var periodEnd = dateKey_(settingsSheet.getRange('B5').getValue());

  // Walk the trips, attributing each one to everyone who was in the car.
  var trips = ss.getSheetByName(SHEETS.trips);
  var lastTrip = trips.getLastRow();
  if (lastTrip >= FIRST_DATA_ROW) {
    var rows = trips.getRange(FIRST_DATA_ROW, 1, lastTrip - 2, TRIP.until).getValues();
    rows.forEach(function (r) {
      var driver = String(r[TRIP.driver - 1]).trim();
      if (!driver) return;

      var riders = splitList_(r[TRIP.riders - 1]);
      var isTaxi = String(r[TRIP.taxi - 1]).trim().toLowerCase() === 'yes' && riders.length > 0;

      // On a taxi run the driver was doing someone a favour: no fuel share and
      // no day charged, even when the driver is themselves a rider.
      var occupants = isTaxi ? riders : [driver].concat(riders);

      var dayKey = dateKey_(r[TRIP.date - 1]);
      var perPerson = num_(r[TRIP.perPerson - 1]);
      var oneWay = String(r[TRIP.tripType - 1]).trim().toLowerCase() === 'one-way';

      var chargeable = dayKey &&
        (!periodStart || dayKey >= periodStart) &&
        (!periodEnd || dayKey <= periodEnd);

      occupants.forEach(function (name) {
        // Guests ride free: no days, no costs, and no row of their own below.
        // person() would otherwise mint an entry for any name at all, which is
        // how a free-text guest used to end up billed on the Ride Days tab.
        if (isFreeRider_(byName[String(name).trim()])) return;
        var p = person(name);
        if (!p) return;
        // Fuel is owed whenever it was burnt; the day rate only inside the
        // period the group is actually paying for.
        if (chargeable) {
          if (!p.days[dayKey]) p.days[dayKey] = [];
          p.days[dayKey].push({ taxi: isTaxi, oneWay: oneWay });
        }
        p.tripCosts += perPerson;
      });
    });
  }

  // Anyone not paying into the rental is charged for the days they rode.
  var memberDays = 0;
  var riderDays = 0;
  order.forEach(function (key) {
    var p = byName[key];
    p.rideDays = 0;
    Object.keys(p.days).forEach(function (day) {
      p.rideDays += dayCharge_(p.days[day]);
    });
    p.included = !!(p.member && p.member.included);
    if (p.included) memberDays += p.member.daysActive;
    else riderDays += p.rideDays;
  });

  var settings = ss.getSheetByName(SHEETS.settings);
  var totalCost = num_(settings.getRange('B15').getValue());
  var denominator = memberDays + riderDays;
  var dayRate = denominator > 0 ? totalCost / denominator : 0;

  var out = order.map(function (key) {
    var p = byName[key];
    var chargedDays = p.included ? p.member.daysActive : p.rideDays;
    return [
      p.name,
      p.member ? (p.member.role || (p.included ? 'Driver' : 'Non-driver')) : 'Guest',
      p.rideDays,
      chargedDays * dayRate,
      p.tripCosts,
    ];
  });

  var sheet = ss.getSheetByName(SHEETS.rideDays);
  var previousRows = Math.max(sheet.getLastRow() - 2, 0);
  if (previousRows > 0) sheet.getRange(FIRST_DATA_ROW, 1, previousRows, 5).clearContent();
  if (out.length) sheet.getRange(FIRST_DATA_ROW, 1, out.length, 5).setValues(out);

  // B12 is a plain value, not a formula — the count comes from this walk.
  settings.getRange('B12').setValue(riderDays);
  SpreadsheetApp.flush();

  return { dayRate: dayRate, memberDays: memberDays, riderDays: riderDays, people: out.length };
}

/**
 * What one calendar day in the car costs a rider.
 *
 * Half a day is reserved for the short drop-offs: a single taxi ride, one-way.
 * Riding along on an ordinary shared trip is a full day however brief it was —
 * the car was out on a group outing rather than doing one person a favour — and
 * a second ride on the same day makes it a full day regardless.
 */
function dayCharge_(tripsThatDay) {
  if (!tripsThatDay || !tripsThatDay.length) return 0;
  if (tripsThatDay.length === 1 && tripsThatDay[0].taxi && tripsThatDay[0].oneWay) return 0.5;
  return 1;
}

/** Local calendar day, so two trips on one date count once. */
function dateKey_(v) {
  if (v instanceof Date) {
    return Utilities.formatDate(v, SpreadsheetApp.getActive().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  }
  var s = String(v || '').trim();
  return s ? s.slice(0, 10) : '';
}

// ---------------------------------------------------------------- reset

/**
 * Testing only: empties Trip Log, Karma Log and Reservations.
 *
 * Settings, Members, Surf Spots and Karma Actions are never touched — those are
 * configuration, not logged data. Trip Log's calculated columns (E, F, I, K)
 * keep their formulas; only the input columns are cleared, so the sheet stays
 * ready for the next trip.
 *
 * Everything is copied to a timestamped backup tab first. The token that
 * authorises this call is readable in the published bundle, so an unrecoverable
 * wipe would be a bad thing to expose — a recoverable one is merely annoying.
 */
function resetTestData_(p) {
  if (p.confirm !== 'RESET') throw new Error('Reset requires confirm:"RESET"');

  var ss = SpreadsheetApp.getActive();
  var backupName = backupLogs_(ss);

  var trips = ss.getSheetByName(SHEETS.trips);
  var cleared = { trips: 0, karma: 0, reservations: 0 };

  var lastTrip = trips.getLastRow();
  if (lastTrip >= FIRST_DATA_ROW) {
    var rows = lastTrip - FIRST_DATA_ROW + 1;
    [TRIP.date, TRIP.driver, TRIP.destination, TRIP.manualKm, TRIP.tolls, TRIP.parking,
     TRIP.people, TRIP.notes, TRIP.id, TRIP.riders, TRIP.tripType, TRIP.reservationId,
     TRIP.clientId, TRIP.odoStart, TRIP.odoEnd, TRIP.activity, TRIP.taxi,
     TRIP.rideRequestId].forEach(function (col) {
      trips.getRange(FIRST_DATA_ROW, col, rows, 1).clearContent();
    });
    cleared.trips = rows;
  }

  cleared.karma = clearRows_(ss.getSheetByName(SHEETS.karma), 5);
  cleared.reservations = clearRows_(ss.getSheetByName(SHEETS.reservations), 11);
  cleared.rideRequests = clearRows_(ss.getSheetByName(SHEETS.rideRequests), 12);
  cleared.payments = clearPaymentsKeepingPrepayments_(ss);

  SpreadsheetApp.flush();
  rebuildRideDays_(ss);
  return { cleared: cleared, backup: backupName };
}

/**
 * Wipes test payments but keeps prepayment rows — Robin's €465 is a real fact
 * about the world, not test data, and re-entering it after every reset would be
 * a trap worth avoiding.
 */
function clearPaymentsKeepingPrepayments_(ss) {
  var sheet = ss.getSheetByName(SHEETS.payments);
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;

  var rows = sheet.getRange(FIRST_DATA_ROW, 1, last - 2, 6).getValues();
  var keep = rows.filter(function (r) {
    return String(r[PAY.type - 1]).trim().toLowerCase() === 'prepayment' &&
      String(r[PAY.name - 1]).trim() !== '';
  });

  sheet.getRange(FIRST_DATA_ROW, 1, rows.length, 6).clearContent();
  if (keep.length) sheet.getRange(FIRST_DATA_ROW, 1, keep.length, 6).setValues(keep);
  return rows.length - keep.length;
}

function clearRows_(sheet, width) {
  if (!sheet) return 0;
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return 0;
  var rows = last - FIRST_DATA_ROW + 1;
  sheet.getRange(FIRST_DATA_ROW, 1, rows, width).clearContent();
  return rows;
}

/** Snapshots the three log tabs, keeping the five most recent backups. */
function backupLogs_(ss) {
  var stamp = Utilities.formatDate(new Date(), ss.getSpreadsheetTimeZone(), 'yyyy-MM-dd HH-mm-ss');
  var name = 'Backup ' + stamp;
  var backup = ss.insertSheet(name);
  var row = 1;

  [SHEETS.trips, SHEETS.karma, SHEETS.reservations].forEach(function (tabName) {
    var sheet = ss.getSheetByName(tabName);
    if (!sheet || sheet.getLastRow() < 1) return;
    backup.getRange(row, 1).setValue(tabName).setFontWeight('bold');
    row++;
    var values = sheet.getDataRange().getValues();
    backup.getRange(row, 1, values.length, values[0].length).setValues(values);
    row += values.length + 2;
  });

  backup.hideSheet();
  pruneBackups_(ss, 5);
  return name;
}

function pruneBackups_(ss, keep) {
  var backups = ss.getSheets().filter(function (s) {
    return s.getName().indexOf('Backup ') === 0;
  });
  backups.sort(function (a, b) { return a.getName() < b.getName() ? -1 : 1; });
  while (backups.length > keep) ss.deleteSheet(backups.shift());
}

// ---------------------------------------------------------------- helpers

function checkToken_(token) {
  var expected = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  if (!expected) throw new Error('APP_TOKEN not set — run setupSheet() first');
  return token === expected;
}

/** Map of clientId -> row, for the idempotency check. */
function findByClientId_(sheet, col) {
  var last = sheet.getLastRow();
  var map = {};
  if (last < FIRST_DATA_ROW) return map;
  var values = sheet.getRange(FIRST_DATA_ROW, col, last - 2, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    var v = String(values[i][0]).trim();
    if (v) map[v] = FIRST_DATA_ROW + i;
  }
  return map;
}

/** First row whose key column is empty — appends past the end when full. */
function firstEmptyRow_(sheet, keyCol) {
  var last = sheet.getLastRow();
  if (last >= FIRST_DATA_ROW) {
    var values = sheet.getRange(FIRST_DATA_ROW, keyCol, last - 2, 1).getValues();
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === '') return FIRST_DATA_ROW + i;
    }
  }
  return Math.max(last + 1, FIRST_DATA_ROW);
}

/** Copies the calculated columns down when a trip lands below the pre-filled range. */
function ensureTripFormulas_(sheet, row) {
  if (row <= FIRST_DATA_ROW) return;
  var template = sheet.getRange(FIRST_DATA_ROW, 1, 1, TRIP.notes);
  [TRIP.distance, TRIP.fuel, TRIP.total, TRIP.perPerson].forEach(function (col) {
    var target = sheet.getRange(row, col);
    if (String(target.getFormula()).trim() === '') {
      template.getCell(1, col).copyTo(target, SpreadsheetApp.CopyPasteType.PASTE_FORMULA, false);
    }
  });
}

function splitList_(v) {
  return String(v || '')
    .split(',')
    .map(function (s) { return s.trim(); })
    .filter(function (s) { return s !== ''; });
}

function num_(v) {
  var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

function iso_(v) {
  if (v instanceof Date) return v.toISOString();
  return v ? String(v) : '';
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
