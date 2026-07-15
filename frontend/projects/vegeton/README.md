# VEGETON Beach Club

Site do Vegeton Beach Club — vôlei de praia. Layout, animações e funcionalidades inspirados em xnrgyclub.com, com copy própria da marca. Site estático (HTML/CSS/JS), sem build.

Seções: hero "Energia da Areia" · Nossa história · Mais que uma arena · Estrutura (cards pinados: Quadras / Pátio & Convivência / Arena de Eventos / Vestiários) · Comunidade · Nossos valores · Nossa promessa · Footer.

## Rodar localmente

```bash
python3 -m http.server 4173
# abra http://localhost:4173
```

(ou qualquer servidor estático — `npx serve`, extensão Live Server, etc.)

## Stack

- **GSAP 3 + ScrollTrigger** — reveals, parallax, seção pinada dos clubes (mesmas libs do site original)
- **Lenis** — smooth scroll
- **Space Mono** (Google Fonts) + **Helvetica Neue** (substituto de NeueHelvetica Pro, que é comercial)

## Estrutura

```
index.html      # homepage completa
css/style.css   # design system + seções + estados hover
js/app.js       # smooth scroll, menu, reveals, parallax, cards pinados, cookies
assets/         # placeholders SVG (troque pelas imagens reais)
```

## Imagens

Fotos reais em `assets/`: `logo.png`, `logo-transparente.png` (navbar/footer), `foto-quadras.jpg`, `foto-patio.jpg`, `foto-torneio.jpg` e `foto-vestiario.jpg`. `foto-restaurante.jpg` está sem uso (a seção de restaurante foi removida). Os `ph-*.svg` são placeholders mantidos como referência.

Imagens geradas por IA (Higgsfield / Nano Banana Pro), no clima da marca: `gen-hero-spike.jpg` (fundo do hero, com overlay escuro), `gen-silhueta.jpg` (full-bleed após "Mais que uma arena") e `gen-bola-areia.jpg` (full-bleed antes do footer).

**Hero (vídeo):** quando houver um vídeo, substitua em `index.html` o `<div class="video-placeholder"></div>` por:
```html
<video playsinline muted loop autoplay>
  <source src="assets/hero.mp4" type="video/mp4" />
</video>
```

## Funcionalidades implementadas

- Header fixo que esconde ao rolar para baixo e reaparece ao subir
- Menu overlay fullscreen com reveal escalonado (abre no botão MENU, fecha no X ou ESC)
- Hero com título animado por linhas e fundo animado (placeholder do vídeo)
- Reveals on-scroll (títulos por linha, blocos fade-up, imagens com clip-path)
- Parallax nas imagens full-bleed
- Seção de clubes pinada — cards empilham com o scroll (01→02)
- CTA fixo laranja "Book a court" (aparece após o hero)
- Cookie banner com persistência em localStorage + link "Cookie preferences" no footer
- Navegação por âncoras com smooth scroll (Lenis)
- `prefers-reduced-motion` respeitado

## Paleta (extraída da logo Vegeton)

| Token | RGB | Uso |
|---|---|---|
| primary (azul royal) | 46, 49, 146 | botões principais ("Beach Club"/bola) |
| green | 30, 156, 60 | acentos, marca ("VEGETON"/palmeiras) |
| green-dark | 18, 106, 44 | eyebrows e hovers em fundo claro |
| secondary (verde-preto) | 10, 26, 16 | seções escuras, footer, menu |
| off-white quente | 244, 238, 226 | fundo claro (areia clara) |
| sand (dourado) | 223, 162, 43 | CTA fixo, fundo da seção Estrutura |

## Pendências / próximos passos

- Páginas internas (Clubs, Gym, Events, Contact…) — links hoje são âncoras/stubs
- Integração de booking (o original aponta para playtomic.com)
- Vídeo e fotos reais
