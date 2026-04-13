const MAX_LEN = 2048;

export interface SanitizeReturnUrlOptions {
  trustedOrigins?: readonly string[];
}

function blocksAuthPath(pathWithQuery: string): boolean {
  return (
    pathWithQuery === '/entrar' ||
    pathWithQuery.startsWith('/entrar?') ||
    pathWithQuery === '/cadastro' ||
    pathWithQuery.startsWith('/cadastro?')
  );
}

export function sanitizeReturnUrl(
  raw: string | null | undefined,
  fallback = '/',
  options?: SanitizeReturnUrlOptions,
): string {
  if (raw == null || raw === '') {
    return fallback;
  }
  const t = raw.trim();
  if (t.length > MAX_LEN || /[\r\n]/.test(t)) {
    return fallback;
  }

  if (t.includes('://')) {
    const trusted = options?.trustedOrigins ?? [];
    if (trusted.length === 0) {
      return fallback;
    }
    let u: URL;
    try {
      u = new URL(t);
    } catch {
      return fallback;
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') {
      return fallback;
    }
    if (!trusted.includes(u.origin)) {
      return fallback;
    }
    const path = `${u.pathname}${u.search}${u.hash}` || '/';
    if (blocksAuthPath(path)) {
      return fallback;
    }
    return path;
  }

  if (!t.startsWith('/') || t.startsWith('//')) {
    return fallback;
  }
  if (blocksAuthPath(t)) {
    return fallback;
  }
  return t;
}
