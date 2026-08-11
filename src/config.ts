/**
 * The Apps Script version this front-end needs. Must match `CODE_VERSION` in
 * Code.gs and `EXPECTED_CODE_VERSION` in setup.gs — bump all three together.
 *
 * When the deployed backend reports less than this, the app says so on every
 * screen rather than letting writes vanish into a stale deployment.
 */
export const EXPECTED_CODE_VERSION = 15;

/**
 * The fast path on the reserve screen: the trips this group actually makes.
 *
 * Durations are minutes. Destinations must match a name in the Surf Spots or
 * Places tabs — a chip whose name isn't there is dropped rather than rendered,
 * since it would otherwise book a place the distance lookup can't price.
 */
export const QUICK_DURATIONS = [30, 60, 120];
export const QUICK_DESTINATIONS = ['Burgau', 'Lagos', 'Praia do Bordeira'];

/**
 * How long a claimed lift blocks the car. A ride request records when it
 * starts and nothing else, so without this the status card has no window to
 * show and a lift looks instantaneous.
 */
export const LIFT_HOURS = 1;

/** The only member who sees admin controls. Must match a name in the Members tab. */
export const ADMIN_MEMBER = 'Robin';

