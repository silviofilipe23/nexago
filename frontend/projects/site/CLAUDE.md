# nexaGO — Site (Web público)

> Este projeto é **Angular 20**, mesmo stack dos outros `projects/` do workspace (standalone
> components, signals, zoneless). Migrado do Next.js/React em 4 fases — o código anterior
> vive em `frontend/projects/site-legacy` (arquivado, não editar). Nada de JSX, `next/*` ou
> Server Components aqui.

## O que é
Site público do ecossistema nexaGO — app multiesporte (vôlei de praia e de quadra, futevôlei, beach tennis, tênis, padel e mais) para reservar quadra, jogar torneios e ligas e acompanhar ranking. O site cumpre **dois papéis**:

1. **Landing / marketing** — a home existe para levar o visitante a **baixar o app** (App Store / Google Play); ver "Home — Dia de jogo" abaixo.
2. **Hub público dinâmico** — conteúdo aberto vindo do Firestore: rankings, torneios/etapas, arenas, ligas, mini-sites de arena e páginas de link, e perfis públicos.

## Stack
- **Framework**: Angular 20, standalone components, **zoneless** (sem `zone.js`), signals para estado local, `computed()` para estado derivado
- **CSR puro, sem SSR/SSG** — cada visita busca dados do Firestore direto no navegador (`firebase/firestore/lite`). Decisão deliberada da migração: mesmo padrão dos outros apps do workspace, em troca de perder HTML pré-renderizado por rota (ver seção SEO abaixo pra como isso é compensado)
- **Estilo**: Tailwind CSS v4 (`@theme` em `src/styles/tokens.scss`, mesmos valores 1:1 do site antigo)
- **Animação**: **GSAP + ScrollTrigger** para cenas de scroll (home, heroes de torneio/liga/arena — `afterNextRender` + `gsap.context()` + cleanup via `DestroyRef`); `RevealDirective` (`[nxReveal]`) para reveal-on-scroll simples via `IntersectionObserver` puro — não há Framer Motion aqui (era React-only), tudo virou GSAP ou CSS transitions
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
      home/sections/       # seções da home (ver "Home — Dia de jogo") + as reaproveitadas por /arenas e /ligas
      baixar/              # /baixar: manda cada aparelho à loja certa; no desktop mostra lojas + QR
      torneios/ ligas/ arenas/ arena/  # hub público (listagem + detalhe), dados reais do Firestore
      s/                    # mini-site de arena (/s/{slug}) — tema dinâmico por arena
      a/ o/ link-bio/       # link-in-bio de arena/organizador — componente único compartilhado
      docs/                 # documentação (54 recursos, 3 audiências) — busca + sidebar scrollspy
      blog/                 # /blog e /blog/:slug: posts do backoffice (Firestore `blogPosts`) + estáticos antigos de lib/blog/posts.ts
    shared/
      hub/                  # StatusBadge, ArenaCard, filter-controls — compartilhados entre páginas do hub
      ui/                   # ButtonDirective, DownloadCta, DownloadQr, PhoneFrame, StoreButtons (blog), ToastService, ThemeToggle
      layout/               # SiteHeader, SiteFooter
      reveal.directive.ts
      replay-animation.directive.ts  # [nxReplay]: toca de novo a animação CSS quando o valor muda
  lib/
    firestore/              # repositórios de leitura (tournaments, arenas, leagues, arena-sites, link-pages, blog, store-showcase, rankings)
    blog/                   # posts estáticos antigos, categorias (6 de origem ⊕ `blogCategories`, categories.ts) e a junção com os do Firestore (feed.ts)
    docs/                   # tipos + conteúdo da documentação (types.ts é o contrato entre shell e conteúdo)
    slug.ts                 # toSlugId/extractId — URLs "nome-decorativo-id"
    format.ts               # sportLabel, formatDate, STATUS_META
  styles/tokens.scss        # fonte da verdade dos design tokens (@theme do Tailwind)
public/
  brand/                    # logo oficial
  app/                      # screenshots reais do app (docs)
  img/home/                 # fotos, pôsteres e vídeo da home: {nome}-{largura}.webp, hero.mp4, hero-m.mp4, og.jpg
  .htaccess                 # SPA rewrite + regra de bot pra prévia de OG (ver Deploy)
```

## Marca & Design Tokens
**Fonte da verdade:** `src/styles/tokens.scss` (portado 1:1 de `brand_assets/NexaGO Design Doc _standalone_.html`, preservado em `site-legacy/`). Dark-first, laranja `#FF6A1A` como accent. Tema claro existe (`[data-theme='light']`) mas é secundário — a marca é dark-first.

Regras de cor: tokens semânticos sempre (`bg-brand`, `text-fg`, nunca hex cru); `live`/`pending`/`win` sempre acompanhados de ícone/label, nunca só cor.

Exceção: cor de categoria do blog criada no backoffice (`blogCategories/{id}.color`/`colorLight`) é dado dinâmico em hex — entra só como custom property no elemento (`BlogCategoryChip`: `--cat-dark`/`--cat-light`, o tema escolhe; `BlogCover`: tom escuro na arte). As 6 de origem usam os tokens `--color-cat-*` (fora do `@theme`, em `:root`, para sempre saírem no CSS).

## Home — Dia de jogo
A home é um dia de jogo contado de cima para baixo, e tudo termina no download:

1. `Opening` — a arena ao anoitecer em vídeo (laço mudo de 7 s; o pôster é o 1º quadro do laço), título "Hoje tem jogo." com a data de quem lê, `DownloadCta` e QR. `SportsTicker` fecha a primeira tela.
2. `MatchPoint` — a cena-assinatura: os últimos pontos de uma semifinal jogados pela rolagem (ScrollTrigger com pin). A rolagem só escolhe o `beat`; o que aparece em cada um é template guiado por signal. Sequência e regras em `match-point-beats.ts` (com spec). Confete (`canvas-confetti`, import dinâmico) só ao chegar na vitória.
3. `GameDay` — quatro horários (07:40 reservar, 12:30 galera, 16:50 torneio, 19:10 ranking), cada um com foto e um recorte de tela do app desenhado em HTML.
4. Dados reais do Firestore (`TorneiosDestaqueSection`, `ArenasCarouselSection`), `AudienceDoors` (organizadores/arenas), FAQ e `FinalCall`. `StickyDownload` é a barra de download do celular.

Regras que valem só aqui:
- **Download**: todo "Baixar o app" do site vai para `/baixar` (`DOWNLOAD_PATH`), que detecta o aparelho (`lib/platform.ts`) e redireciona; `DownloadCta` mostra só a loja do aparelho no celular e as duas no desktop. O QR (`lib/download-qr.ts`) é um caminho SVG fixo de `https://nexago.com.br/baixar` — mudou o endereço, gere de novo.
- **Tipografia**: `--font-athletic` (Archivo, variável em largura) em três vozes — `.nx-shout` (chamada em caixa alta, itálica, estreita), `.nx-title` (título calmo) e `.nx-score` (numeral de placar). Dentro de `.nx-home`, `font-display` também vira Archivo; o resto do site segue em Sora.
- **`.nx-night`**: trecho sobre foto/vídeo (e a UI do app no celular) é sempre escuro, em qualquer tema — a classe redeclara os tokens escuros no elemento. Fora dela a home segue o tema.
- **Cor**: `sand` (areia) é a segunda cor, para horários e contornos; ação continua sendo só o laranja.
- **Imagens**: `NgOptimizedImage` com o loader `HOME_IMAGE_LOADER` (`lib/home-images.ts`) no `providers` da página — `ngSrc="hero"` + `ngSrcset="960w, 1920w"` vira `img/home/hero-960.webp`. Fotos e vídeo foram gerados por IA; conferir logos/textos inventados antes de trocar alguma.
- **Movimento**: só a entrada do título (CSS) toca sozinha; o resto responde à rolagem. `prefers-reduced-motion` tira o vídeo, o pin e as paralaxes. Seções com ScrollTrigger ficam **antes** das que carregam dados, para a altura que chega depois não deslocar gatilho.
- Nomes de atletas, arena e torneio nas telas desenhadas são fictícios; números (ex.: +50 XP por vitória em torneio) são os reais do app.

## Dados (Firestore)
- Config em `@nexago/firebase-config` (projeto `volley-track-dev-4596c` — mesmo projeto dev usado pelos outros apps Angular do workspace). Chaves de cliente não são secretas; a segurança vive nas `firestore.rules`.
- Apenas **leitura pública** (+ escrita pública nos formulários: contato, waitlist/lead, tracking de clique em link page). Repositórios em `src/lib/firestore/*.ts` — componentes não falam direto com o SDK.
- **Coleções lidas**: `tournaments`, `leagues`, `arenas` (+ subcoleção `courts`), `arenaSitesPublic` (mini-sites), `linkPageSlugs`/`linkPages` (+ subcoleção `links`), `blogPosts` (sempre com `status == 'published'` + `channels.site == true`; `author.photoUrl` quando o post tem autor cadastrado; corpo é texto puro, renderizado por binding escapado, nunca `[innerHTML]`; os blocos Torneio/Produto/Vídeo/Arena/Ranking leem o torneio, `storeShowcase/{id}` e `arenas/{id}` ao vivo e somem se o doc não existir ou não for público — componentes em `pages/blog/blocks/`), `blogCategories` (rótulo/cor/ordem/ativa, mesclado com as 6 de origem — `lib/firestore/blog-categories.ts`; falha = só as de origem), `public_profiles` e `artifacts/{projectId}/public/data/{athleteRankingsBySport,teamRankingsBySport,teams}` (bloco Ranking — espelho do ranking do app em `lib/firestore/rankings.ts`, com o custo do filtro de gênero documentado lá). Ver cada arquivo em `lib/firestore/` pro mapeamento exato de campos — a lógica de status de torneio (`tournament-status.ts`) é particularmente não-trivial, não reescrever sem entender o porquê de cada decisão (comentado no arquivo).
- Padrão de fetch: `signal` + `loading` + `.then()` no `constructor()`, ou `effect()` quando o dado depende de um `input()` de rota (o Router reaproveita a mesma instância entre navegações do mesmo padrão de rota — precisa de guarda de obsolescência, ver `liga-detail.page.ts` como referência).

## SEO — sem SSR, compensado por uma Cloud Function
CSR puro significa que bots que não executam JS (WhatsApp, Twitter, Facebook, LinkedIn, Slack, Telegram, Discord) nunca veem os `<meta>` que a página gera depois de montar. Solução: `functions/src/site-og-preview.ts` — uma Cloud Function que lê o Firestore direto (Admin SDK) e devolve HTML só com as meta tags certas (título, descrição, `og:image` usando a foto/logo real já salva no doc). O `.htaccess` redireciona **só User-Agents de bot conhecido** pra essa função nas rotas dinâmicas (`/torneios/:id`, `/ligas/:slug`, `/arena/:id`, `/s/:slug`, `/a/:slug`, `/o/:slug`, `/blog/:slug`); visitante humano nunca bate nessa regra.

Páginas estáticas (landing, `/torneios`, `/ligas`, `/arenas`, `/rankings`, `/docs`, `/blog`) não precisam disso — o `<title>`/`<meta>` genérico do `index.html` já é suficiente pra elas. `/blog/:slug` também passa pela `siteOgPreview` (fase 2 do blog: título · Blog nexaGO, `seoDescription`/subtítulo, capa); no navegador a página troca `<title>`/meta description/JSON-LD por conta própria.

Endereço: o `.htaccess` aponta para a function do **DEV em São Paulo** (`https://southamerica-east1-volley-track-dev-4596c.cloudfunctions.net/siteOgPreview`) — o endereço antigo (us-central1 do prod) respondia 404 em todas as rotas.

## Deploy
1. `npm run build:site` (a partir de `frontend/`) → gera `dist/site/browser/`.
2. Sobe o conteúdo de `dist/site/browser/` pro Hostinger via FTP/hPanel (mesmo processo manual do site antigo — mas agora é **muito mais simples**: um `index.html` + assets com hash, sem pastas por rota, porque é SPA pura — o roteamento client-side elimina o problema antigo de "torneio criado depois do build dá 404").
3. Cloud Function `siteOgPreview` precisa estar deployada (`cd functions && npm run deploy` ou `firebase deploy --only functions:siteOgPreview`) **antes** de publicar um `.htaccess` que referencie sua URL — confirme a URL real impressa pelo Firebase CLI e atualize o placeholder no `.htaccess` se divergir do alias padrão.
4. `firebase.json` já tem o hosting target `site` preparado (`dist/site/browser` + rewrite-all-to-index.html) caso o Firebase Hosting volte a ser usado no lugar do Hostinger.

## Skills & Plugins
Os skills de design do site antigo (`ui-ux-pro-max`, `brand`, `banner-design` etc.) ficaram em `site-legacy/.claude/skills/` — eram scoped ao workflow React/Next daquele projeto. Este app segue o mesmo fluxo de UI dos outros apps Angular do workspace, sem skill dedicado.

## Princípios (do projeto)
Simplicidade, legibilidade, escalabilidade, baixo acoplamento, alta coesão. Preservar retrocompatibilidade e nunca quebrar regras de negócio.
