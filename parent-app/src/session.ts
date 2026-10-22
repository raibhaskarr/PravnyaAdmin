// Minimal localStorage-backed session -- just the token, nothing else cached client-side. Home
// always re-fetches /parent-auth/me fresh rather than trusting a stale cached profile.
const STORAGE_KEY = "pravnya_parent_token";

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, token);
  } catch {
    // Private-browsing/storage-disabled: session just won't survive a reload. Not fatal.
  }
}

export function clearStoredToken(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // no-op
  }
}
