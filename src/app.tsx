import { useState } from 'preact/hooks';
import type { RideRequest, Trip } from './api/types';
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
import { TripSummary } from './screens/TripSummary';

export type Route =
  | { name: 'home' }
  | { name: 'reserve' }
  | { name: 'log'; reservationId?: string; ride?: RideRequest; trip?: Trip }
  | { name: 'rides' }
  | { name: 'summary'; cost: TripCost; destination: string }
  | { name: 'karma' }
  | { name: 'balance' }
  | { name: 'person'; person: string };

export function App() {
  const app = useApp();
  const [me, setMeState] = useState<string | null>(getMe());
  const [route, setRoute] = useState<Route>({ name: 'home' });

  const chooseMe = (name: string) => {
    setMe(name);
    setMeState(name);
    setRoute({ name: 'home' });
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
          <button
            class="back"
            onClick={() =>
              setRoute(route.name === 'person' ? { name: 'balance' } : { name: 'home' })
            }
          >
            ← Back
          </button>
        )}
        <button class="whoami" onClick={switchMember}>
          {me} ⌄
        </button>
      </div>

      <Banners />

      {route.name === 'home' && <Home me={me} onNavigate={setRoute} />}
      {route.name === 'reserve' && <Reserve me={me} onDone={() => setRoute({ name: 'home' })} />}
      {route.name === 'rides' && (
        <Rides me={me} onDrive={(ride) => setRoute({ name: 'log', ride })} />
      )}
      {route.name === 'log' && (
        <LogTrip
          me={me}
          reservationId={route.reservationId}
          ride={route.ride}
          trip={route.trip}
          onDone={(cost, destination) => setRoute({ name: 'summary', cost, destination })}
        />
      )}
      {route.name === 'summary' && (
        <TripSummary
          cost={route.cost}
          destination={route.destination}
          onDone={() => setRoute({ name: 'home' })}
        />
      )}
      {route.name === 'karma' && <Karma me={me} />}
      {route.name === 'balance' && <Balance me={me} onOpenPerson={(name) => setRoute({ name: 'person', person: name })} />}
      {route.name === 'person' && <PersonDetail name={route.person} me={me} />}
    </main>
  );
}

function Banners() {
  const { pending, online, syncing, error } = useApp();

  return (
    <>
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
