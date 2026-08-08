import { useState } from 'preact/hooks';
import type { Reservation, RideRequest, Trip } from './api/types';
import { EXPECTED_CODE_VERSION } from './config';
import type { TripCost } from './lib/cost';
import { clearMe, getMe, setMe } from './state/me';
import { sync, useApp } from './state/store';
import { Balance } from './screens/Balance';
import { Home } from './screens/Home';
import { Karma } from './screens/Karma';
import { LogTrip } from './screens/LogTrip';
import { Me } from './screens/Me';
import { PersonDetail } from './screens/PersonDetail';
import { Reserve } from './screens/Reserve';
import { Rides } from './screens/Rides';
import { TripDetail } from './screens/TripDetail';
import { TripLog } from './screens/TripLog';
import { TripSummary } from './screens/TripSummary';

export type Route =
  | { name: 'home' }
  | { name: 'reserve' }
  | { name: 'log'; reservationId?: string; reservation?: Reservation; ride?: RideRequest; trip?: Trip }
  | { name: 'rides' }
  | { name: 'summary'; cost: TripCost; destination: string }
  | { name: 'karma' }
  | { name: 'balance' }
  | { name: 'person'; person: string }
  | { name: 'trips' }
  | { name: 'trip'; trip: Trip };

export function App() {
  const app = useApp();
  const [me, setMeState] = useState<string | null>(getMe());
  // A stack rather than a single route: trip detail is reachable from Home, a
  // person's ledger and the trip log, and Back has to return where it came
  // from rather than to a hard-coded screen.
  const [stack, setStack] = useState<Route[]>([{ name: 'home' }]);
  const route = stack[stack.length - 1];
  const go = (next: Route) => setStack((s) => [...s, next]);
  const back = () => setStack((s) => (s.length > 1 ? s.slice(0, -1) : s));
  const home = () => setStack([{ name: 'home' }]);

  const chooseMe = (name: string) => {
    setMe(name);
    setMeState(name);
    home();
  };

  const switchMember = () => {
    // Easy to hit by accident on the way to something else, and it drops you
    // back to the picker mid-task.
    if (!confirm(`You're logged in as ${me}. Switch to someone else?`)) return;
    clearMe();
    setMeState(null);
  };

  if (!app.ready && app.loading) {
    return (
      <main class="shell center">
        <p class="eyebrow">Soul &amp; Surf</p>
        <h1>Car Share</h1>
        <p class="muted">Loading…</p>
      </main>
    );
  }

  const members = app.bootstrap?.members ?? [];

  if (!me || !members.some((m) => m.name === me)) {
    return (
      <main class="shell">
        <Me members={members} onChoose={chooseMe} />
      </main>
    );
  }

  return (
    <main class="shell">
      <div class="topbar">
        {route.name === 'home' ? (
          <span class="eyebrow" style="margin:0">
            Soul &amp; Surf · Aug 26
          </span>
        ) : (
          <button class="back" onClick={back}>
            ← Back
          </button>
        )}
        <button class="whoami" onClick={switchMember}>
          {me} ⌄
        </button>
      </div>

      <Banners />

      {route.name === 'home' && <Home me={me} onNavigate={go} />}
      {route.name === 'reserve' && <Reserve me={me} onDone={home} />}
      {route.name === 'rides' && (
        <Rides me={me} onDrive={(ride) => go({ name: 'log', ride })} />
      )}
      {route.name === 'log' && (
        <LogTrip
          me={me}
          reservationId={route.reservationId}
          reservation={route.reservation}
          ride={route.ride}
          trip={route.trip}
          onDone={(cost, destination) => go({ name: 'summary', cost, destination })}
        />
      )}
      {route.name === 'summary' && (
        <TripSummary
          cost={route.cost}
          destination={route.destination}
          onDone={home}
        />
      )}
      {route.name === 'karma' && <Karma me={me} />}
      {route.name === 'balance' && <Balance me={me} onOpenPerson={(name) => go({ name: 'person', person: name })} />}
      {route.name === 'person' && (
        <PersonDetail
          name={route.person}
          me={me}
          onOpenTrip={(trip) => go({ name: 'trip', trip })}
        />
      )}
      {route.name === 'trips' && <TripLog onOpenTrip={(trip) => go({ name: 'trip', trip })} />}
      {route.name === 'trip' && (
        <TripDetail
          trip={route.trip}
          me={me}
          onEdit={(trip) => go({ name: 'log', trip })}
          onDeleted={back}
        />
      )}
    </main>
  );
}

function Banners() {
  const { pending, online, syncing, error, bootstrap } = useApp();

  // Pasting the Apps Script and deploying it are separate steps, and skipping
  // the second one looks exactly like the app being broken: writes go through,
  // come back accepted, and change nothing. Three rounds of that is enough —
  // say it plainly instead of leaving it to be diagnosed.
  const deployed = bootstrap?.codeVersion ?? 0;
  const stale = !!bootstrap && deployed < EXPECTED_CODE_VERSION;

  return (
    <>
      {stale && (
        <div class="banner banner--error">
          The Sheet is running an older version of the backend (v{deployed || '?'}, expected v
          {EXPECTED_CODE_VERSION}). Deploy a new version in the Apps Script editor — until then
          some changes won't stick.
        </div>
      )}
      {pending.length > 0 && (
        <div class="banner banner--pending">
          <span>
            {pending.length} change{pending.length === 1 ? '' : 's'} waiting to sync
            {online ? '' : ' — no signal'}
          </span>
          {online && !syncing && (
            <button class="back" style="margin-left:auto" onClick={() => void sync()}>
              Retry
            </button>
          )}
        </div>
      )}
      {error && <div class="banner banner--error">{error}</div>}
    </>
  );
}
