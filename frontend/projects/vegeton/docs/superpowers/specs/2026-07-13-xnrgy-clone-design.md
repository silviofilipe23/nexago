# XNRGY Clone — Design Doc

**Data:** 2026-07-13
**Objetivo:** Clone da homepage de xnrgyclub.com (layout, animações, funcionalidades). Imagens serão adicionadas depois (placeholders SVG por enquanto). Textos longos foram reescritos no mesmo tom para não copiar conteúdo literal do site.

## Stack

- HTML/CSS/JS estático (o original é WordPress com tema custom compilado)
- GSAP 3 + ScrollTrigger + Lenis (mesmas libs detectadas no bundle original) via CDN
- Fontes: Space Mono (Google Fonts) + Helvetica Neue (substituto de NeueHelvetica Pro, comercial)

## Design system (extraído do CSS original)

| Token | Valor |
|---|---|
| `--color-primary` | rgb(25, 43, 136) — azul royal |
| `--color-black` / secondary | rgb(15, 19, 32) — navy quase preto |
| `--color-white` / background | rgb(235, 235, 235) — off-white |
| `--color-orange` | rgb(221, 101, 0) — CTA fixo |
| `--color-background-blue` | rgb(199, 218, 217) |
| Headings | NeueHelvetica Pro → Helvetica Neue, line-height 1 |
| Body | Space Mono, line-height 1.47 |
| Transições | 0.25s ease-in-out |

## Estrutura da homepage

1. **Header fixo** — logo XNRGY à esquerda, botão MENU à direita; esconde ao rolar para baixo, reaparece ao rolar para cima
2. **Menu overlay** fullscreen navy — links em caixa alta com hairlines, reveal escalonado, CTAs "Book padel lessons" / "Book a court", fecha com X ou ESC
3. **Hero** — fundo de vídeo (placeholder animado), título gigante "ON&OFF COURT" com reveal de linhas, linhas verticais decorativas
4. **Intro (claro)** — eyebrow "INTRODUCTION", headline grande, corpo em mono, botões navy + outline, imagem com clip reveal
5. **Evolving Energy (navy)** — headline, parágrafo, arrow-links "Events" / "Request proposal"
6. **Imagem full-bleed** com parallax
7. **Clubs (fundo azul texturizado)** — seção pinada; cards 01–02 Almere / 02–02 Amsterdam empilham com o scroll; labels "[XNRGY Clubs]" / "[Keep scrolling]"
8. **Gym (claro)** — eyebrow, headline, corpo, botão "DISCOVER THE GYM", imagem
9. **Measure Motion (navy)** — eyebrow "OUR PROMISE", headline, corpo, botão "CONTACT US"
10. **Imagem full-bleed** parallax
11. **Footer (navy)** — logo, blurb de contato, telefone/e-mail, duas colunas de links grandes, arrow-link "Book a court", socials, barra legal
12. **CTA fixo laranja** "BOOK A COURT" (canto inferior esquerdo, aparece após o hero)
13. **Cookie banner** com localStorage (Reject/Accept)

## Animações

- Lenis smooth scroll integrado ao ScrollTrigger
- Reveal de título por linhas (split manual, overflow hidden + translateY)
- `[data-reveal]` fade-up com stagger em todos os blocos
- `[data-image-reveal]` clip-path inset
- Parallax scrub nas imagens full-bleed
- Pin + progresso na seção de clubes (card 2 sobe cobrindo o card 1)
- Hover: botões com fill deslizante, arrow-links com seta que desliza, links do menu com indent

## Fora de escopo (por enquanto)

- Páginas internas (clubs/gym/events/contact...) — links stubs `#`
- Integração real de booking (o original aponta para playtomic.com)
- Chat widget (original usa Zapier Interfaces)
