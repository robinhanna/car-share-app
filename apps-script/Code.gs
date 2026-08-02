/**
 * Car Share API — Quinta Agave, August 2026.
 *
 * Bound to the "Car Share — August 2026" spreadsheet. Deployed as a Web App
 * (Execute as: Me / Who has access: Anyone) so the PWA can read and write
 * without any credentials of its own.
 *
 * Run setupSheet() once before the first deployment — see setup.gs.
 */

var SHEETS = {
  settings: 'Settings',
  spots: 'Surf Spots',
  members: 'Members',
  trips: 'Trip Log',
  karma: 'Karma Log',
  reservations: 'Reservations',
  karmaActions: 'Karma Actions',
};

// Trip Log columns (1-indexed), A-L are the original spreadsheet, M-S are new.
var TRIP = {
  date: 1, driver: 2, destination: 3, manualKm: 4, distance: 5, fuel: 6,
  tolls: 7, parking: 8, total: 9, people: 10, perPerson: 11, notes: 12,
  id: 13, riders: 14, tripType: 15, reservationId: 16, clientId: 17,
  odoStart: 18, odoEnd: 19,
};

var RES = {
  id: 1, created: 2, driver: 3, riders: 4, start: 5, end: 6,
  destination: 7, status: 8, tripId: 9, clientId: 10, notes: 11,
};

var KARMA = { date: 1, name: 2, action: 3, points: 4, clientId: 5 };

var FIRST_DATA_ROW = 3;

// ---------------------------------------------------------------- endpoints

function doGet(e) {
  var action = (e && e.parameter && e.parameter.action) || 'bootstrap';
  try {
    if (action === 'bootstrap') return json_({ ok: true, data: bootstrap_() });
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
    case 'cancelReservation': return cancelReservation_(op.payload || {});
    case 'logKarma': return logKarma_(op.clientId, op.payload || {});
    default: throw new Error('Unknown op: ' + op.op);
  }
}

// ---------------------------------------------------------------- bootstrap

function bootstrap_() {
  var ss = SpreadsheetApp.getActive();
  return {
    version: new Date().toISOString(),
    settings: readSettings_(ss),
    members: readMembers_(ss),
    spots: readSpots_(ss),
    karmaActions: readKarmaActions_(ss),
    reservations: readReservations_(ss),
    recentTrips: readRecentTrips_(ss, 30),
  };
}

function readSettings_(ss) {
  var s = ss.getSheetByName(SHEETS.settings);
  return {
    totalCost: num_(s.getRange('B3').getValue()),
    monthStart: iso_(s.getRange('B4').getValue()),
    monthEnd: iso_(s.getRange('B5').getValue()),
    totalMemberDays: num_(s.getRange('B6').getValue()),
    dailyRate: num_(s.getRange('B7').getValue()),
    fuelPrice: num_(s.getRange('B9').getValue()),
    consumption: num_(s.getRange('B10').getValue()),
    costPerKm: num_(s.getRange('B11').getValue()),
  };
}

function readMembers_(ss) {
  var s = ss.getSheetByName(SHEETS.members);
  var rows = s.getRange(FIRST_DATA_ROW, 1, 10, 9).getValues();
  return rows
    .filter(function (r) { return String(r[0]).trim() !== ''; })
    .map(function (r) {
      return {
        name: String(r[0]).trim(),
        included: String(r[1]).trim().toLowerCase() === 'yes',
        joinDate: iso_(r[2]),
        leaveDate: iso_(r[3]),
        daysActive: num_(r[4]),
        share: num_(r[5]),
        paid: num_(r[6]),
        balance: num_(r[7]),
        karma: num_(r[8]),
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
  return s.getRange(FIRST_DATA_ROW, 1, last - 2, 11).getValues()
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
      };
    })
    .filter(function (r) {
      // Everything still open, plus anything that ended in the last day so the
      // home screen can show "just finished".
      return r.status === 'reserved' && (!r.end || new Date(r.end) > cutoff);
    });
}

function readRecentTrips_(ss, limit) {
  var s = ss.getSheetByName(SHEETS.trips);
  var last = s.getLastRow();
  if (last < FIRST_DATA_ROW) return [];
  var rows = s.getRange(FIRST_DATA_ROW, 1, last - 2, TRIP.odoEnd).getValues()
    .filter(function (r) { return String(r[TRIP.driver - 1]).trim() !== ''; });
  return rows.slice(-limit).map(function (r) {
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
  var people = 1 + riders.length;
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

  if (p.reservationId) closeReservation_(ss, p.reservationId, 'completed', tripId);

  SpreadsheetApp.flush();
  return {
    row: row,
    tripId: tripId,
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
  sheet.getRange(row, RES.id, 1, 11).setValues([[
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
  ]]);
  return { row: row, id: id };
}

function cancelReservation_(p) {
  var ss = SpreadsheetApp.getActive();
  var found = closeReservation_(ss, p.id, 'cancelled', '');
  if (!found) throw new Error('Reservation not found: ' + p.id);
  return { id: p.id, status: 'cancelled' };
}

function closeReservation_(ss, reservationId, status, tripId) {
  var sheet = ss.getSheetByName(SHEETS.reservations);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return false;
  var ids = sheet.getRange(FIRST_DATA_ROW, RES.id, last - 2, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(reservationId)) {
      var row = FIRST_DATA_ROW + i;
      sheet.getRange(row, RES.status).setValue(status);
      if (tripId) sheet.getRange(row, RES.tripId).setValue(tripId);
      return true;
    }
  }
  return false;
}

function logKarma_(clientId, p) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.karma);

  var existing = findByClientId_(sheet, KARMA.clientId);
  if (existing[clientId]) return { row: existing[clientId], duplicate: true };

  var row = firstEmptyRow_(sheet, KARMA.name);
  sheet.getRange(row, KARMA.date, 1, 5).setValues([[
    p.date ? new Date(p.date) : new Date(),
    p.name || '',
    p.action || '',
    p.points || 0,
    clientId,
  ]]);
  return { row: row };
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
