# CFC — Landing Page

Landing page única, responsiva e animada para o **CFC**, arena de esportes de
areia (vôlei de praia e futevôlei) com quadras iluminadas, torneios, aulas e
área de convivência com churrasqueira. O layout partiu do template usado no
projeto `bplay` (inspirado em funparquesaojoao.pt); o copy foi reescrito em
pt-BR a partir das fotos reais da arena, que já estão posicionadas no site.

## Estrutura

```
index.html        página única com todas as seções
css/styles.css    estilos, paleta, responsividade
js/main.js        animações e interações
images/           fotos reais da arena (1.jpeg … 14.jpeg)
```

## Como rodar

Qualquer servidor estático na pasta do projeto:

```bash
python3 -m http.server 8123
# abrir http://localhost:8123
```

## Deploy

Ainda **não há** script npm nem target de hosting para o cfc (os scripts
`start:bplay`/`build:bplay` e o target `bplay` do firebase.json pertencem ao
projeto bplay). Para publicar, criar scripts `start:cfc`/`build:cfc` no
`frontend/package.json` e um target de hosting próprio no `firebase.json`.

## Onde cada foto foi usada

| Foto | Local | Motivo |
|---|---|---|
| 13 | Hero | jogo ao pôr do sol nas quadras iluminadas — a mais cinematográfica |
| 11 | Sobre (retrato) | estrutura profissional da rede sob céu azul |
| 7 | Sobre (paisagem) | vista noturna das quadras iluminadas |
| 4 | Modalidade 01 — Vôlei de Praia | treino/jogo de dia com bolas na areia |
| 9 | Modalidade 02 — Futevôlei | time posando com as bolas de futevôlei |
| 8 | Modalidade 03 — Torneios | campeãs com os troféus do torneio |
| 14 | Modalidade 04 — Aulas & Turmas | turma reunida depois do treino |
| 1 | Modalidade 05 — Churrasco & Resenha | carne na grelha ao lado da quadra |
| 3, 6, 10, 12 | Galeria de Festas & Churrasco | churrasco, violão, fogueira e pôr do sol |
| 5 | Eventos — Confraternizações | grupo sob a tenda com bar ao fundo |
| 2 | Eventos — Empresas & Grupos | amigos assistindo ao jogo noturno |

## O que ainda é placeholder

Buscar pelos comentários no `index.html`:

- `[LOGO EDITÁVEL]` — logotipo oficial (hoje o logo é texto "CFC")
- `[HORÁRIOS EDITÁVEIS]` — horários oficiais de funcionamento
- `[CONFIRMAR]` — número real de quadras (contador da seção Sobre)
- `[TEXTO EDITÁVEL]` — regras/condições nos accordions e FAQs
- `[CONTATOS EDITÁVEIS]` — telefone, e-mail, endereço e link do mapa no footer
- `[DEPOIMENTOS PLACEHOLDER]` — substituir por avaliações reais do Google
- Botões "Valores"/"Reservar" apontam para `#` — ligar ao WhatsApp/preçário

## Animações

- **Lenis** — smooth scroll (respeita `prefers-reduced-motion`)
- **GSAP + ScrollTrigger** — reveals ao scroll, títulos palavra a palavra,
  parallax no hero, contador de quadras
- **Marquees CSS** — ticker de aviso e faixa de festas
- **Swiper** — slider de depoimentos (1/2/3 slides por breakpoint)
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