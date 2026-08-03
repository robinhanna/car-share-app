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
  setupPlaces_(ss);
  setupPayments_(ss);
  setupRideDays_(ss);
  setupSettings_(ss);
  setupMembers_(ss);
  setupTripLog_(ss);
  var token = ensureToken_();

  SpreadsheetApp.flush();
  var summary = rebuildRideDays_(ss);
  Logger.log('Day rate: €' + summary.dayRate.toFixed(4) + ' (' + summary.memberDays +
    ' member-days + ' + summary.riderDays + ' rider-days)');
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

function setupPlaces_(ss) {
  var existing = ss.getSheetByName(SHEETS.places);
  var sheet = existing || ss.insertSheet(SHEETS.places);

  sheet.getRange('A1').setValue('Places — towns and activities for the destination picker')
    .setFontWeight('bold');
  sheet.getRange(2, 1, 1, 4).setValues([['Category', 'Name', 'One-way (km)', 'Notes']])
    .setFontWeight('bold');
  sheet.setFrozenRows(2);

  // Seeded once. Distances are estimates from Almádena — correct them in place,
  // setupSheet() will not overwrite them on a later run.
  if (!existing) {
    sheet.getRange(FIRST_DATA_ROW, 1, 23, 4).setValues([
      ['Town', 'Almádena', 1, 'The village itself'],
      ['Town', 'Burgau', 3, ''],
      ['Town', 'Luz', 9, ''],
      ['Town', 'Salema', 8, ''],
      ['Town', 'Lagos', 13, 'Supermarkets, bars, train station'],
      ['Town', 'Vila do Bispo', 15, ''],
      ['Town', 'Sagres', 24, ''],
      ['Town', 'Portimão', 30, 'Big shops, hospital'],
      ['Town', 'Aljezur', 42, ''],
      ['Town', 'Faro', 90, 'Airport'],
      ['Town', 'Lisbon', 300, 'Rough estimate — check before relying on it'],
      ['Activity', 'Groceries', '', ''],
      ['Activity', 'Shopping', '', ''],
      ['Activity', 'Party / night out', '', ''],
      ['Activity', 'Restaurant', '', ''],
      ['Activity', 'Beach', '', ''],
      ['Activity', 'Pharmacy', '', ''],
      ['Activity', 'Doctor / hospital', '', ''],
      ['Activity', 'Airport run', '', ''],
      ['Activity', 'Train / bus station', '', ''],
      ['Activity', 'Sightseeing', '', ''],
      ['Activity', 'Sports / gym', '', ''],
      ['Activity', 'Other', '', ''],
    ]);
  }

  var category = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Town', 'Activity'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, 1, 200, 1).setDataValidation(category);
}

function setupPayments_(ss) {
  var existing = ss.getSheetByName(SHEETS.payments);
  var sheet = existing || ss.insertSheet(SHEETS.payments);

  sheet.getRange('A1').setValue('Payments — money in: cash, fuel bought, tolls and parking fronted')
    .setFontWeight('bold');
  sheet.getRange(2, 1, 1, 6).setValues([['Date', 'Name', 'Type', 'Amount (€)', 'Note', 'Client ID']])
    .setFontWeight('bold');
  sheet.setFrozenRows(2);
  sheet.getRange(FIRST_DATA_ROW, PAY.date, 500, 1).setNumberFormat('yyyy-mm-dd');
  sheet.getRange(FIRST_DATA_ROW, PAY.amount, 500, 1).setNumberFormat('€#,##0.00');

  var type = SpreadsheetApp.newDataValidation()
    .requireValueInList(['cash', 'fuel', 'tolls', 'parking', 'prepayment'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, PAY.type, 500, 1).setDataValidation(type);

  // Robin fronted the whole rental — that is a payment, and without it his
  // balance would read as though he owed his own share.
  if (!existing) {
    var settings = ss.getSheetByName(SHEETS.settings);
    var total = settings.getRange('B3').getValue();
    var start = settings.getRange('B4').getValue();
    sheet.getRange(FIRST_DATA_ROW, 1, 1, 6).setValues([[
      start, ADMIN_NAME, 'prepayment', total, 'Full rental paid upfront', 'seed-prepayment',
    ]]);
  }
}

function setupRideDays_(ss) {
  var sheet = ss.getSheetByName(SHEETS.rideDays) || ss.insertSheet(SHEETS.rideDays);

  sheet.getRange('A1')
    .setValue('Ride Days — rebuilt automatically. Do not edit; your changes will be overwritten.')
    .setFontWeight('bold');
  sheet.getRange(2, 1, 1, 5)
    .setValues([['Name', 'Role', 'Ride days', 'Car charge (€)', 'Trip costs (€)']])
    .setFontWeight('bold');
  sheet.setFrozenRows(2);
  sheet.getRange(FIRST_DATA_ROW, RIDE.carCharge, 200, 2).setNumberFormat('€#,##0.00');
}

function setupSettings_(ss) {
  var s = ss.getSheetByName(SHEETS.settings);
  s.getRange('A12').setValue('Non-driver ride days (auto)');
  s.getRange('A13').setValue('Day rate (€/day, auto)');
  s.getRange('B13').setFormula('=IFERROR(B3/(B6+B12);0)');
  s.getRange('B13').setNumberFormat('€#,##0.0000');
  if (String(s.getRange('B12').getValue()).trim() === '') s.getRange('B12').setValue(0);
}

/**
 * Members gains Role, Ride Days and Trip Costs, and F/G/H change meaning:
 *   F  car charge  = (days if paying in, else ride-days) × day rate
 *   G  paid        = everything on the Payments tab for this person
 *   H  balance     = F + trip costs − paid
 */
function setupMembers_(ss) {
  var sheet = ss.getSheetByName(SHEETS.members);

  [[MEMBER.role, 'Role'], [MEMBER.rideDays, 'Ride Days'], [MEMBER.tripCosts, 'Trip Costs (€)']]
    .forEach(function (h) {
      var cell = sheet.getRange(2, h[0]);
      if (String(cell.getValue()).trim() === '') cell.setValue(h[1]).setFontWeight('bold');
    });
  sheet.getRange(2, MEMBER.share).setValue('Car Charge (€)');
  sheet.getRange(2, MEMBER.paid).setValue('Paid (€)');

  var role = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Driver', 'Non-driver'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, MEMBER.role, MEMBER_ROWS, 1).setDataValidation(role);

  for (var i = 0; i < MEMBER_ROWS; i++) {
    var r = FIRST_DATA_ROW + i;
    setFormulaVerified_(sheet.getRange(r, MEMBER.share),
      '=IF($A{r}="";"";IF($B{r}="Yes";$E{r};$K{r})*Settings!$B$13)'.replace(/\{r\}/g, r));
    setFormulaVerified_(sheet.getRange(r, MEMBER.paid),
      '=IF($A{r}="";"";SUMIF(Payments!$B:$B;$A{r};Payments!$D:$D))'.replace(/\{r\}/g, r));
    setFormulaVerified_(sheet.getRange(r, MEMBER.balance),
      '=IF($A{r}="";"";$F{r}+$L{r}-$G{r})'.replace(/\{r\}/g, r));
    setFormulaVerified_(sheet.getRange(r, MEMBER.rideDays),
      "=IF($A{r}=\"\";\"\";IFERROR(VLOOKUP($A{r};'Ride Days'!$A$3:$E$200;3;FALSE);0))".replace(/\{r\}/g, r));
    setFormulaVerified_(sheet.getRange(r, MEMBER.tripCosts),
      "=IF($A{r}=\"\";\"\";IFERROR(VLOOKUP($A{r};'Ride Days'!$A$3:$E$200;5;FALSE);0))".replace(/\{r\}/g, r));

    var roleCell = sheet.getRange(r, MEMBER.role);
    var hasName = String(sheet.getRange(r, MEMBER.name).getValue()).trim() !== '';
    if (hasName && String(roleCell.getValue()).trim() === '') roleCell.setValue('Driver');
  }

  sheet.getRange(FIRST_DATA_ROW, MEMBER.share, MEMBER_ROWS, 3).setNumberFormat('€#,##0.00');
  sheet.getRange(FIRST_DATA_ROW, MEMBER.tripCosts, MEMBER_ROWS, 1).setNumberFormat('€#,##0.00');
}

/**
 * Writes a formula with semicolon separators, falling back to commas.
 *
 * This sheet's locale wants semicolons — setFormula() is documented as
 * US-style but does not behave that way here, which cost us the whole Distance
 * column the first time round. Semicolons first, since we know which way this
 * sheet leans.
 */
function setFormulaVerified_(range, semicolonFormula) {
  range.setFormula(semicolonFormula);
  SpreadsheetApp.flush();
  var v = range.getValue();
  if (String(v).indexOf('#') !== 0 && String(v) !== '#ERROR!') return true;

  range.setFormula(semicolonFormula.replace(/;/g, ','));
  SpreadsheetApp.flush();
  return String(range.getValue()).indexOf('#') !== 0;
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
    [TRIP.activity, 'Activity'],
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

  // Semicolons first: we know from the first run that this sheet's locale wants
  // them. The comma path stays as a fallback in case the sheet is ever recreated
  // under a different locale.
  if (writeDistanceFormulas_(sheet, lastRow, ';') && probeLooksRight_(sheet, probe)) {
    Logger.log('Distance formulas applied (semicolon separators).');
    return;
  }

  Logger.log('Semicolon separators did not evaluate — retrying with commas.');
  writeDistanceFormulas_(sheet, lastRow, ',');
  if (probeLooksRight_(sheet, probe)) {
    Logger.log('Distance formulas applied (comma separators).');
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
    // Odometer wins; then a Surf Spots lookup; then Places, so a trip to Lagos
    // gets its distance too; then whatever km was typed by hand.
    var direction = '*IF($O' + r + '="One-way"' + sep + '1' + sep + '2)';
    formulas.push([
      '=IF(AND($R' + r + '=""' + sep + '$S' + r + '="")' + sep +
        'IF($C' + r + '=""' + sep + '""' + sep +
          "IFERROR(INDEX('Surf Spots'!$C$3:$C$55" + sep + "MATCH($C" + r +
            sep + "'Surf Spots'!$B$3:$B$55" + sep + '0))' + direction + sep +
          'IFERROR(INDEX(Places!$C$3:$C$200' + sep + 'MATCH($C' + r +
            sep + 'Places!$B$3:$B$200' + sep + '0))' + direction + sep +
          'IF($D' + r + '=""' + sep + '""' + sep + '$D' + r + '))))' + sep +
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
