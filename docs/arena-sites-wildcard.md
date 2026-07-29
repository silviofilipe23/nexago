# Mini-sites de arena — wildcard `{slug}.nexago.com.br` (fase 4)

Como servir o mini-site de cada arena num subdomínio próprio, sem criar um
site/domínio no Firebase por arena.

## Como funciona

```
{slug}.nexago.com.br
        │  DNS wildcard + TLS terminam no Cloudflare
        ▼
Cloudflare Worker (infra/cloudflare/arena-sites-worker.js)
        │  encaminha para a origem do site Next, com X-Forwarded-Host = host original
        ▼
Firebase Hosting (target site → site-4af00.web.app)
        │  função SSR do Next
        ▼
proxy do Next (frontend/projects/site/src/proxy.ts)
        │  raiz do subdomínio → rewrite interno /s/{slug}
        │  outros paths → redirect 308 para nexago.com.br{path}
        ▼
página /s/{slug} (arenaSitesPublic + seções automáticas, ISR 5min)
```

O código (proxy do Next + worker) já está pronto e é inerte até a infra
existir: sem o wildcard no DNS, nenhum request chega com host de tenant.

## Setup no Cloudflare (passo a passo, uma vez)

1. **Criar a zona**: conta no Cloudflare (plano Free basta) → "Add a site" →
   `nexago.com.br`. O Cloudflare importa parte dos records automaticamente.
2. **Replicar TODOS os records atuais da Hostinger** antes de trocar os
   nameservers — na Hostinger (hPanel → DNS) exporte/anote cada record e
   recrie na zona do Cloudflare. Hoje incluem, no mínimo:
   - `atleta` → CNAME `athlete-dev2.web.app`
   - `arena` → CNAME `arena-4eb12.web.app`
   - `organizador` → CNAME `organizer-dev2.web.app`
   - `backoffice` → A/CNAME (aponta pro hosting de prod)
   - raiz `@` (site) e o TXT `firebase=volley-track-dev-4596c`
   - quaisquer MX/TXT de e-mail existentes.
   **Importante**: deixe os subdomínios já conectados ao Firebase Hosting como
   **DNS only (nuvem cinza)** — proxied (nuvem laranja) quebra a renovação de
   certificado do Firebase para esses hosts.
3. **Trocar os nameservers** no registro do domínio (Hostinger/registro.br)
   pelos dois que o Cloudflare indicar. Propagação: minutos a horas.
4. **Criar o record wildcard**: `*` → CNAME `site-4af00.web.app`, **Proxied
   (nuvem laranja)** — o destino é irrelevante (o worker sobrescreve a origem),
   mas a nuvem laranja é obrigatória para o TLS wildcard e o worker rodarem.
   O Universal SSL do Cloudflare já cobre `*.nexago.com.br` de primeiro nível.
5. **Publicar o worker**: Workers & Pages → Create Worker → colar
   `infra/cloudflare/arena-sites-worker.js` (conferir `SITE_ORIGIN` — prod é
   `https://site-4af00.web.app`). Deploy.
6. **Rotear o worker**: no site `nexago.com.br` → Workers Routes → Add route:
   `*.nexago.com.br/*` → o worker. (A raiz `nexago.com.br/*` fica FORA da
   rota — só subdomínios passam pelo worker; os reservados ele deixa passar.)
7. **Testar**: publicar um mini-site pelo painel (ex.: slug `arena-teste`) e
   abrir `https://arena-teste.nexago.com.br` — deve renderizar o mesmo
   conteúdo de `https://nexago.com.br/s/arena-teste`.
   `https://arena-teste.nexago.com.br/rankings` deve redirecionar (308) para
   `https://nexago.com.br/rankings`.

## Decisões e cuidados

- **Canonical continua `nexago.com.br/s/{slug}`** (definido em
  `app/s/[slug]/page.tsx`) — o subdomínio é um alias de entrada; uma URL
  canônica só evita conteúdo duplicado no Google. Se o produto decidir que o
  subdomínio é o endereço oficial, inverter o canonical nessa hora.
- **Slugs reservados**: a lista de subdomínios de infra/portais está espelhada
  em 3 lugares — function `publishArenaSite`, `arena-site.model.ts` (painel) e
  `proxy.ts` (site) + worker. Alterou um, altere os quatro.
- **Site de prod aponta pro Firebase de dev** (problema conhecido de config) —
  o wildcard não muda isso; a origem do worker é o hosting, não o backend.
- **Enquanto o serving do projeto dev estiver suspenso** (incidente Safe
  Browsing de 28/07), os CNAMEs de dev acima respondem "Site Not Found" — o
  wildcard de mini-site usa a origem de PROD e não é afetado.
- Custo: plano Free do Cloudflare cobre DNS, TLS wildcard e o worker
  (100k requests/dia) com folga para o estágio atual.
