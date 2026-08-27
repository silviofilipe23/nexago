import { NextResponse, type NextRequest } from 'next/server';

/**
 * Multi-tenant por subdomínio (fase 4 do mini-site de arena):
 * `{slug}.nexago.com.br` → rewrite interno para `/s/{slug}`.
 *
 * O tráfego chega via proxy com wildcard na frente do Firebase Hosting
 * (ver docs/arena-sites-wildcard.md) — o proxy encaminha para a origem
 * `*.web.app` preservando o host original em `X-Forwarded-Host`, por isso
 * esse header tem prioridade sobre `Host`. Sem proxy configurado, nada
 * muda: hosts que não são subdomínio de tenant passam direto.
 */

const BASE_DOMAIN = 'nexago.com.br';

/** Subdomínios que nunca são tenant: portais, infra e rotas do próprio site.
 *  Mantém correspondência com RESERVED_SLUGS da function `publishArenaSite`. */
const RESERVED_SUBDOMAINS = new Set([
  'www', 'a', 'o', 'api', 'app', 'admin', 'arena', 'arenas', 'atleta', 'athlete',
  'backoffice', 'blog', 'cdn', 'coach', 'contato', 'dev', 'email', 'ftp', 'imap',
  'ligas', 'login', 'mail', 'nexago', 'ns1', 'ns2', 'organizador', 'organizadores',
  'organizer', 'painel', 'pop', 'portal', 'privacidade', 'rankings', 'site', 'smtp',
  'sobre', 'staging', 'static', 'status', 'suporte', 'termos', 'teste', 'torneios',
]);

export function proxy(request: NextRequest) {
  const rawHost = request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? '';
  const host = rawHost.split(':')[0]!.trim().toLowerCase();

  if (!host.endsWith(`.${BASE_DOMAIN}`)) return NextResponse.next();

  const subdomain = host.slice(0, -(BASE_DOMAIN.length + 1));
  if (!subdomain || subdomain.includes('.') || RESERVED_SUBDOMAINS.has(subdomain)) {
    return NextResponse.next();
  }

  const { pathname, search } = request.nextUrl;

  // A raiz do subdomínio é o mini-site; o restante volta pro domínio principal
  // (uma superfície canônica só — evita servir o site inteiro duplicado por tenant).
  if (pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = `/s/${subdomain}`;
    return NextResponse.rewrite(url);
  }
  return NextResponse.redirect(`https://${BASE_DOMAIN}${pathname}${search}`, 308);
}

export const config = {
  // Assets (_next/*, arquivos com extensão) e API ficam fora — o mini-site
  // servido no subdomínio precisa carregar os próprios bundles.
  matcher: ['/((?!_next/|api/|.*\\..*).*)'],
};
