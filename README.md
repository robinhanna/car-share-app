# Quinta Car Share

Phone-first PWA for the ~9-person car share at Quinta Agave, Almádena — August 2026.
Reserve the car, log trips, tap karma, see what you owe. No login, works with no signal.

The Google Sheet is the live source of truth; this app is a front-end onto it. Admin
(fuel price, distances, members, karma actions) happens in the Sheet, not in the app.

## How it fits together

```
Google Sheet  ←  Apps Script Web App (doGet/doPost)  ←  PWA on GitHub Pages
   live data          apps-script/Code.gs                   src/
                                                     ↑ IndexedDB outbox
                                                       queues every write
```

## Local development

```bash
npm install
npm run dev
```

With no `API_URL` set, dev mode serves a mock Sheet (`src/api/mock.ts`) with the real
numbers from the spreadsheet, so the UI can be worked on before the backend exists.
Production builds refuse to start without a real `API_URL`.

```bash
npm test          # cost maths, asserted against the spreadsheet's known values
npm run build     # typecheck + production bundle
```

## Backend

`apps-script/` is the Apps Script project bound to the Sheet. Paste `Code.gs` and
`setup.gs` into the editor (or push with `clasp`), run `setupSheet()` once, then deploy
as a Web App: **Execute as: Me**, **Who has access: Anyone**.

`setupSheet()` is idempotent. It adds the Reservations and Karma Actions tabs, the new
Trip Log columns (M–S), and rewrites the Distance formula so odometer readings and the
one-way/round-trip toggle are honoured. It also generates `APP_TOKEN` and logs it.

Redeploy after every backend change: **Deploy → Manage deployments → edit → New version**.
The URL stays the same. Skipping this is why a fix appears not to have landed.

## Deployment

GitHub Actions builds and publishes to Pages on every push to `main`. Two repository
secrets are required:

| Secret | Value |
|---|---|
| `API_URL` | the Apps Script `/exec` URL |
| `APP_TOKEN` | the token `setupSheet()` logged |

Both end up in the shipped bundle — they keep the values out of source control, not out
of the browser. The real limit on damage is that the script accepts exactly four
operations and nothing else.

## Design

Palette and type derive from soulandsurf.com. Their Cako / Aktiv Grotesk / American
Typewriter are licensed, so Fraunces, Inter and Space Mono stand in, self-hosted via
`@fontsource` so the app still renders offline. Coral and teal are fills only — they
fail contrast as text on the paper background, so text uses the `-dark` variants.

## Cost rules (ported, not reinvented)

- Membership is split by member-days: `days ÷ total member-days × €465`
- Non-members pay no membership, only their share of trips they ride on
- Fuel is `distance × (fuel price × consumption ÷ 100)`, not receipts
- A trip's cost splits equally between driver and named riders
- Karma is a booking tiebreaker, never money
