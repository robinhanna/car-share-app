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

  // Settings first: the total to split is what seeds the prepayment row and
  // drives every charge downstream.
  setupSettings_(ss);
  migrateConfig_(ss);

  setupReservations_(ss);
  setupRideRequests_(ss);
  setupKarmaActions_(ss);
  setupKarmaLog_(ss);
  setupPlaces_(ss);
  setupPayments_(ss);
  setupRideDays_(ss);
  migrateMembersTotals_(ss);
  setupMemberRoster_(ss);
  setupMembers_(ss);
  setupTripLog_(ss);
  var token = ensureToken_();

  SpreadsheetApp.flush();
  checkSheetHealth_(ss);
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
  sheet.getRange(2, 1, 1, RES.updated).setValues([[
    'ID', 'Created', 'Driver', 'Riders', 'Start', 'End',
    'Destination', 'Status', 'Trip ID', 'Client ID', 'Notes', 'Updated',
  ]]);
  sheet.getRange(2, 1, 1, RES.updated).setFontWeight('bold');
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
      [LIFT_ACTION, 1, 'Yes'],
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

  addMissingPlaces_(sheet);

  var category = SpreadsheetApp.newDataValidation()
    .requireValueInList(['Town', 'Activity'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, 1, 200, 1).setDataValidation(category);
}

/**
 * Places added after the tab was first seeded.
 *
 * The seed block above only runs on creation, deliberately — it must never
 * stamp over a distance Robin has corrected by hand. So anything added later
 * goes here and is appended only if the name isn't already there, the same
 * add-if-missing rule setupMemberRoster_ uses for people.
 *
 * Distances are one-way estimates from Almádena. Correct them in the sheet;
 * a later setupSheet() run will leave your figure alone.
 */
var LATER_PLACES = [
  ['Town', 'Figueira', 5, 'The village near Budens'],
  ['Town', 'Budens', 6, 'Shop, café'],
  ['Town', 'Boca do Rio', 9, 'Beach below Budens'],
  ['Town', 'Raposeira', 11, ''],
  ['Town', 'Praia do Barranco', 18, ''],
  ['Town', 'Praia das Furnas', 19, ''],
  ['Activity', 'Surf', '', 'Auto-selected when a surf spot is chosen'],
];

function addMissingPlaces_(sheet) {
  var last = sheet.getLastRow();
  var existing = {};
  if (last >= FIRST_DATA_ROW) {
    sheet.getRange(FIRST_DATA_ROW, PLACE.name, last - 2, 1).getValues().forEach(function (r) {
      var n = String(r[0]).trim();
      if (n) existing[n.toLowerCase()] = true;
    });
  }

  var added = [];
  LATER_PLACES.forEach(function (p) {
    if (existing[String(p[1]).toLowerCase()]) return;
    var row = firstEmptyRow_(sheet, PLACE.name);
    sheet.getRange(row, 1, 1, 4).setValues([p]);
    existing[String(p[1]).toLowerCase()] = true;
    added.push(p[1]);
  });

  if (added.length) Logger.log('Added ' + added.length + ' place(s): ' + added.join(', '));
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
    .requireValueInList(['cash', 'fuel', 'tolls', 'parking', 'prepayment', 'settlement'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, PAY.type, 500, 1).setDataValidation(type);

  // Robin fronted the whole rental — that is a payment, and without it his
  // balance would read as though he owed his own share.
  var settings = ss.getSheetByName(SHEETS.settings);
  var total = num_(settings.getRange('B15').getValue());

  if (!existing) {
    sheet.getRange(FIRST_DATA_ROW, 1, 1, 6).setValues([[
      settings.getRange('B4').getValue(), ADMIN_NAME, 'prepayment', total,
      'Rental and pickup paid upfront', 'seed-prepayment',
    ]]);
    return;
  }

  // The seeded prepayment was written from an older total. Flag rather than
  // overwrite: what Robin has actually laid out is a fact about the world, and
  // only he knows it.
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;
  var rows = sheet.getRange(FIRST_DATA_ROW, 1, last - 2, 6).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][PAY.clientId - 1]) !== 'seed-prepayment') continue;
    var seeded = num_(rows[i][PAY.amount - 1]);
    if (Math.abs(seeded - total) > 0.005) {
      Logger.log('NOTE: the prepayment row still reads €' + seeded.toFixed(2) +
        ' but the total to split is now €' + total.toFixed(2) +
        '. Update Payments row ' + (FIRST_DATA_ROW + i) +
        ' to whatever you have actually paid out.');
    }
    break;
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
  s.getRange('A14').setValue('Pickup / extras (€)');
  s.getRange('A15').setValue('Total to split (auto)');

  // The pickup cost gets its own line rather than being folded into the rental
  // figure, so anyone looking at the sheet can see what they're paying for.
  setFormulaVerified_(s.getRange('B15'), '=B3+B14');
  setFormulaVerified_(s.getRange('B13'), '=IFERROR(B15/(B6+B12);0)');

  s.getRange('B13').setNumberFormat('€#,##0.0000');
  s.getRange('B14:B15').setNumberFormat('€#,##0.00');
  if (String(s.getRange('B12').getValue()).trim() === '') s.getRange('B12').setValue(0);
  if (String(s.getRange('B14').getValue()).trim() === '') s.getRange('B14').setValue(0);

  // How much more fuel a loaded car burns. Held as values, not baked into the
  // formula: setValue writes a real number whatever the sheet's locale, while a
  // decimal typed into a formula string does not survive a comma-decimal one.
  s.getRange('A16').setValue('Fuel: extra per passenger');
  s.getRange('A17').setValue('Fuel: extra with boards');
  s.getRange('A18').setValue('Fuel: most it can add');
  if (String(s.getRange('B16').getValue()).trim() === '') s.getRange('B16').setValue(0.03);
  if (String(s.getRange('B17').getValue()).trim() === '') s.getRange('B17').setValue(0.08);
  if (String(s.getRange('B18').getValue()).trim() === '') s.getRange('B18').setValue(1.25);
}

/**
 * Facts about this particular trip that changed after the sheet was first set
 * up. Gated on a version marker so it happens exactly once: after this runs,
 * the Sheet is the source of truth again and Robin can edit any of it without
 * a later setupSheet() run stamping over him.
 */
/** Where the car actually is. Must match the timeZone in appsscript.json. */
var TIME_ZONE = 'Europe/Lisbon';

var CONFIG_VERSION = 8;

/** Faro and back is 180 km. Nothing this group drives comes near this. */
var MAX_PLAUSIBLE_KM = 400;

/**
 * Renames a karma action wherever it appears — the Karma Actions tab and every
 * row already written to the Karma Log.
 *
 * Both, or the log keeps showing a label that no longer exists anywhere else.
 * Skips silently if Robin has already renamed it himself.
 */
function renameKarmaAction_(ss, from, to) {
  var renamed = 0;
  [[SHEETS.karmaActions, 1], [SHEETS.karma, KARMA.action]].forEach(function (pair) {
    var sheet = ss.getSheetByName(pair[0]);
    if (!sheet) return;
    var last = sheet.getLastRow();
    if (last < FIRST_DATA_ROW) return;
    var range = sheet.getRange(FIRST_DATA_ROW, pair[1], last - 2, 1);
    var values = range.getValues();
    var touched = false;
    for (var i = 0; i < values.length; i++) {
      if (String(values[i][0]).trim() === from) {
        values[i][0] = to;
        touched = true;
        renamed++;
      }
    }
    if (touched) range.setValues(values);
  });
  if (renamed) Logger.log('Renamed "' + from + '" to "' + to + '" in ' + renamed + ' place(s).');
}

function migrateConfig_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (Number(props.getProperty('configVersion') || 0) >= CONFIG_VERSION) return;

  // The spreadsheet was created on an account whose default timezone sits
  // behind Portugal, so every date landed a day early: the app was reading the
  // rental period as 6–30 August when the migration had written 7–31. Anything
  // that turns a date into a day — ride-day attribution, the free-day rule, the
  // date column — was off by one for late-evening trips. Fixing the sheet's own
  // timezone fixes all of it at once.
  if (ss.getSpreadsheetTimeZone() !== TIME_ZONE) {
    Logger.log('Sheet timezone was ' + ss.getSpreadsheetTimeZone() + ' — setting it to ' + TIME_ZONE + '.');
    ss.setSpreadsheetTimeZone(TIME_ZONE);
  }

  var s = ss.getSheetByName(SHEETS.settings);
  // The owner doesn't charge for the pickup day, so the paid period starts on
  // the 7th. The group has the car on the 6th and will use it — trips that day
  // cost fuel but no day rate, which rebuildRideDays_ handles by only counting
  // ride-days inside B4..B5.
  // Midday, not midnight: a date written at 00:00 lands on the previous day the
  // moment any timezone shift is applied to it, which is exactly what happened
  // here. Noon survives anything up to ±12 hours.
  s.getRange('B3').setValue(375);                            // 25 days at €15
  s.getRange('B4').setValue(new Date(2026, 7, 7, 12));       // 7 August
  s.getRange('B5').setValue(new Date(2026, 7, 31, 12));      // 31 August
  // €30 Uber to collect the car, plus the €5 the ATM charged Robin taking the
  // cash out. Both are money he laid out for the group, so both are in the pot.
  s.getRange('B14').setValue(35);

  // The refuel receipt fixes the tank size, which is what the half-tank reading
  // needed: €69.65 at €1.913/L is 36.41 L, taken with the light on, so about
  // 8.6 L was left of a 45 L tank — right for a 106, impossible for a 50 L one.
  // Half of 45 L over 490 km is 4.59 L/100km.
  //
  // Worth knowing rather than discovering later: 4.6 is below the 106 1.4i's
  // official combined figure of about 6. At 6.0 those 490 km would leave 15.6 L
  // — a third of a tank, not a half — so the gauge is reading generously in its
  // upper half and the truth is somewhere in 4.6–6.0. Robin's call. Brim to
  // brim on two consecutive fill-ups is what would settle it.
  s.getRange('B10').setValue(4.6);

  // A receipt beats the DGEG monthly average that was in here (€2.03, 31 Jul).
  s.getRange('B9').setValue(1.913);

  var members = ss.getSheetByName(SHEETS.members);
  var rows = memberRows_();
  for (var r = rows.first; r <= rows.last; r++) {
    var name = String(members.getRange(r, MEMBER.name).getValue()).trim();
    if (name === 'Roberta') {
      members.getRange(r, 1, 1, MEMBER.tripCosts).clearContent();
      Logger.log('Removed Roberta from Members.');
    }
    if (name === 'John') {
      members.getRange(r, MEMBER.include).setValue('No');
      members.getRange(r, MEMBER.role).setValue('Non-driver');
      Logger.log('John is now a rider.');
    }
  }

  renameKarmaAction_(ss, 'Drove others around', LIFT_ACTION);

  // The prepayment row was seeded by this script from an older total, so it
  // tracks the total. A row Robin typed himself is a different matter and is
  // left alone — setupPayments_ only flags those.
  correctSeededPrepayment_(ss);

  props.setProperty('configVersion', String(CONFIG_VERSION));
  Logger.log('Config migrated to v' + CONFIG_VERSION + ': fuel €1.913/L at 4.6 L/100km.');
}

function correctSeededPrepayment_(ss) {
  var sheet = ss.getSheetByName(SHEETS.payments);
  if (!sheet) return;
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return;

  var total = num_(ss.getSheetByName(SHEETS.settings).getRange('B15').getValue());
  var rows = sheet.getRange(FIRST_DATA_ROW, 1, last - 2, 6).getValues();

  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][PAY.clientId - 1]) !== 'seed-prepayment') continue;
    var row = FIRST_DATA_ROW + i;
    var was = num_(rows[i][PAY.amount - 1]);
    if (Math.abs(was - total) < 0.005) return;

    sheet.getRange(row, PAY.amount).setValue(total);
    sheet.getRange(row, PAY.date).setValue(
      ss.getSheetByName(SHEETS.settings).getRange('B4').getValue(),
    );
    sheet.getRange(row, PAY.note).setValue('Rental and pickup paid upfront');
    Logger.log('Prepayment corrected: €' + was.toFixed(2) + ' → €' + total.toFixed(2) +
      ' (Payments row ' + row + ').');
    return;
  }
}

function setupRideRequests_(ss) {
  var sheet = ss.getSheetByName(SHEETS.rideRequests) || ss.insertSheet(SHEETS.rideRequests);

  sheet.getRange('A1').setValue('Ride Requests — someone asking to be driven somewhere')
    .setFontWeight('bold');
  sheet.getRange(2, 1, 1, 12).setValues([[
    'ID', 'Created', 'Passenger', 'Others', 'When', 'From', 'To', 'Notes',
    'Status', 'Driver', 'Trip ID', 'Client ID',
  ]]).setFontWeight('bold');
  sheet.setFrozenRows(2);
  sheet.getRange(FIRST_DATA_ROW, RIDE_REQ.when, 500, 1).setNumberFormat('yyyy-mm-dd hh:mm');

  var status = SpreadsheetApp.newDataValidation()
    .requireValueInList(['open', 'claimed', 'done', 'cancelled'], true)
    .setAllowInvalid(false)
    .build();
  sheet.getRange(FIRST_DATA_ROW, RIDE_REQ.status, 500, 1).setDataValidation(status);
}

/**
 * The August 2026 group. Non-drivers aren't paying into the rental, but they
 * are full users of the app: they pick their own name, ride along, and are
 * charged for the days they were in the car.
 *
 * George and Holly can drive — they opted out of the membership, which is a
 * money question, not a licence one. Roberta hasn't arrived; flip her Include?
 * to Yes if she joins the membership.
 */
var ROSTER = [
  { name: 'Robin', included: 'Yes', role: 'Driver' },
  { name: 'Julia', included: 'Yes', role: 'Driver' },
  { name: 'Jonas', included: 'Yes', role: 'Driver' },
  { name: 'John', included: 'No', role: 'Non-driver' },
  { name: 'Lucia', included: 'No', role: 'Non-driver' },
  { name: 'George', included: 'No', role: 'Non-driver' },
  { name: 'Bonnie', included: 'No', role: 'Non-driver' },
  { name: 'Holly', included: 'No', role: 'Non-driver' },
];

/**
 * Row layout of the Members block. Computed on call rather than at file scope:
 * these depend on constants in Code.gs, and Apps Script does not guarantee
 * which file it evaluates first.
 */
function memberRows_() {
  var last = FIRST_DATA_ROW + MEMBER_ROWS - 1; // 22
  return { first: FIRST_DATA_ROW, last: last, total: last + 2, check: last + 3 };
}

/**
 * Moves the TOTAL and Check rows below the widened member block.
 *
 * The spreadsheet put them at rows 14 and 15, which sat safely under a ten-row
 * block but now falls inside a twenty-row one. Left alone, "TOTAL" would be
 * read as a member's name, given a car charge, and counted in the split.
 *
 * The Check row is worth preserving: SUM(car charges) − total cost should read
 * 0.00 under the day-rate model, because (member-days + rider-days) × day rate
 * is exactly the rental cost. A free assertion that the model balances, sitting
 * in the sheet where Robin can see it.
 */
function migrateMembersTotals_(ss) {
  var sheet = ss.getSheetByName(SHEETS.members);
  var rows = memberRows_();

  if (String(sheet.getRange(rows.total, 1).getValue()).trim().toUpperCase() === 'TOTAL') {
    // Already moved, but the check still has to follow the total to split when
    // that changes — as it just did, from the rental alone to rental + pickup.
    setFormulaVerified_(sheet.getRange(rows.check, MEMBER.share),
      '=ROUND(F' + rows.total + '-Settings!$B$15;2)');
    return;
  }

  // Clear wherever the old pair currently sits inside the new block.
  for (var r = rows.first; r <= rows.last; r++) {
    var label = String(sheet.getRange(r, 1).getValue()).trim();
    if (MEMBER_FURNITURE.test(label)) sheet.getRange(r, 1, 1, MEMBER.tripCosts).clearContent();
  }

  sheet.getRange(rows.total, 1).setValue('TOTAL').setFontWeight('bold');
  setFormulaVerified_(sheet.getRange(rows.total, MEMBER.days),
    '=SUM(E' + rows.first + ':E' + rows.last + ')');
  setFormulaVerified_(sheet.getRange(rows.total, MEMBER.share),
    '=SUM(F' + rows.first + ':F' + rows.last + ')');
  sheet.getRange(rows.total, MEMBER.share).setNumberFormat('€#,##0.00');

  sheet.getRange(rows.check, 1).setValue('Check (should read 0.00)');
  setFormulaVerified_(sheet.getRange(rows.check, MEMBER.share),
    '=ROUND(F' + rows.total + '-Settings!$B$15;2)');
  sheet.getRange(rows.check, MEMBER.share).setNumberFormat('0.00');

  Logger.log('Members: TOTAL moved to row ' + rows.total + ', capacity now ' + MEMBER_ROWS + '.');
}

/**
 * Adds anyone missing from the Members tab. Existing rows are left exactly as
 * they are, so Robin's edits — and Roberta's status once she confirms — survive
 * a re-run.
 */
function setupMemberRoster_(ss) {
  var sheet = ss.getSheetByName(SHEETS.members);
  var settings = ss.getSheetByName(SHEETS.settings);
  var start = settings.getRange('B4').getValue();
  var end = settings.getRange('B5').getValue();

  var existing = {};
  sheet.getRange(FIRST_DATA_ROW, MEMBER.name, MEMBER_ROWS, 1).getValues().forEach(function (r) {
    var n = String(r[0]).trim();
    if (n) existing[n.toLowerCase()] = true;
  });

  var added = [];
  ROSTER.forEach(function (p) {
    if (existing[p.name.toLowerCase()]) return;
    var row = firstEmptyRow_(sheet, MEMBER.name);
    if (row > FIRST_DATA_ROW + MEMBER_ROWS - 1) {
      Logger.log('WARNING: no room left on Members for ' + p.name);
      return;
    }
    sheet.getRange(row, MEMBER.name).setValue(p.name);
    sheet.getRange(row, MEMBER.include).setValue(p.included);
    sheet.getRange(row, MEMBER.join).setValue(start);
    sheet.getRange(row, MEMBER.leave).setValue(end);
    sheet.getRange(row, MEMBER.role).setValue(p.role);
    existing[p.name.toLowerCase()] = true;
    added.push(p.name);
  });

  Logger.log(added.length ? 'Added to Members: ' + added.join(', ') : 'Members already complete.');
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

    // E and I came from the original spreadsheet and only existed on its ten
    // rows. Writing them here makes the whole block self-contained, so a name
    // added anywhere in it behaves like any other.
    setFormulaVerified_(sheet.getRange(r, MEMBER.days),
      '=IF($A{r}="";"";MIN($D{r};Settings!$B$5)-MAX($C{r};Settings!$B$4)+1)'.replace(/\{r\}/g, r));
    setFormulaVerified_(sheet.getRange(r, MEMBER.karma),
      "=IF($A{r}=\"\";\"\";IFERROR(SUMIF('Karma Log'!$B:$B;$A{r};'Karma Log'!$D:$D);0))".replace(/\{r\}/g, r));

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
/**
 * A decimal typed into a formula string does not survive a sheet whose locale
 * uses the comma as its decimal separator — and wrapped in IFERROR it fails
 * silently as a zero. Constants belong in cells, referenced by address.
 */
function assertNoDecimalLiterals_(formula) {
  // Cell references like $B$18 and ranges like A3:E200 are fine; a bare 0.03
  // is not.
  var stripped = String(formula).replace(/\$?[A-Z]+\$?\d+/g, '');
  if (/\d+\.\d+/.test(stripped)) {
    throw new Error('Formula contains a decimal literal, which breaks in this ' +
      'sheet\'s locale — put the constant in a Settings cell instead: ' + formula);
  }
}

function setFormulaVerified_(range, semicolonFormula) {
  assertNoDecimalLiterals_(semicolonFormula);
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
    [TRIP.taxi, 'Taxi run?'],
    [TRIP.rideRequestId, 'Ride Request ID'],
    [TRIP.origin, 'From'],
    [TRIP.boards, 'Boards?'],
    [TRIP.until, 'Until'],
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

  // The Destination column inherited a surf-spot dropdown from the original
  // xlsx, so every typed-in place ("Favo", a town, an activity) picks up a
  // warning triangle. The app supports naming somewhere that isn't on any list,
  // so the rule contradicts the product — and on a sheet where three bugs have
  // hidden behind plausible-looking cells, teaching people that warnings are
  // normal is the expensive part.
  sheet.getRange(FIRST_DATA_ROW, TRIP.destination, rows, 1).clearDataValidations();

  writeFuelFormulas_(sheet, Math.max(sheet.getLastRow(), 24));
  writeCostFormulas_(sheet, Math.max(sheet.getLastRow(), 24));

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
    //
    // A one-way lift still doubles: the driver comes back empty, so the car
    // covered the return leg even though the passenger didn't.
    var direction = '*IF(AND($O' + r + '="One-way"' + sep + '$U' + r + '<>"Yes")' +
      sep + '1' + sep + '2)';

    // Manual km is checked before the destination. It used to be nested inside
    // the "has a destination" branch, so typing a distance with no place named
    // — the whole point of the "Just km" option — produced an empty row that
    // the sheet priced at zero.
    // Both readings, and the trip going forwards, or it isn't a measurement.
    // The old test was AND($R="";$S=""), so filling in exactly one odometer
    // field made the sheet compute $S-$R against a blank and store a single
    // reading as the distance. tripDistanceKm in cost.ts has always required
    // both, so the form's running total and the sheet would quietly disagree.
    formulas.push([
      '=IF(NOT(AND($R' + r + '<>""' + sep + '$S' + r + '<>""' + sep + '$S' + r + '>$R' + r + '))' + sep +
        'IF($D' + r + '<>""' + sep + '$D' + r + sep +
          'IF($C' + r + '=""' + sep + '""' + sep +
            "IFERROR(INDEX('Surf Spots'!$C$3:$C$55" + sep + "MATCH($C" + r +
              sep + "'Surf Spots'!$B$3:$B$55" + sep + '0))' + direction + sep +
            'IFERROR(INDEX(Places!$C$3:$C$200' + sep + 'MATCH($C' + r +
              sep + 'Places!$B$3:$B$200' + sep + '0))' + direction + sep +
            '""))))' + sep +
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

/**
 * Fuel = distance × cost-per-km × how loaded the car was.
 *
 * A full car with boards on the roof really does burn more: roughly 3% per
 * passenger for the weight and 8% for the drag of boards overhead. Capped at
 * +25% so a packed car never turns into a surcharge nobody recognises.
 */
function writeFuelFormulas_(sheet, lastRow) {
  for (var r = FIRST_DATA_ROW; r <= lastRow; r++) {
    // Column J is the headcount the cost splits between, which on a lift
    // excludes the driver — but the car still carried them, so add them back
    // before working out how loaded it was.
    var onboard = '($J' + r + '+IF($U' + r + '="Yes";1;0))';

    // The load constants live in Settings rather than being written into the
    // formula. A decimal literal like 0.03 does not parse in a sheet whose
    // locale uses the comma as the decimal separator — and because this whole
    // expression sits inside IFERROR(...;0), that failure showed up as every
    // trip costing €0.00 rather than as an error anyone could see.
    var load = 'MIN(Settings!$B$18;1+Settings!$B$16*MAX(' + onboard + '-1;0)' +
      '+Settings!$B$17*IF($X' + r + '="Yes";1;0))';

    setFormulaVerified_(sheet.getRange(r, TRIP.fuel),
      '=IF($E' + r + '="";"";IFERROR($E' + r + '*Settings!$B$11*' + load + ';0))');
  }
}

/**
 * Total and per-person — the two columns this codebase never wrote.
 *
 * Until now `ensureTripFormulas_` copied them from row 3, which came from the
 * original spreadsheet and its old cost model: a trip there carried a share of
 * the rental, so column I was adding money that has nothing to do with a drive.
 * Fuel was right and the cost beside it was €112 too high, and every guard this
 * file built — semicolons, no decimal literals, reading the answer back — was
 * being applied to E and F and stopping at the column boundary.
 *
 * K guards its own division: a lift whose headcount is blank or zero returns
 * empty rather than #DIV/0!, which num_ would otherwise read as a plausible
 * €0.00 — the same silent-zero failure that has cost this project three
 * rounds of debugging already.
 */
function writeCostFormulas_(sheet, lastRow) {
  for (var r = FIRST_DATA_ROW; r <= lastRow; r++) {
    // Guarded on the row being empty, not on fuel being empty: a trip with
    // parking but no distance still cost somebody money. This is what the
    // inherited formula did, and it was right to.
    setFormulaVerified_(sheet.getRange(r, TRIP.total),
      '=IF(AND($A' + r + '="";$C' + r + '="");"";N($F' + r + ')+N($G' + r + ')+N($H' + r + '))');

    setFormulaVerified_(sheet.getRange(r, TRIP.perPerson),
      '=IF(OR($I' + r + '="";N($J' + r + ')=0);"";$I' + r + '/$J' + r + ')');
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
  diagnoseTrip(0);
}

/**
 * Everything both money formulas read, for one row, as formulas *and* values.
 *
 * A number that looks right can still be a string the sheet won't multiply, and
 * a formula that computes can still be the wrong formula — which is exactly
 * what columns I and K turned out to be. Pass 0 to probe the first row with a
 * destination. Writes nothing.
 */
function diagnoseTrip(row) {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.trips);
  var spots = ss.getSheetByName(SHEETS.spots);
  var settings = ss.getSheetByName(SHEETS.settings);
  if (!row) row = findProbeRow_(sheet, Math.max(sheet.getLastRow(), 24));

  function cell(label, col) {
    var r = sheet.getRange(row, col);
    var f = String(r.getFormula()).trim();
    Logger.log(label + ' value: "' + r.getValue() + '"' + (f ? '   formula: ' + f : ''));
  }

  Logger.log('Spreadsheet locale: ' + ss.getSpreadsheetLocale());
  Logger.log('Row: ' + row);
  cell('A date       ', TRIP.date);
  cell('C destination', TRIP.destination);
  cell('D manual km  ', TRIP.manualKm);
  cell('E distance   ', TRIP.distance);
  cell('F fuel       ', TRIP.fuel);
  cell('G tolls      ', TRIP.tolls);
  cell('H parking    ', TRIP.parking);
  cell('I total      ', TRIP.total);
  cell('J people     ', TRIP.people);
  cell('K per person ', TRIP.perPerson);
  cell('O trip type  ', TRIP.tripType);
  cell('R odo start  ', TRIP.odoStart);
  cell('S odo end    ', TRIP.odoEnd);
  cell('U taxi       ', TRIP.taxi);
  cell('X boards     ', TRIP.boards);

  ['B9', 'B10', 'B11', 'B16', 'B17', 'B18'].forEach(function (a) {
    var r = settings.getRange(a);
    var f = String(r.getFormula()).trim();
    Logger.log('Settings!' + a + ' = "' + r.getValue() + '"' + (f ? '   formula: ' + f : ''));
  });

  // Which tab actually answers for this destination. Surf Spots is searched
  // first, so a row there shadows the Places entry entirely.
  var name = String(sheet.getRange(row, TRIP.destination).getValue()).trim();
  if (name) {
    Logger.log('"' + name + '" in Surf Spots: ' + lookupDistance_(spots, name, 55));
    Logger.log('"' + name + '" in Places:     ' +
      lookupDistance_(ss.getSheetByName(SHEETS.places), name, 200));
  }

  Logger.log('Sheet names: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(' | '));
}

/**
 * Every trip on one screen, so a wrong number can be spotted against its
 * neighbours instead of a row at a time.
 *
 * Reading row 3 in isolation said everything was fine, because row 3 *was*
 * fine. What a single row can never show is whether one of them is unlike the
 * others. Writes nothing.
 */
function diagnoseAllTrips() {
  var ss = SpreadsheetApp.getActive();
  var sheet = ss.getSheetByName(SHEETS.trips);
  var last = sheet.getLastRow();
  if (last < FIRST_DATA_ROW) return Logger.log('No trips logged.');

  var rows = sheet.getRange(FIRST_DATA_ROW, 1, last - 2, TRIP.boards).getValues();
  Logger.log('row  date    destination           D     E      F      G       H       I        J   K');

  rows.forEach(function (r, i) {
    if (!String(r[TRIP.driver - 1]).trim()) return;
    var d = r[TRIP.date - 1];
    Logger.log(
      pad_(FIRST_DATA_ROW + i, 5) +
      pad_(d instanceof Date ? Utilities.formatDate(d, TIME_ZONE, 'dd MMM') : d, 8) +
      pad_(String(r[TRIP.destination - 1]).slice(0, 20), 22) +
      pad_(r[TRIP.manualKm - 1], 6) +
      pad_(r[TRIP.distance - 1], 7) +
      pad_(round2_(r[TRIP.fuel - 1]), 7) +
      pad_(round2_(r[TRIP.tolls - 1]), 8) +
      pad_(round2_(r[TRIP.parking - 1]), 8) +
      pad_(round2_(r[TRIP.total - 1]), 9) +
      pad_(r[TRIP.people - 1], 4) +
      round2_(r[TRIP.perPerson - 1]));
  });

  // Named separately rather than left to the eye — the point of the run.
  var flagged = [];
  rows.forEach(function (r, i) {
    if (!String(r[TRIP.driver - 1]).trim()) return;
    var extras = num_(r[TRIP.tolls - 1]) + num_(r[TRIP.parking - 1]);
    if (extras > 0 && extras > num_(r[TRIP.fuel - 1])) {
      flagged.push('row ' + (FIRST_DATA_ROW + i) + ': EUR' + round2_(extras) +
        ' of tolls and parking against EUR' + round2_(r[TRIP.fuel - 1]) + ' of fuel');
    }
    if (num_(r[TRIP.distance - 1]) > MAX_PLAUSIBLE_KM) {
      flagged.push('row ' + (FIRST_DATA_ROW + i) + ': ' + r[TRIP.distance - 1] + ' km');
    }
  });
  Logger.log(flagged.length ? 'Worth a look: ' + flagged.join(' | ') : 'Nothing looks out of place.');
}

function pad_(v, width) {
  var s = String(v == null ? '' : v);
  while (s.length < width) s += ' ';
  return s;
}

function round2_(v) {
  return Math.round(num_(v) * 100) / 100;
}

/** What a tab returns for a name, or "not found" — read-only. */
function lookupDistance_(sheet, name, lastRow) {
  if (!sheet) return 'tab missing';
  var rows = sheet.getRange(FIRST_DATA_ROW, 2, lastRow - 2, 2).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === name) return rows[i][1] + ' km (row ' + (i + FIRST_DATA_ROW) + ')';
  }
  return 'not found';
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

/**
 * Reads back what the sheet actually computed and complains if it looks wrong.
 *
 * Worth having because the failure that prompted it was invisible: a formula
 * that couldn't parse returned its IFERROR fallback of 0, so every trip quietly
 * cost €0.00 and nothing anywhere said "error". A formula that writes without
 * throwing is not the same as a formula that works, so this checks the numbers
 * rather than the writing of them.
 */
function checkSheetHealth_(ss) {
  ss = ss || SpreadsheetApp.getActive();
  var problems = [];

  var trips = ss.getSheetByName(SHEETS.trips);
  var last = trips.getLastRow();
  var checked = 0;

  if (last >= FIRST_DATA_ROW) {
    var rows = trips.getRange(FIRST_DATA_ROW, 1, last - 2, TRIP.boards).getValues();
    for (var i = 0; i < rows.length; i++) {
      var distance = num_(rows[i][TRIP.distance - 1]);

      // A logged trip with no distance at all is the louder failure: it means
      // something was entered that the sheet couldn't turn into kilometres.
      // Skipping these is how the broken "Just km" formula went unnoticed.
      if (distance <= 0) {
        var driver = String(rows[i][TRIP.driver - 1]).trim();
        var hasInput = String(rows[i][TRIP.destination - 1]).trim() !== '' ||
          num_(rows[i][TRIP.manualKm - 1]) > 0 ||
          num_(rows[i][TRIP.odoEnd - 1]) > 0;
        if (driver && hasInput) {
          problems.push('row ' + (FIRST_DATA_ROW + i) + ': ' + driver +
            ' logged a trip but it works out at 0 km');
        }
        continue;
      }
      checked++;

      var fuel = num_(rows[i][TRIP.fuel - 1]);
      var total = num_(rows[i][TRIP.total - 1]);
      var perPerson = num_(rows[i][TRIP.perPerson - 1]);
      var row = FIRST_DATA_ROW + i;

      if (fuel <= 0) {
        problems.push('row ' + row + ': ' + distance + ' km but fuel reads €0.00');
      }

      // The other end of the same class of failure. Every check here looks for
      // a number that came out too small; nothing was watching for one that
      // came out absurd. Faro and back is 180 km and that is the longest drive
      // this group makes, so 400 cannot flag a real trip.
      if (distance > MAX_PLAUSIBLE_KM) {
        problems.push('row ' + row + ': ' + distance + ' km — further than this car goes. ' +
          'Check the odometer columns and the destination.');
      }
      // The bound that would actually have caught the €115 lift. "More than the
      // whole rental" was too loose to fire on it — €115 of €410 passed — and a
      // ceiling that misses the case it was written for is worse than none.
      //
      // Tolls and parking are typed by a person; fuel is computed. So extras
      // that dwarf the fuel mean a number went in the wrong box, which is
      // exactly what happened: €112.68 sitting beside €2.70 of petrol.
      var extras = num_(rows[i][TRIP.tolls - 1]) + num_(rows[i][TRIP.parking - 1]);
      if (extras > 0 && extras > fuel * 3) {
        problems.push('row ' + row + ': €' + extras.toFixed(2) +
          ' of tolls and parking against €' + fuel.toFixed(2) +
          ' of fuel — check columns G and H.');
      }
      if (total <= 0) {
        problems.push('row ' + row + ': trip total reads €0.00');
      }
      if (perPerson <= 0) {
        problems.push('row ' + row + ': cost per person reads €0.00');
      }
      if (problems.length > 4) break;
    }
  }

  // The Members check row is the sheet's own assertion that every charge adds
  // back up to the total to split.
  var members = ss.getSheetByName(SHEETS.members);
  var check = num_(members.getRange(memberRows_().check, MEMBER.share).getValue());
  if (Math.abs(check) > 0.02) {
    problems.push('Members check row reads ' + check.toFixed(2) + ', expected 0.00');
  }

  if (problems.length) {
    Logger.log('SHEET HEALTH: FAILED');
    problems.forEach(function (p) { Logger.log('  - ' + p); });
    Logger.log('  Send these lines to Claude — the sheet is not calculating correctly.');
  } else {
    Logger.log('Sheet health: OK (' + checked + ' priced trip(s), split balances to 0.00).');
  }
  return problems;
}

/** Prints the token again if you lose it. */
function showToken() {
  Logger.log('APP_TOKEN = ' + ensureToken_());
}

/**
 * Run this after pasting the code, before setupSheet().
 *
 * Pasting a thousand-line file into a browser editor sometimes truncates, and
 * a half-pasted file fails in confusing ways much later — usually as a wrong
 * number rather than an error. This checks every function the app actually
 * calls is present, and names the ones that aren't.
 */
/**
 * What CODE_VERSION in Code.gs should read. Bump both together.
 *
 * The function inventory below only proves a file didn't get cut off mid-paste.
 * It says nothing about a file that pasted perfectly but came from three
 * versions ago — which is the failure that keeps happening, because pasting and
 * deploying are separate steps. This constant catches that.
 */
var EXPECTED_CODE_VERSION = 15;

function verifyInstall() {
  var required = [
    // Code.gs
    'doGet', 'doPost', 'applyOp_', 'bootstrap_', 'readSettings_', 'rawMembers_',
    'readMembers_', 'readRideDays_', 'sumPaymentsFor_', 'readPlaces_', 'readPayments_',
    'readKarmaLog_', 'readSpots_', 'readKarmaActions_', 'readReservations_', 'readTrips_',
    'requestRide_', 'claimRide_', 'cancelRide_', 'closeRideRequest_', 'findRideRequest_',
    'readRideRequests_', 'rebuildRideDays_', 'dayCharge_', 'dateKey_', 'resetTestData_',
    'clearPaymentsKeepingPrepayments_', 'clearRows_', 'backupLogs_', 'pruneBackups_',
    'completeTrip_', 'createReservation_', 'cancelReservation_', 'closeReservation_',
    'logKarma_', 'logPayment_', 'settleUp_', 'writePayment_', 'checkToken_',
    'findByClientId_', 'firstEmptyRow_', 'ensureTripFormulas_', 'splitList_', 'num_',
    'iso_', 'json_',
    // Code.gs — lifts, edits and joins
    'editTrip_', 'deleteTrip_', 'findTripRow_', 'logRide_', 'sweepDueRides_',
    'knownDistance_', 'awardLiftKarma_', 'removeLiftKarma_', 'liftKarmaAction_',
    'joinReservation_', 'joinRide_', 'toggleName_', 'tripMatchesReservation_',
    'editReservation_', 'findReservationRow_', 'payingRiders_', 'isFreeRider_',
    'deleteKarma_', 'removePayment_', 'renameKarmaAction_', 'editRide_', 'releaseRide_',
    // setup.gs
    'setupSheet', 'setupReservations_', 'setupRideRequests_', 'setupKarmaActions_',
    'setupKarmaLog_', 'setupPlaces_', 'setupPayments_', 'setupRideDays_', 'setupSettings_',
    'migrateConfig_', 'memberRows_', 'migrateMembersTotals_', 'setupMemberRoster_',
    'setupMembers_', 'setFormulaVerified_', 'setupTripLog_', 'applyDistanceFormulas_',
    'writeDistanceFormulas_', 'writeFuelFormulas_', 'assertNoDecimalLiterals_',
    'checkSheetHealth_', 'correctSeededPrepayment_', 'addMissingPlaces_', 'findProbeRow_', 'probeLooksRight_',
    'ensureToken_', 'showToken', 'diagnoseTripLog', 'diagnoseTrip', 'lookupDistance_',
    'writeCostFormulas_', 'diagnoseAllTrips', 'pad_', 'round2_', 'verifyInstall',
  ];

  var missing = [];
  required.forEach(function (name) {
    if (typeof this[name] !== 'function') missing.push(name);
  }, this);

  // Globals from the top of Code.gs. Checked by name through the global object
  // rather than referenced directly: if Code.gs is missing entirely, naming it
  // in code would throw a ReferenceError and bury the actual diagnosis.
  var badGlobals = [];
  ['SHEETS', 'TRIP', 'RIDE_REQ', 'MEMBER', 'PAY', 'RIDE', 'PLACE', 'MEMBER_ROWS', 'ROSTER',
    'CODE_VERSION']
    .forEach(function (name) {
      if (typeof this[name] === 'undefined') badGlobals.push(name);
    }, this);

  if (missing.length || badGlobals.length) {
    Logger.log('INCOMPLETE PASTE — do not run setupSheet() yet.');
    if (badGlobals.length) {
      Logger.log('Code.gs is missing or cut short (no ' + badGlobals.join(', ') + ').');
    }
    if (missing.length) {
      Logger.log('Missing ' + missing.length + ' function(s): ' + missing.slice(0, 12).join(', ') +
        (missing.length > 12 ? ' …' : ''));
    }
    Logger.log('Re-paste both files in full, save, and run verifyInstall() again.');
    return;
  }

  if (CODE_VERSION !== EXPECTED_CODE_VERSION) {
    Logger.log('MISMATCHED FILES — Code.gs is v' + CODE_VERSION + ', setup.gs expects v' +
      EXPECTED_CODE_VERSION + '.');
    Logger.log(CODE_VERSION < EXPECTED_CODE_VERSION
      ? 'Code.gs is the older one. Re-paste it in full from the repo.'
      : 'setup.gs is the older one. Re-paste it in full from the repo.');
    return;
  }

  Logger.log('Both files are complete and match: v' + CODE_VERSION + ', ' + required.length +
    ' functions present.');
  Logger.log('Trip Log goes up to column ' + TRIP.until + ' (Y), members ' + MEMBER_ROWS +
    ' rows, roster ' + ROSTER.length + ' people.');
  Logger.log('Safe to run setupSheet().');
  Logger.log('Then Bereitstellen → Bereitstellungen verwalten → Stift → Neue Version, or the ' +
    'web app keeps serving the old code and nothing you just pasted takes effect.');
}
