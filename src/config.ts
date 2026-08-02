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
