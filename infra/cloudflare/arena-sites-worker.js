/**
 * Worker do Cloudflare para o wildcard dos mini-sites de arena.
 *
 * Rota: `*.nexago.com.br/*` (ver docs/arena-sites-wildcard.md para o setup).
 *
 * O Firebase Hosting não aceita domínio custom wildcard, então o TLS e o DNS
 * de `{slug}.nexago.com.br` terminam no Cloudflare, e este worker encaminha o
 * request para a origem `*.web.app` do site Next preservando o host original
 * em `X-Forwarded-Host` — é esse header que o proxy do Next
 * (frontend/projects/site/src/proxy.ts) usa para reescrever a raiz do
 * subdomínio para `/s/{slug}`.
 *
 * Subdomínios reservados (portais, infra) passam direto (`fetch(request)`),
 * ou seja, seguem o DNS/record próprio de cada um no Cloudflare.
 */

// Origem do site Next no Firebase Hosting. PROD: site-4af00.web.app.
// Ambiente de teste: trocar pela origem do dev (site-3fbe8.web.app).
const SITE_ORIGIN = 'https://site-4af00.web.app';

const BASE_DOMAIN = 'nexago.com.br';

// Espelho da lista do proxy do Next e da function publishArenaSite.
const RESERVED_SUBDOMAINS = new Set([
  'www', 'a', 'o', 'api', 'app', 'admin', 'arena', 'arenas', 'atleta', 'athlete',
  'backoffice', 'blog', 'cdn', 'coach', 'contato', 'dev', 'email', 'ftp', 'imap',
  'ligas', 'login', 'mail', 'nexago', 'ns1', 'ns2', 'organizador', 'organizadores',
  'organizer', 'painel', 'pop', 'portal', 'privacidade', 'rankings', 'site', 'smtp',
  'sobre', 'staging', 'static', 'status', 'suporte', 'termos', 'teste', 'torneios',
]);

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const host = url.hostname.toLowerCase();

    if (!host.endsWith(`.${BASE_DOMAIN}`)) return fetch(request);

    const subdomain = host.slice(0, -(BASE_DOMAIN.length + 1));
    if (!subdomain || subdomain.includes('.') || RESERVED_SUBDOMAINS.has(subdomain)) {
      return fetch(request);
    }

    const origin = new URL(SITE_ORIGIN);
    url.protocol = origin.protocol;
    url.hostname = origin.hostname;
    url.port = '';

    const proxied = new Request(url.toString(), request);
    proxied.headers.set('x-forwarded-host', host);
    return fetch(proxied);
  },
};
