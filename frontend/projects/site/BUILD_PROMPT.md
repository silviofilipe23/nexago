# Build Prompt — Site nexaGO (Premium, Mobile-First, SEO)

Instruções para executar a construção do site público do nexaGO. Objetivo: um site **nível premium (padrão de US$ 10.000)**, **mobile-first** e **rankeável no Google**. Leia junto com `CLAUDE.md` (regras do projeto) e o design system em `brand_assets/NexaGO Design Doc _standalone_.html` (fonte da verdade dos tokens).

---

## 0. Como executar (workflow obrigatório)

Siga nesta ordem — não pule etapas:

1. **Skill `frontend-design`** — ativar e manter ativa durante toda a construção de UI.
2. **Skill `ui-ux-pro-max`** — rodar o design system ANTES de qualquer tela:
   ```bash
   python3 .claude/skills/ui-ux-pro-max/scripts/search.py \
     "sports tournament beach athletic landing dark premium" \
     --design-system --persist -p "nexaGO Site"
   ```
   Depois, por página relevante (`--page hero`, `--page rankings`, `--page torneios`).
3. **Transcrever tokens** do design doc para `src/styles/globals.css` (`@theme`) — ver `CLAUDE.md`. Nada de hex cru em componentes.
4. **Construir por seções**, mobile-first (375px → 768px → 1024px → 1440px), validando cada uma contra os critérios de aceite (§6) antes de avançar.
5. **Auditar** ao final: Lighthouse (mobile), eixo de acessibilidade do ui-ux-pro-max (§1–§3) e checklist de SEO (§4).

> Regra de ouro: cada seção entregue deve parecer trabalho de estúdio premium — ritmo de espaçamento impecável, tipografia hierárquica, microinterações intencionais, zero "cara de template".

---

## 1. Objetivo & padrão de qualidade

Site público do ecossistema nexaGO (gestão de torneios e ligas de esportes de areia — beach tennis e vôlei de praia). Dois papéis:

- **Landing / marketing**: vender o app e a Liga nexaGO; converter em download.
- **Hub público (SEO)**: rankings, torneios/etapas e perfis públicos indexáveis — é o que traz tráfego orgânico do Google.

**Padrão US$ 10k significa:**
- Direção de arte coesa com a marca (dark, atlético, laranja `#FF6A1A`), não um tema genérico.
- Tipografia em escala real (Sora display + Inter UI), hierarquia clara, medida de linha controlada.
- Microinterações e scroll reveals com propósito (Framer Motion), nunca decorativos.
- Performance e acessibilidade de produção, não "depois a gente otimiza".
- Detalhe obsessivo: estados (hover/press/focus/disabled/loading/empty/error), bordas, sombras e glows consistentes com os tokens.

---

## 2. Stack & setup

- **Next.js (App Router) + React + TypeScript `strict`** — projeto separado, `package.json` próprio dentro de `projects/site/`.
- **Tailwind CSS v4** com tokens em `@theme` (transcritos do design doc).
- **Framer Motion** (`motion/react`) para animação.
- **Firebase JS SDK** (`firebase/firestore`) — somente leitura pública; reutilizar valores de `frontend/shared/firebase/firebase.config.ts`.
- **next/font** para Sora, Inter e JetBrains Mono (self-host, `display: swap`).
- **next/image** para todas as imagens.
- Render: **SSG/ISR** para páginas de marketing e listagens; **SSR/ISR** para detalhe dinâmico (torneio, perfil) — tudo precisa vir renderizado no HTML (indexável).

---

## 3. Mobile-first (requisito central)

- Desenhar e implementar **a partir de 375px**, depois escalar. Nunca o contrário.
- Breakpoints sistemáticos: 375 / 768 / 1024 / 1440.
- Áreas de toque ≥ 44×44pt, espaçamento ≥ 8px entre alvos.
- `min-h-dvh` em vez de `100vh`; sem scroll horizontal; respeitar safe areas.
- Texto base ≥ 16px no mobile (evita zoom automático do iOS); medida 35–60 caracteres no mobile.
- Navegação mobile clara (header compacto + menu), CTA de download sempre acessível.
- Imagens responsivas (`sizes`/`srcset`), peso controlado, lazy-load abaixo da dobra.
- Testar em 375px e em landscape antes de considerar pronto.

---

## 4. SEO — rankear no Google (requisito central)

**Técnico**
- HTML **semântico** (um `<h1>` por página, hierarquia `h1→h6` sem pular níveis, `<main>`, `<nav>`, `<article>`, `<section>`).
- **Metadata API** do Next por rota: `title`, `description`, `canonical`, Open Graph e Twitter Card. Títulos únicos e descritivos por página.
- **Conteúdo renderizado no servidor** (SSG/SSR/ISR) — nada de conteúdo público só client-side.
- **`sitemap.xml`** dinâmico (incluindo torneios/perfis públicos) e **`robots.txt`**.
- **URLs limpas e estáveis** em português (`/torneios/[slug]`, `/rankings`, `/atletas/[slug]`); slugs legíveis, sem IDs crus quando evitável; canonical sempre.
- **`lang="pt-BR"`** no `<html>`; `hreflang` se houver outros idiomas no futuro.
- **Imagens OG** por página-chave (1200×630) e `alt` descritivo em toda imagem com significado.

**Dados estruturados (JSON-LD)**
- `Organization` / `WebSite` (com `SearchAction` se houver busca) no layout raiz.
- `SportsEvent` para torneios/etapas (nome, datas, local/arena, status).
- `BreadcrumbList` em páginas internas; `Person`/`ProfilePage` em perfis de atletas; `SportsTeam`/`Place` para arenas quando fizer sentido.

**Core Web Vitals (mobile, metas)**
- **LCP < 2,5s** · **INP < 200ms** · **CLS < 0,1**.
- Reservar espaço para mídia (dimensões/`aspect-ratio`) — zero layout shift.
- `next/font` com `display: swap`; preload só do crítico.
- Code splitting por rota; componentes pesados via `dynamic()`.
- Lighthouse mobile alvo: **Performance ≥ 90, SEO 100, Best Practices ≥ 95, Acessibilidade ≥ 95**.

**Conteúdo / on-page**
- Cada página pública com conteúdo textual real e indexável (não só dados visuais).
- Links internos entre hub e detalhe (rankings ↔ atleta ↔ torneio) para distribuir autoridade.
- Empty states e páginas dinâmicas sempre com algum conteúdo semântico, nunca em branco.

---

## 5. Conteúdo & estrutura de páginas

**Landing (marketing)**
1. **Hero** — proposta de valor, identidade da marca, CTA primário (baixar app) + secundário (ver Liga). Movimento atlético sutil.
2. **Como funciona / Features** — para atletas, organizadores e arenas (bento grid ou cards).
3. **Liga nexaGO** — destaque da liga e da 1ª etapa; CTA de inscrição/saiba mais.
4. **Prova social** — depoimentos, números, arenas parceiras.
5. **Download** — App Store + Play Store, com selo/QR.
6. **Footer** — navegação, links legais, redes, SEO interno.

**Hub público (dinâmico, do Firestore)**
- **Rankings** — lista/tabela com filtros; cada jogador linka pro perfil.
- **Torneios / Etapas** — listagem + página de detalhe (chaves/resultados públicos, status `live`/`pending`/`win`).
- **Perfil público de atleta** e **perfil de arena** — indexáveis.

> Encapsular toda query do Firestore em repositórios em `lib/`. Componentes não falam direto com o SDK. Skeletons para loading, empty states úteis, erro com retry.

---

## 6. Definition of Done (critérios de aceite)

Uma entrega só está pronta quando **todos** abaixo passam:

- [ ] Visual fiel ao design doc: tokens (cor/tipografia/raio/spacing/elevação/glow) via `@theme`, zero hex cru.
- [ ] Mobile-first verificado em 375px e landscape; sem scroll horizontal; toques ≥ 44pt.
- [ ] Tipografia: Sora (display) + Inter (UI) + JetBrains Mono (dados), `display: swap`, hierarquia correta.
- [ ] Animações com tokens de motion, `transform`/`opacity` só, `prefers-reduced-motion` respeitado (`useReducedMotion`).
- [ ] Acessibilidade: contraste ≥ 4.5:1, foco visível, alt text, navegação por teclado, headings sequenciais, ARIA onde necessário.
- [ ] SEO: metadata por rota, canonical, JSON-LD aplicável, sitemap + robots, HTML semântico, conteúdo renderizado no servidor.
- [ ] Core Web Vitals dentro das metas; Lighthouse mobile nas metas do §4.
- [ ] Estados completos: hover/press/focus/disabled/loading/empty/error.
- [ ] Dados públicos via repositórios em `lib/`; nenhuma escrita, auth ou dado sensível no site.
- [ ] TypeScript `strict` sem `any`; código em inglês, UI em português.

---

## 7. Prompt para colar (execução)

> Construa o site público do nexaGO seguindo `projects/site/CLAUDE.md` e `projects/site/BUILD_PROMPT.md`. Padrão de qualidade premium (US$ 10k), **mobile-first** e **otimizado para ranquear no Google**.
>
> Stack: Next.js (App Router) + React + TypeScript strict + Tailwind v4 + Framer Motion + Firebase (Firestore, leitura pública). Tokens da fonte da verdade `brand_assets/NexaGO Design Doc _standalone_.html` (dark, laranja `#FF6A1A`; Sora/Inter/JetBrains Mono).
>
> Workflow: (1) ative a skill `frontend-design`; (2) rode `ui-ux-pro-max --design-system --persist` antes de cada tela; (3) transcreva os tokens para `@theme`; (4) construa por seções mobile-first (landing + hub público: rankings, torneios, perfis), validando cada uma contra o Definition of Done do §6; (5) audite com Lighthouse mobile e o checklist de SEO do §4.
>
> Comece pelo scaffold do Next.js + setup de tokens/fontes, depois o Hero. Pare e me mostre o Hero antes de seguir para as próximas seções.
