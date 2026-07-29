# nexaGO — Site (Web público)

> **Atenção:** este projeto é **Next.js + React**, NÃO Angular. Estas instruções **sobrepõem** o `frontend/.claude/CLAUDE.md` (que é guia Angular e se aplica aos outros `projects/`). Nada de Angular, signals, `inject()` ou `@Component` aqui.

## O que é
Site público do ecossistema nexaGO — plataforma de gestão de torneios e ligas de esportes de areia (beach tennis, vôlei de praia). O site cumpre **dois papéis**:

1. **Landing / marketing** — apresentação do app, features, Liga nexaGO, prova social, CTA de download (App Store / Play Store).
2. **Hub público dinâmico** — conteúdo aberto vindo do Firestore: rankings, torneios/etapas e perfis públicos de atletas e arenas.

## Stack
- **Framework**: Next.js (App Router) + React + TypeScript (`strict`)
- **Estilo**: Tailwind CSS v4 (`@theme`/CSS variables, alinhado ao restante do workspace)
- **Animação**: **GSAP + ScrollTrigger** para cenas cinematográficas de scroll (pin/scrub); **Framer Motion** (`motion/react`) para microinterações e reveals de componente
- **Compat shadcn**: `cn()` em `src/lib/utils.ts` (clsx + tailwind-merge), componentes reutilizáveis em `src/components/ui/`, e aliases de token `--color-background/foreground/muted-foreground` no `@theme` para componentes shadcn/21st.dev caírem direto
- **Fontes**: Sora (display/títulos), Inter (UI/texto), JetBrains Mono (dados/código)
- **Ícones**: Lucide ou Phosphor (`@phosphor-icons/react`) — sempre SVG, nunca emoji como ícone estrutural
- **Dados**: Firebase JS SDK (Firestore, modular `firebase/firestore`) — somente leitura pública
- **Deploy**: estático/SSR para conteúdo público (a definir)

> O restante de `frontend/` é um monorepo Angular 20. Este site é um projeto **separado**, com seu próprio `package.json` e toolchain. A entrada `"site"` no `angular.json` da raiz é legado e deve ser removida quando o scaffold Next.js entrar.

## Estrutura (App Router)
```
src/
  app/                  # rotas (App Router)
    (marketing)/        # landing, features, liga, download
    rankings/           # ranking público
    torneios/           # torneios e etapas
    [outras rotas públicas]
  components/
    ui/                 # primitivos reutilizáveis (Button, Card, Badge…)
    sections/           # blocos de landing (Hero, Features, CTA…)
    motion/             # wrappers de animação (Reveal, Stagger…)
  lib/
    firebase.ts         # init do Firebase (client)
    [repositórios de leitura do Firestore]
  styles/
    globals.css         # @theme + tokens
public/
  brand/                # logo e assets oficiais da marca
```

## Marca & Design Tokens
**Fonte da verdade:** `brand_assets/NexaGO Design Doc _standalone_.html` (design system completo, renderizável). Apoio: `NexaGO — Mobile Design Documentation.pdf` e `nexaGO_Logo.png`. **Use sempre os assets oficiais** com proporções e clear space corretos.

**Direção visual: dark mode com laranja da marca como accent primário.** Energia atlética, areia, movimento. Tokens abaixo transcritos do design doc (prefixo `--nx-*` no doc; aqui mapeados para `@theme` do Tailwind):

```css
@theme {
  /* Marca — escala laranja */
  --color-brand:        #FF6A1A; /* orange-500, accent oficial */
  --color-brand-light:  #FF8A4A; /* orange-400 */
  --color-brand-dark:   #E5560E; /* orange-600 */
  --color-brand-tint:   rgba(255, 106, 26, 0.12);
  --color-on-brand:     #0A0A0A; /* texto sobre laranja */

  /* Superfícies (dark) */
  --color-bg:           #050505;
  --color-surface-0:    #0B0B0C;
  --color-surface-1:    #131316;
  --color-surface-2:    #1B1B1F;
  --color-glass:        rgba(20, 20, 22, 0.62);
  --color-line:         rgba(255, 255, 255, 0.08);
  --color-line-strong:  rgba(255, 255, 255, 0.16);

  /* Texto */
  --color-fg:           #F4F4F5;
  --color-text-mute:    rgba(244, 244, 245, 0.62);
  --color-text-dim:     rgba(244, 244, 245, 0.40);

  /* Estados semânticos */
  --color-live:         #FF3B30;
  --color-pending:      #F4C543;
  --color-win:          #2BD17E;

  /* Tipografia */
  --font-display: 'Sora', system-ui, sans-serif;
  --font-ui:      'Inter', system-ui, sans-serif;
  --font-mono:    'JetBrains Mono', ui-monospace, monospace;

  /* Raios */
  --radius-1: 6px;  --radius-2: 10px; --radius-3: 14px;
  --radius-4: 18px; --radius-5: 24px; --radius-pill: 999px;

  /* Spacing (base 4) */
  --space-1: 4px;  --space-2: 8px;  --space-3: 12px; --space-4: 16px;
  --space-5: 20px; --space-6: 24px; --space-7: 32px; --space-8: 40px; --space-9: 56px;

  /* Elevação */
  --elev-1: 0 1px 0 rgba(255,255,255,0.04) inset, 0 1px 2px rgba(0,0,0,0.40);
  --elev-2: 0 1px 0 rgba(255,255,255,0.05) inset, 0 8px 24px rgba(0,0,0,0.55);
  --elev-3: 0 1px 0 rgba(255,255,255,0.06) inset, 0 24px 60px rgba(0,0,0,0.65);
  --glow-orange: 0 0 0 1px rgba(255,106,26,0.30), 0 12px 40px rgba(255,106,26,0.25);

  /* Motion */
  --motion-fast: 140ms;
  --motion-base: 240ms;
  --motion-slow: 420ms;
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
}
```

Regras de cor:
- Tokens semânticos sempre — **nunca hex cru em componentes**.
- Laranja é destaque/CTA, não fundo de páginas inteiras. Texto sobre laranja usa `--color-on-brand` (`#0A0A0A`), nunca branco.
- `live`/`pending`/`win` são funcionais — sempre acompanhe de ícone/label, nunca só cor.
- Base é **dark** (a marca é dark-first); não introduza light mode sem alinhar com o design doc.

## Animação
**Duas ferramentas, papéis distintos:**
- **GSAP + ScrollTrigger** — cenas cinematográficas de scroll (pin + scrub, timelines complexas). Ex.: `components/ui/cinematic-hero.tsx`. Registrar plugin guardado por `typeof window !== 'undefined'`; sempre `gsap.context()` + `ctx.revert()` no cleanup; checar `prefers-reduced-motion` e pular a timeline.
  - **Esconder-para-animar via `.js`, não CSS-sempre**: o hide inicial usa `html.js .gsap-reveal { visibility:hidden }`. A classe `.js` é adicionada por um script inline pré-paint no `layout.tsx`. Assim, sem JS (ou crawler sem script) o conteúdo do hero fica visível — resiliência + SEO. Reduced-motion mantém visível via `!important`.
- **Framer Motion** (`motion/react`) — microinterações, hovers e reveals de seção. Wrappers em `components/motion/` (ex.: `Reveal`), não espalhe `motion.div` solto.

Regras comuns:
- Use os tokens de motion: `--motion-fast/base/slow`, `--ease-out` (entradas/UI) e `--ease-spring` (gestos/destaques físicos).
- Micro-interações **150–300ms**; transições complexas ≤420ms. Anime **só `transform`/`opacity`** (nunca width/height/top/left).
- Entrada `ease-out`, saída mais curta (~60–70% da entrada). Use spring para naturalidade onde o doc pedir movimento "atlético".
- Stagger de listas/grids 30–50ms por item. Máx. 1–2 elementos animados em destaque por viewport.
- **Sempre respeitar `prefers-reduced-motion`** — use `useReducedMotion()` e desligue/reduza. Conteúdo deve ser legível sem animação.
- Scroll reveal com `whileInView` + `viewport={{ once: true }}`.

## Dados (Firestore)
- Config de cliente em `src/lib/firebase.ts` (projeto `volley-track-dev-4596c`). Chaves de cliente não são secretas; a segurança vive nas `firestore.rules`.
- Apenas **leitura de dados públicos**. Nada de escrita, auth de usuário ou dados sensíveis no site.
- Repositórios em `src/lib/firestore/` — componentes **não** falam direto com o SDK. Server Components leem via repositório; páginas usam **ISR** (`export const revalidate = 300`). Repositórios fazem `try/catch` retornando vazio (build não quebra) e tratam Timestamp via `.toDate()`.

**Coleções públicas verificadas** (`allow read: if true`):
- `tournaments/{id}` — torneios/etapas. Filtrar por `visibility === 'publicListing'`. Campos: `name`, `description`, `sport` (`beachTennis`|`beachVolleyball`), `city`/`state`/`locationName`, `dateLabel`, `startAt`/`endAt` (Timestamp), `categories[]` (`categoryName`/`genderType`/`level`/`entryFeeCents`/`spotsTotal`), `listingStatus` (`open`|`almost_full`|`live`|`ended`), `liveMatchesNow`, `enrolledCount`, `leagueId`/`leagueStageName`.
- `leagues/{id}` — `stages[]` com `tournamentIds`, `seasonLabel`.
- `artifacts/volley-track-dev-4596c/public/data/{teams,athleteRankings,teamRankings,tournamentCategoryResults,leagueAthleteRankings,leagueTeamRankings}` — base = `artifacts/<projectId>/public/data`. `teams` tem `player1DisplayName`/`player2DisplayName` (nomes públicos).

**Restrições conhecidas:**
- `athlete_profiles` → **permission-denied** (não é público). Nome de atleta no ranking individual precisa de fonte pública (`users/{id}` só lê quando `userDocIsPublicAthlete`).
- `athleteRankings`/`teamRankings` estavam **vazios no dev** — `/rankings` está em empty-state até serem populados.
- Reserve espaço para conteúdo assíncrono (skeletons), trate empty states e erros.

## SEO
- Metadata por rota (`generateMetadata` nas dinâmicas), `canonical`, OG/Twitter. JSON-LD em `@graph`: `Organization` + `WebSite` (layout), `ItemList` (`/torneios`), `SportsEvent` (`/torneios/[id]`).
- **OG images dinâmicas** via `next/og`: template em `src/lib/og.tsx`, rotas `opengraph-image.tsx` (home, `/torneios`, `/rankings`, e `/torneios/[id]` com dados do torneio). Next aplica a mesma imagem a OG e Twitter.
- `app/sitemap.ts` (inclui torneios dinâmicos), `app/robots.ts`, `app/manifest.ts`. Conteúdo público é server-rendered/ISR — sempre indexável.

## Skills & Plugins (obrigatório)
- **`frontend-design` plugin**: usar **sempre** ao construir/ajustar UI.
- **`ui-ux-pro-max`**: rodar o fluxo de design system antes de telas/seções novas. As skills do projeto vivem em `.claude/skills/` (ui-ux-pro-max, design, design-system, ui-styling, brand, banner-design, slides) e seus scripts são Python:
  ```bash
  python3 .claude/skills/ui-ux-pro-max/scripts/search.py "sports tournament beach landing dark" --design-system -p "nexaGO Site"
  ```
- Para identidade/voz da marca e assets, usar a skill `brand`. Para banners/social, `banner-design`.

## Convenções
- **Português** nas strings/UI; **inglês** no código (nomes, comentários técnicos).
- Componentes pequenos e focados; Server Components por padrão, `"use client"` só onde houver interação/Framer Motion.
- TypeScript estrito: sem `any` (use `unknown`); prefira inferência quando óbvio.
- Acessibilidade não é opcional — contraste ≥4.5:1, foco visível, alt text, navegação por teclado, headings sequenciais.
- Mobile-first; breakpoints sistemáticos; sem scroll horizontal; `min-h-dvh` em vez de `100vh`.
- Imagens otimizadas (`next/image`, WebP/AVIF, dimensões declaradas para evitar CLS).

## Princípios (do projeto)
Simplicidade, legibilidade, escalabilidade, baixo acoplamento, alta coesão. Nunca gerar código complexo sem necessidade. Preservar retrocompatibilidade e nunca quebrar regras de negócio.
