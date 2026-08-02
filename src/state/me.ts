/**
 * "Who am I" without accounts: the chosen member name lives in localStorage, so
 * each volunteer's phone remembers them and nobody ever sees a login screen.
 */
const KEY = 'car-share:me';

export function getMe(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setMe(name: string): void {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* private mode — the dropdown just asks again next launch */
  }
}

export function clearMe(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}
