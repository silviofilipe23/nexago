const MAX_LEN = 2048;

export interface SanitizeReturnUrlOptions {
  /**
   * Origens HTTPS (ou HTTP em dev) explícitas. Se `redirect` for URL absoluta, só aceita se
   * `new URL(redirect).origin` estiver nesta lista; o retorno vira sempre path+search+hash interno.
   *
   * Ex.: ['https://app.nexago.com', 'https://nexago.com']
   */
  trustedOrigins?: readonly string[];
}

function blocksEntrarPath(pathWithQuery: string): boolean {
  return pathWithQuery === '/entrar' || pathWithQuery.startsWith('/entrar?');
}

/**
 * Evita open redirect: paths relativos ao site atual ou URLs absolutas só em origens confiáveis.
 */
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
    if (blocksEntrarPath(path)) {
      return fallback;
    }
    return path;
  }

  if (!t.startsWith('/') || t.startsWith('//')) {
    return fallback;
  }
  if (blocksEntrarPath(t)) {
    return fallback;
  }
  return t;
}
