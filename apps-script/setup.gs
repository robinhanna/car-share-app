/**
 * One-off migration. Run this once, from the Apps Script editor, after opening
 * car_rental_cost_split.xlsx as a Google Sheet.
 *
 * It is safe to run more than once — every step checks before it writes.
 *
 * What it does:
 *   1. Adds the Reservations tab
 *   2. Adds the Karma Actions tab (seeded) and a Client ID column on Karma Log
 *   3. Adds Trip Log columns M-S and rewrites the Distance formula so odometer
 *      readings and the one-way / round-trip toggle are honoured
 *   4. Generates the APP_TOKEN and logs it for you to copy into GitHub
 */
function setupSheet() {
  var ss = SpreadsheetApp.getActive();

  setupReservations_(ss);
  setupKarmaActions_(ss);
  setupKarmaLog_(ss);
  setupTripLog_(ss);
  var token = ensureToken_();

  SpreadsheetApp.flush();
  Logger.log('Setup complete.');
  Logger.log('APP_TOKEN = ' + token);
  Logger.log('Copy that value into the GitHub repository secret named APP_TOKEN.');
}

function setupReservations_(ss) {
  var sheet = ss.getSheetByName(SHEETS.reservations);
  if (!sheet) sheet = ss.insertSheet(SHEETS.reservations);

  sheet.getRange('A1').setValue('Reservations — who has the car, and when');
  sheet.getRange('A1').setFontWeight('bold');
  sheet.getRange(2, 1, 1, 11).setValues([[
    'ID', 'Created', 'Driver', 'Riders', 'Start', 'End',
    'Destination', 'Status', 'Trip ID', 'Client ID', 'Notes',
  ]]);
  sheet.getRange(2, 1, 1, 11).setFontWeight('bold');
  sheet.setFrozenRows(2);

  var status = SpreadsheetApp.newDataValidation()
    .requireValueInList(['reserved', 'completed', 'cancelled'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, RES.status, 500, 1).setDataValidation(status);
  sheet.getRange(FIRST_DATA_ROW, RES.start, 500, 2).setNumberFormat('yyyy-mm-dd hh:mm');
}

function setupKarmaActions_(ss) {
  var existing = ss.getSheetByName(SHEETS.karmaActions);
  var sheet = existing || ss.insertSheet(SHEETS.karmaActions);

  sheet.getRange('A1').setValue('Karma Actions — the buttons shown in the app');
  sheet.getRange('A1').setFontWeight('bold');
  sheet.getRange(2, 1, 1, 3).setValues([['Action', 'Points', 'Active?']]);
  sheet.getRange(2, 1, 1, 3).setFontWeight('bold');
  sheet.setFrozenRows(2);

  // Seed only on first creation, so Robin's own edits are never overwritten.
  if (!existing) {
    sheet.getRange(FIRST_DATA_ROW, 1, 4, 3).setValues([
      ['Cleaned the car', 1, 'Yes'],
      ['Refuelled', 2, 'Yes'],
      ['Drove others around', 1, 'Yes'],
      ['Sorted the boards / gear', 1, 'Yes'],
    ]);
  }

  var yesNo = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Yes', 'No'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, 3, 200, 1).setDataValidation(yesNo);
}

function setupKarmaLog_(ss) {
  var sheet = ss.getSheetByName(SHEETS.karma);
  if (String(sheet.getRange(2, KARMA.clientId).getValue()).trim() === '') {
    sheet.getRange(2, KARMA.clientId).setValue('Client ID').setFontWeight('bold');
  }
}

function setupTripLog_(ss) {
  var sheet = ss.getSheetByName(SHEETS.trips);

  var headers = [
    [TRIP.id, 'Trip ID'],
    [TRIP.riders, 'Riders'],
    [TRIP.tripType, 'Trip Type'],
    [TRIP.reservationId, 'Reservation ID'],
    [TRIP.clientId, 'Client ID'],
    [TRIP.odoStart, 'Odo Start (km)'],
    [TRIP.odoEnd, 'Odo End (km)'],
  ];
  headers.forEach(function (h) {
    var cell = sheet.getRange(2, h[0]);
    if (String(cell.getValue()).trim() === '') cell.setValue(h[1]).setFontWeight('bold');
  });

  var lastRow = Math.max(sheet.getLastRow(), 24);
  var rows = lastRow - FIRST_DATA_ROW + 1;

  var tripType = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Round trip', 'One-way'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, TRIP.tripType, rows, 1).setDataValidation(tripType);

  // Default the trip type first, so the distance formula has something to read
  // when it recalculates.
  for (var i = FIRST_DATA_ROW; i <= lastRow; i++) {
    var typeCell = sheet.getRange(i, TRIP.tripType);
    var hasDest = String(sheet.getRange(i, TRIP.destination).getValue()).trim() !== '';
    if (hasDest && String(typeCell.getValue()).trim() === '') typeCell.setValue('Round trip');
  }

  applyDistanceFormulas_(sheet, lastRow);
}

/**
 * Writes the Distance formula, then checks it actually produced a number.
 *
 * On a spreadsheet whose locale uses the comma as a decimal separator (German,
 * Portuguese…), a formula written with comma argument separators can fail to
 * parse. setFormulas() is documented as US-style, but it does not always behave
 * that way, so rather than trust it we verify against a row we know the answer
 * for and fall back to the localised semicolon form.
 */
function applyDistanceFormulas_(sheet, lastRow) {
  var probe = findProbeRow_(sheet, lastRow);

  if (writeDistanceFormulas_(sheet, lastRow, ',') && probeLooksRight_(sheet, probe)) {
    Logger.log('Distance formulas applied (comma separators).');
    return;
  }

  Logger.log('Comma separators did not evaluate — retrying with semicolons.');
  writeDistanceFormulas_(sheet, lastRow, ';');
  if (probeLooksRight_(sheet, probe)) {
    Logger.log('Distance formulas applied (semicolon separators).');
    return;
  }

  Logger.log(
    'WARNING: Distance still not calculating. Row ' + probe + ' shows "' +
      sheet.getRange(probe, TRIP.distance).getValue() + '" — send this line to Claude.',
  );
}

function writeDistanceFormulas_(sheet, lastRow, sep) {
  var formulas = [];
  for (var r = FIRST_DATA_ROW; r <= lastRow; r++) {
    formulas.push([
      '=IF(AND($R' + r + '=""' + sep + '$S' + r + '="")' + sep +
        'IF($C' + r + '=""' + sep + '""' + sep +
          "IFERROR(INDEX('Surf Spots'!$C$3:$C$55" + sep + "MATCH($C" + r +
            sep + "'Surf Spots'!$B$3:$B$55" + sep + '0))' +
          '*IF($O' + r + '="One-way"' + sep + '1' + sep + '2)' + sep +
          'IF($D' + r + '=""' + sep + '""' + sep + '$D' + r + ')))' + sep +
        '$S' + r + '-$R' + r + ')',
    ]);
  }
  try {
    sheet.getRange(FIRST_DATA_ROW, TRIP.distance, formulas.length, 1).setFormulas(formulas);
    SpreadsheetApp.flush();
    return true;
  } catch (err) {
    Logger.log('setFormulas failed with "' + sep + '": ' + err);
    return false;
  }
}

/** First row with a destination that matches a known spot — its distance must be > 0. */
function findProbeRow_(sheet, lastRow) {
  for (var r = FIRST_DATA_ROW; r <= lastRow; r++) {
    if (String(sheet.getRange(r, TRIP.destination).getValue()).trim() !== '') return r;
  }
  return 0;
}

function probeLooksRight_(sheet, probe) {
  if (!probe) return true; // nothing to check against — no logged trips yet
  var v = sheet.getRange(probe, TRIP.distance).getValue();
  return typeof v === 'number' && v > 0;
}

/**
 * Prints what the Trip Log is actually doing. Run this if distances read zero.
 */
function diagnoseTripLog() {
  var sheet = SpreadsheetApp.getActive().getSheetByName(SHEETS.trips);
  var spots = SpreadsheetApp.getActive().getSheetByName(SHEETS.spots);
  var row = findProbeRow_(sheet, Math.max(sheet.getLastRow(), 24));

  Logger.log('Spreadsheet locale: ' + SpreadsheetApp.getActive().getSpreadsheetLocale());
  Logger.log('Probe row: ' + row);
  Logger.log('C (destination): "' + sheet.getRange(row, TRIP.destination).getValue() + '"');
  Logger.log('O (trip type):   "' + sheet.getRange(row, TRIP.tripType).getValue() + '"');
  Logger.log('E formula:       ' + sheet.getRange(row, TRIP.distance).getFormula());
  Logger.log('E value:         "' + sheet.getRange(row, TRIP.distance).getValue() + '"');
  Logger.log('F value:         "' + sheet.getRange(row, TRIP.fuel).getValue() + '"');
  Logger.log('Surf Spots B3:   "' + spots.getRange('B3').getValue() + '"');
  Logger.log('Surf Spots C3:   "' + spots.getRange('C3').getValue() + '"');
  Logger.log('Sheet names:     ' + SpreadsheetApp.getActive().getSheets().map(function (s) {
    return s.getName();
  }).join(' | '));
}

function ensureToken_() {
  var props = PropertiesService.getScriptProperties();
  var token = props.getProperty('APP_TOKEN');
  if (!token) {
    token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().slice(0, 8);
    props.setProperty('APP_TOKEN', token);
  }
  return token;
}

/** Prints the token again if you lose it. */
function showToken() {
  Logger.log('APP_TOKEN = ' + ensureToken_());
}
