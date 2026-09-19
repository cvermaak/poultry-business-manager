const JWT_TOKEN_KEY = 'app_jwt_token';
const STORAGE_TEST_KEY = '__storage_test__';

/**
 * Safely check whether a given Storage object (localStorage/sessionStorage)
 * is available and writable. Incognito/private browsing modes in some
 * browsers disable, restrict, or throw on storage access.
 */
function isStorageAvailable(storage: Storage): boolean {
  try {
    storage.setItem(STORAGE_TEST_KEY, STORAGE_TEST_KEY);
    storage.removeItem(STORAGE_TEST_KEY);
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if localStorage is available and writable in the current context.
 * Returns false in browsers/modes (e.g. some incognito/private modes) where
 * localStorage is disabled or throws (e.g. quota exceeded).
 */
export function isLocalStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.localStorage && isStorageAvailable(window.localStorage);
  } catch {
    return false;
  }
}

/**
 * Check if sessionStorage is available and writable in the current context.
 */
export function isSessionStorageAvailable(): boolean {
  try {
    return typeof window !== 'undefined' && !!window.sessionStorage && isStorageAvailable(window.sessionStorage);
  } catch {
    return false;
  }
}

/**
 * Whether the app is currently relying on sessionStorage as a fallback
 * because localStorage is unavailable (commonly the case in incognito/
 * private browsing mode). Consumers can use this to show a warning that
 * the session will not persist across browser restarts.
 */
export function isUsingSessionFallback(): boolean {
  return !isLocalStorageAvailable() && isSessionStorageAvailable();
}

/**
 * Store JWT token, preferring localStorage and falling back to
 * sessionStorage if localStorage is unavailable (e.g. incognito mode).
 */
export function setJWTToken(token: string): void {
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.setItem(JWT_TOKEN_KEY, token);
      return;
    } catch {
      // Fall through to sessionStorage fallback below.
    }
  }

  if (isSessionStorageAvailable()) {
    try {
      window.sessionStorage.setItem(JWT_TOKEN_KEY, token);
      return;
    } catch {
      // Both storages failed; nothing more we can do here.
    }
  }
}

/**
 * Retrieve JWT token, checking localStorage first and then falling back
 * to sessionStorage.
 */
export function getJWTToken(): string | null {
  if (isLocalStorageAvailable()) {
    try {
      const token = window.localStorage.getItem(JWT_TOKEN_KEY);
      if (token) return token;
    } catch {
      // Ignore and try sessionStorage below.
    }
  }

  if (isSessionStorageAvailable()) {
    try {
      return window.sessionStorage.getItem(JWT_TOKEN_KEY);
    } catch {
      return null;
    }
  }

  return null;
}

/**
 * Clear JWT token from both localStorage and sessionStorage.
 */
export function clearJWTToken(): void {
  if (isLocalStorageAvailable()) {
    try {
      window.localStorage.removeItem(JWT_TOKEN_KEY);
    } catch {
      // Ignore.
    }
  }

  if (isSessionStorageAvailable()) {
    try {
      window.sessionStorage.removeItem(JWT_TOKEN_KEY);
    } catch {
      // Ignore.
    }
  }
}

/**
 * Get Authorization header with JWT token
 */
export function getAuthorizationHeader(): { Authorization: string } | {} {
  const token = getJWTToken();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}
