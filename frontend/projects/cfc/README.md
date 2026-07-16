# FUN Parque — Landing Page

Landing page única, responsiva e animada, com a estrutura e o estilo visual
inspirados em funparquesaojoao.pt. Todo o conteúdo longo (descrições,
respostas de FAQ, testemunhos, contactos) é **texto placeholder original**
para ser substituído pelo conteúdo final; os espaços de imagem estão
**demarcados visualmente** com blocos tracejados.

## Estrutura

```
index.html        página única com todas as secções
css/styles.css    estilos, paleta, responsividade
js/main.js        animações e interacções
```

## Como correr

```bash
# na pasta frontend/
npm run start:bplay
# abrir http://localhost:8123
```

Ou qualquer servidor estático na pasta do projeto:

```bash
python3 -m http.server 8123
```

## Deploy (Firebase Hosting)

Sites:
- **dev:** `bplay-dev2` → https://bplay-dev2.web.app
- **prod:** `bplay-nexago` → https://bplay-nexago.web.app

```bash
# na pasta frontend/
npm run build:bplay

# na raiz do repo
firebase deploy --only hosting:bplay --project dev
firebase deploy --only hosting:bplay --project default
```

## Onde inserir as imagens

Procurar por `▓▓ ESPAÇO PARA IMAGEM ▓▓` no `index.html`. Cada bloco
`<div class="ph …">` é um marcador — substituir o bloco inteiro por
`<img>` ou `<video>` com as dimensões sugeridas no próprio marcador:

| Local | Sugestão |
|---|---|
| Hero | 1920×1080 · vídeo/foto aérea |
| Sobre (2 fotos do grid) | 800×1000 e 1200×800 |
| Actividades (5 fotos) | 960×720 cada |
| Eventos (2 fotos) | 800×560 cada |

Os textos a rever estão marcados com comentários `[TEXTO EDITÁVEL]`,
`[PLACEHOLDER]` e `[CONTACTOS EDITÁVEIS]`.

## Secções

1. Header fixo com barra de progresso, navegação com secção activa e menu mobile em ecrã inteiro
2. Hero com media em moldura arredondada, título animado e CTAs
3. Ticker de aviso (marquee laranja, texto editável)
4. Horário (Inverno / Verão)
5. Sobre — grid bento com contadores animados (120 ha, 1 km praia, 1 km rio)
6. Actividades — 5 blocos alternados com chip de requisitos e accordion "Como funciona"
7. Aniversários — marquee gigante + passos 01–04
8. Eventos de Grupo — Escolas / Empresas
9. FAQs — tabs por categoria + accordions (fundo amarelo)
10. Testemunhos — slider Swiper com autoplay
11. Footer + botão voltar ao topo

## Animações (paridade com o site de referência)

- **Lenis** — smooth scroll (respeita `prefers-reduced-motion`)
- **GSAP + ScrollTrigger** — reveals ao scroll, títulos palavra a palavra,
  parallax no hero, contadores
- **Marquees CSS** — ticker de aviso e faixa de aniversários
- **Swiper** — slider de testemunhos (1/2/3 slides por breakpoint)
- Preloader com transição de saída; header esconde ao descer e reaparece ao subir

As bibliotecas vêm de CDN (jsDelivr + Google Fonts) — é preciso internet.

## Paleta

| Cor | Hex |
|---|---|
| Creme (fundo) | `#F5F5EF` |
| Verde-escuro | `#223C36` |
| Verde | `#71A34F` |
| Lima | `#C9DD44` |
| Laranja | `#EB6D45` |
| Amarelo | `#F3B948` |

Fontes: **Anton** (títulos), **Antonio** (subtítulos/botões), **DM Sans** (texto).
