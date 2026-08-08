/**
 * The Apps Script version this front-end needs. Must match `CODE_VERSION` in
 * Code.gs and `EXPECTED_CODE_VERSION` in setup.gs — bump all three together.
 *
 * When the deployed backend reports less than this, the app says so on every
 * screen rather than letting writes vanish into a stale deployment.
 */
export const EXPECTED_CODE_VERSION = 10;

/** The only member who sees admin controls. Must match a name in the Members tab. */
export const ADMIN_MEMBER = 'Robin';

/**
 * Shows the "clear all logged data" button on the Balance screen, for Robin only.
 *
 * TURN THIS OFF BEFORE THE GROUP ARRIVES. It exists so the app can be tested
 * against the live Sheet without leaving junk rows behind; once real trips are
 * being logged there is no reason for it to be reachable from a phone.
 */
export const RESET_ENABLED = true;
