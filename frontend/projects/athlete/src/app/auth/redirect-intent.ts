/** Fallback quando a URL de login não traz `?redirect=` (ex.: abriu /entrar depois). */
export const ATHLETE_REDIRECT_INTENT_KEY = 'nexago-athlete-redirect-intent';

export function persistRedirectIntent(fullPathWithQuery: string): void {
  try {
    if (fullPathWithQuery.startsWith('/')) {
      localStorage.setItem(ATHLETE_REDIRECT_INTENT_KEY, fullPathWithQuery);
    }
  } catch {
    /* modo privado / quota */
  }
}

export function takeRedirectIntent(): string | null {
  try {
    const v = localStorage.getItem(ATHLETE_REDIRECT_INTENT_KEY);
    if (v) {
      localStorage.removeItem(ATHLETE_REDIRECT_INTENT_KEY);
    }
    return v;
  } catch {
    return null;
  }
}
