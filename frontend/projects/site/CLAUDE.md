# nexaGO — Site (Web público)

> Este projeto é **Angular 20**, mesmo stack dos outros `projects/` do workspace (standalone
> components, signals, zoneless). Migrado do Next.js/React em 4 fases — o código anterior
> vive em `frontend/projects/site-legacy` (arquivado, não editar). Nada de JSX, `next/*` ou
> Server Components aqui.

## O que é
Site público do ecossistema nexaGO — plataforma de gestão de torneios e ligas de esportes de areia (beach tennis, vôlei de praia). O site cumpre **dois papéis**:

1. **Landing / marketing** — apresentação do app, features, Liga nexaGO, prova social, CTA de download (App Store / Play Store).
2. **Hub público dinâmico** — conteúdo aberto vindo do Firestore: rankings, torneios/etapas, arenas, ligas, mini-sites de arena e páginas de link, e perfis públicos.

## Stack
- **Framework**: Angular 20, standalone components, **zoneless** (sem `zone.js`), signals para estado local, `computed()` para estado derivado
- **CSR puro, sem SSR/SSG** — cada visita busca dados do Firestore direto no navegador (`firebase/firestore/lite`). Decisão deliberada da migração: mesmo padrão dos outros apps do workspace, em troca de perder HTML pré-renderizado por rota (ver seção SEO abaixo pra como isso é compensado)
- **Estilo**: Tailwind CSS v4 (`@theme` em `src/styles/tokens.scss`, mesmos valores 1:1 do site antigo)
- **Animação**: **GSAP + ScrollTrigger** para cenas cinematográficas de scroll (hero, heroes de torneio/liga/arena — `afterNextRender` + `gsap.context()` + cleanup via `DestroyRef`); `RevealDirective` (`[nxReveal]`) para reveal-on-scroll simples via `IntersectionObserver` puro — não há Framer Motion aqui (era React-only), tudo virou GSAP ou CSS transitions
- **Ícones**: sem pacote de ícones — SVGs desenhados à mão no estilo lucide (24×24, stroke), inline nos componentes. Docs tem um lookup central (`DocIcon`, nome kebab-case → SVG)
- **Roteamento**: `@angular/router` com `withComponentInputBinding()` — parâmetros de rota (`:id`, `:slug`) chegam direto como `input.required<string>()`, sem `ActivatedRoute` manual
- **Dados**: Firebase JS SDK **lite** (`firebase/firestore/lite`) — só leitura pública, sem listeners em tempo real. `liteDb` em `src/lib/firebase-lite.ts`. Config compartilhada via `@nexago/firebase-config` (mesmo path alias dos outros apps Angular do workspace)
- **Deploy**: export estático (`ng build site`) pra Hostinger via FTP manual — ver `public/.htaccess` e a seção Deploy abaixo

## Estrutura
```
src/
  app/
    app.ts/.html          # shell — esconde header/footer em /s, /a, /o (mini-sites e link pages)
    app.routes.ts          # todas as rotas, lazy-loaded via loadComponent
    pages/                 # uma pasta por rota — página + seus componentes de apoio
      home/sections/       # ~20 seções da landing, compostas em home.page.ts
      torneios/ ligas/ arenas/ arena/  # hub público (listagem + detalhe), dados reais do Firestore
      s/                    # mini-site de arena (/s/{slug}) — tema dinâmico por arena
      a/ o/ link-bio/       # link-in-bio de arena/organizador — componente único compartilhado
      docs/                 # documentação (54 recursos, 3 audiências) — busca + sidebar scrollspy
      blog/                 # conteúdo estático local, sem CMS
    shared/
      hub/                  # StatusBadge, ArenaCard, filter-controls — compartilhados entre páginas do hub
      ui/                   # ButtonDirective, StoreButtons, ToastService, ThemeToggle
      layout/               # SiteHeader, SiteFooter
      reveal.directive.ts
  lib/
    firestore/              # repositórios de leitura (tournaments, arenas, leagues, arena-sites, link-pages)
    docs/                   # tipos + conteúdo da documentação (types.ts é o contrato entre shell e conteúdo)
    slug.ts                 # toSlugId/extractId — URLs "nome-decorativo-id"
    format.ts               # sportLabel, formatDate, STATUS_META
  styles/tokens.scss        # fonte da verdade dos design tokens (@theme do Tailwind)
public/
  brand/                    # logo oficial
  app/                      # screenshots reais do app (showcase da home + docs)
  .htaccess                 # SPA rewrite + regra de bot pra prévia de OG (ver Deploy)
```

## Marca & Design Tokens
**Fonte da verdade:** `src/styles/tokens.scss` (portado 1:1 de `brand_assets/NexaGO Design Doc _standalone_.html`, preservado em `site-legacy/`). Dark-first, laranja `#FF6A1A` como accent. Tema claro existe (`[data-theme='light']`) mas é secundário — a marca é dark-first.

Regras de cor: tokens semânticos sempre (`bg-brand`, `text-fg`, nunca hex cru); `live`/`pending`/`win` sempre acompanhados de ícone/label, nunca só cor.

## Dados (Firestore)
- Config em `@nexago/firebase-config` (projeto `volley-track-dev-4596c` — mesmo projeto dev usado pelos outros apps Angular do workspace). Chaves de cliente não são secretas; a segurança vive nas `firestore.rules`.
- Apenas **leitura pública** (+ escrita pública nos formulários: contato, waitlist/lead, tracking de clique em link page). Repositórios em `src/lib/firestore/*.ts` — componentes não falam direto com o SDK.
- **Coleções lidas**: `tournaments`, `leagues`, `arenas` (+ subcoleção `courts`), `arenaSitesPublic` (mini-sites), `linkPageSlugs`/`linkPages` (+ subcoleção `links`). Ver cada arquivo em `lib/firestore/` pro mapeamento exato de campos — a lógica de status de torneio (`tournament-status.ts`) é particularmente não-trivial, não reescrever sem entender o porquê de cada decisão (comentado no arquivo).
- Padrão de fetch: `signal` + `loading` + `.then()` no `constructor()`, ou `effect()` quando o dado depende de um `input()` de rota (o Router reaproveita a mesma instância entre navegações do mesmo padrão de rota — precisa de guarda de obsolescência, ver `liga-detail.page.ts` como referência).

## SEO — sem SSR, compensado por uma Cloud Function
CSR puro significa que bots que não executam JS (WhatsApp, Twitter, Facebook, LinkedIn, Slack, Telegram, Discord) nunca veem os `<meta>` que a página gera depois de montar. Solução: `functions/src/site-og-preview.ts` — uma Cloud Function que lê o Firestore direto (Admin SDK) e devolve HTML só com as meta tags certas (título, descrição, `og:image` usando a foto/logo real já salva no doc). O `.htaccess` redireciona **só User-Agents de bot conhecido** pra essa função nas rotas dinâmicas (`/torneios/:id`, `/ligas/:slug`, `/arena/:id`, `/s/:slug`, `/a/:slug`, `/o/:slug`); visitante humano nunca bate nessa regra.

Páginas estáticas (landing, `/torneios`, `/ligas`, `/arenas`, `/rankings`, `/docs`, `/blog`) não precisam disso — o `<title>`/`<meta>` genérico do `index.html` já é suficiente pra elas.

## Deploy
1. `npm run build:site` (a partir de `frontend/`) → gera `dist/site/browser/`.
2. Sobe o conteúdo de `dist/site/browser/` pro Hostinger via FTP/hPanel (mesmo processo manual do site antigo — mas agora é **muito mais simples**: um `index.html` + assets com hash, sem pastas por rota, porque é SPA pura — o roteamento client-side elimina o problema antigo de "torneio criado depois do build dá 404").
3. Cloud Function `siteOgPreview` precisa estar deployada (`cd functions && npm run deploy` ou `firebase deploy --only functions:siteOgPreview`) **antes** de publicar um `.htaccess` que referencie sua URL — confirme a URL real impressa pelo Firebase CLI e atualize o placeholder no `.htaccess` se divergir do alias padrão.
4. `firebase.json` já tem o hosting target `site` preparado (`dist/site/browser` + rewrite-all-to-index.html) caso o Firebase Hosting volte a ser usado no lugar do Hostinger.

## Skills & Plugins
Os skills de design do site antigo (`ui-ux-pro-max`, `brand`, `banner-design` etc.) ficaram em `site-legacy/.claude/skills/` — eram scoped ao workflow React/Next daquele projeto. Este app segue o mesmo fluxo de UI dos outros apps Angular do workspace, sem skill dedicado.

## Princípios (do projeto)
Simplicidade, legibilidade, escalabilidade, baixo acoplamento, alta coesão. Preservar retrocompatibilidade e nunca quebrar regras de negócio.
