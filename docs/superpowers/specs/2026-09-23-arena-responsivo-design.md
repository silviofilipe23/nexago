# Painel da arena responsivo — notebook 13", iPad e celular

**Data:** 23/09/2026
**Escopo:** `frontend/projects/arena` apenas
**Decisões do dono:** tomadas nesta sessão (23/09/2026)
**Status:** desenho aprovado, implementação não iniciada

## Por que

O menu do painel da arena é **cortado em silêncio** em praticamente todo monitor, e
**não existe navegação nenhuma** abaixo de 900px. Não é "não está otimizado": é perda
de acesso a metade do produto.

`panel-shell.component.ts` monta um `.shell { height: 100dvh }` (linha 122) com
`overflow: hidden` (127), e dentro dele um `.nav` também com `overflow: hidden`
(linha 257) carregando os 21 itens de `NAV_ITEMS`, cada um com `height: 34px;
flex: none`. Quando a viewport encurta, o `.spacer` colapsa, o `.nav` encolhe — e
como ele esconde o transbordo **sem barra de rolagem**, os itens de baixo somem. A
página também não rola (`docScrolls: false`). Não há caminho: só digitando a URL.

### Medição

Harness estático com o CSS real do componente e os 21 itens, medido no navegador
(`nav.scrollHeight` vs `nav.clientHeight`). A lista precisa de **753px**; o resto do
sidebar (marca, seletor de arena, "Configurações", linha do usuário, paddings) come
mais ~240px. **O sidebar só cabe inteiro com ~990px de viewport.**

| aparelho | viewport útil | cortado | itens perdidos | some a partir de |
|---|---|---|---|---|
| Notebook Win 1366×768 | 633px | 359px | 11 de 21 | Horários de pico |
| MacBook Air 13" (1280×800) | 665px | 327px | 10 de 21 | Links |
| iPad Pro 11" paisagem | 760px | 232px | 7 | Quadras |
| MacBook Air 13.6" M2 | 820px | 172px | 5 | Avaliações |
| MacBook Pro 14" | 846px | 146px | 5 | Avaliações |
| Desktop 1920×1080 | 945px | 47px | 2 | Equipe |
| Monitor 1440p | 1250px | 0 | 0 | — |

Três agravantes:

1. **Não parece quebrado.** A 1280×665 "Links" fica cortado ao meio e logo abaixo
   aparecem "Configurações" e a linha do usuário, ancorados no rodapé pelo
   `.spacer`. O menu *parece* ter 12 itens e terminar ali.
2. **Num 1080p o dono perde "Equipe" e "Planos"** — a tela onde a arena paga.
3. **Quem quebra é quem administra.** Os cargos de `arena-roles.model.ts` veem
   conjuntos diferentes: `recepcao` (o do balcão) alcança 10 itens e nunca estoura;
   `gestor` vê 19 e estoura; o dono vê 21 e é o pior caso. O menu falha para quem
   administra e paga, não para quem opera.

### Abaixo de 900px: zero

A linha 420 faz `.sidebar { display: none }` e **nada entra no lugar**. Medido a
834px (iPad retrato): `navegacaoAlcancavel: 0`. Não existe hambúrguer, topbar ou
bottom-nav em lugar nenhum do projeto — o único `ar-drawer` é o painel de detalhe
da tela de Ranking. Em tablet retrato e em celular o painel é conteúdo sem saída.

### O resto, em camadas

- **Toque:** zero `@media (pointer: coarse)` no projeto (o organizador tem no
  `styles.scss`; o arena não herdou). `.nav-item` tem 34px de altura e `gap: 1px`
  entre itens — abaixo dos 44px e dos 8px de separação mínima entre alvos.
- **Safe area:** zero ocorrências de `env()` no projeto inteiro.
- **Tabelas:** 25 das 58 unidades têm ≥300px travados em colunas de grid.
- **iOS:** 397 ocorrências de `font-size` entre 10 e 15px; nas que caem em `input`,
  o Safari dá zoom sozinho ao focar.
- **23 das 58 unidades não têm nenhuma `@media`**, incluindo `panel-card`, que está
  embaixo de quase todas as telas.
- O `viewport meta` de `index.html` está correto e **não** bloqueia zoom — nada a
  fazer ali.

## Decisões tomadas

1. **Escopo é só o portal da arena.** Organizador e atleta têm bugs da mesma
   família (cadeia de altura), mas ficam fora.
2. **Os três aparelhos são de primeira classe**: notebook 13" (gestor o dia todo),
   iPad no balcão (`recepcao`, com o dedo) e celular (dono fora da arena).
3. **Os 21 itens viram 5 grupos recolhíveis.** Rolar um menu de 21 itens conserta o
   acesso e não conserta o uso; agrupar ataca a causa.
4. **Variável carrega magnitude, mixin carrega estrutura** (ver "Arquitetura").
5. **O shell continuar remontando a cada navegação fica fora desta spec.** As 38
   telas instanciam `<ar-panel-shell>` cada uma e `app.routes.ts` tem zero
   `children`. Virar rota de layout é arquitetura/performance, não responsividade —
   vira sessão própria. Aqui o estado do menu é persistido para sobreviver ao
   remonte.
6. **Sidebar-trilho, ⌘K e extração para `frontend/shared/` ficam fora.** O trilho é
   remédio de largura para uma doença de altura (num 13" sobram 1044px de largura).

## Arquitetura

> **Variável carrega a magnitude, mixin carrega a estrutura.**

`@media` não lê `var()`, mas o *efeito* do breakpoint pode ser uma variável. Então:

- As telas consomem `var(--ar-…)` e **não declaram `@media`**.
- Um punhado de `@media` no `styles.scss` troca as variáveis.
- Mixin SCSS só onde a **estrutura** muda (grid que colapsa coluna) — o que
  variável não expressa.

Isso preserva retrocompatibilidade: as 47 `@media` que já existem em `src/`
continuam valendo e ninguém precisa reescrever tudo de uma vez.

**Habilitação:** `inlineStyleLanguage: "scss"` já está ligado no alvo `arena` do
`angular.json`; falta `stylePreprocessorOptions.includePaths`, hoje `null` — uma
linha, apontando para `projects/arena/src/styles`.

### Escada de largura

Absorve o que já existe; não inventa números.

| degrau | px | justificativa |
|---|---|---|
| `lg` | 1180 | já é o de facto — 25 dos 45 usos por largura em `src/` |
| `md` | 900 | onde a sidebar sai hoje (3 usos) |
| `sm` | 720 | segundo mais usado (14 usos) |
| `xs` | 480 | celular pequeno |

Órfãos a migrar: `980px`, `1080px` e `640px` aparecem **1× cada** → viram 900, 1180
e 720. São 3 ocorrências.

### Escada de altura

Nova. Não existe nenhuma `@media` por altura em nenhum portal do frontend hoje.

| degrau | px | aparelho |
|---|---|---|
| `short` | ≤ 820 | MacBook Air 13.6", iPad paisagem |
| `xshort` | ≤ 680 | 1280×800, 1366×768, celular deitado |

### O que cada eixo move

| eixo | variáveis | valores (base / short / xshort) |
|---|---|---|
| altura | `--ar-nav-item-h` | 34 / 32 / 30 |
| altura | `--ar-header-py` | 20 / 14 / 10 |
| altura | `--ar-pad-page-y` | 22 / 16 / 12 |
| largura | `--ar-pad-page-x` | 32 / 24 / 16 (`lg` / `md` / `sm`) |
| toque | `--ar-tap` | 44px sob `pointer: coarse` |
| toque | `--ar-tap-gap` | 8px sob `pointer: coarse` |

`22px 32px` já é o padding de página de facto (38 ocorrências) e `10px 14px` o de
controle (38 ocorrências) — as variáveis nascem com os valores atuais, então a base
não muda visualmente.

### Ordem do cascade é parte do desenho

`@media` **não soma especificidade**: empatam e ganha a última declarada. Esta é a
armadilha nº 1 de `docs`/memória e já cobrou 4× no organizador. O `styles.scss` fica
nesta ordem, comentada no arquivo:

1. `:root` base
2. largura (do maior degrau para o menor)
3. altura
4. **`pointer: coarse` por último**

O passo 4 existe por um conflito real: no iPad paisagem (760px de altura) a faixa
`short` quer item de 32px e o dedo quer 44px. **O dedo ganha** — e ganha por ordem
de declaração, que é frágil de manter na mão. Por isso vira teste medido.

**Nas telas:** `@media` sempre **aninhada dentro do seletor** (SCSS), nunca bloco
solto acima da regra base.

## Navegação

### Grupos

`NAV_ITEMS` ganha o campo `group`. O shell renderiza por grupo:

| grupo | itens | áreas |
|---|---|---|
| *(solto)* | Início | — |
| Operação | Agenda, Reservas, Horários fixos, Clubinho, Quadras | `agenda`, `quadras` |
| Vendas | Comandas, Estoque, Promoções, Cupons, Horários de pico | `comandas`, `estoque`, `promocoes` |
| Dinheiro | Financeiro, Ocupação | `financeiro` |
| Público | Meu site, Links, Avaliações, Seguidores, Ranking, Torneios | `site`, `comunidade`, `torneios` |
| Conta | Equipe, Planos, Configurações | `owner` |

Recolhido são **6 linhas em vez de 21**; com um grupo aberto, ~11 — cabe inteiro em
633px, o pior notebook da tabela.

**Permissão:** um grupo some inteiro quando o cargo não lê nenhum item dentro dele.
Deriva do filtro de `navItems()` que já existe (`access.canRead` / `access.isOwner`),
**não** é uma segunda regra de permissão. Para `recepcao` sobram Operação e Vendas,
parciais.

**Rota ativa:** a detecção continua varrendo o `NAV_ITEMS` **completo**, não a lista
filtrada nem a agrupada — o comentário em `panel-shell.component.ts:427` já explica
por quê, e agrupar não pode reintroduzir isso.

**Estado:** abre o grupo da rota ativa; os outros recolhidos. A escolha do usuário e
a posição de rolagem do menu persistem em `localStorage`, com chave por arena —
necessário porque o shell remonta a cada navegação (decisão 5).

### A invariante

`.nav` passa a `overflow-y: auto`. Mesmo com grupos, nada garante que uma arena
futura com mais itens não estoure de novo. **O que não pode voltar a existir é
cortar sem barra.** Isso vira teste, não boa intenção.

### Abaixo de 900px

Topbar (marca + nome da arena + hambúrguer) e o menu agrupado completo dentro do
`ar-drawer` que já existe — ele já fecha no scrim, no X e no Escape. A topbar é
fixa, e o conteúdo ganha recuo igual à altura dela (não pode sobrepor a primeira
seção). O `.content` (linha 407) já rola por dentro, então a cadeia de altura aqui
está sã — diferente do organizador.

### No celular (≤720px)

Bottom-nav de **5 slots**: Início · Agenda · Reservas · Comandas · **Mais** (abre o
drawer). Cinco é o teto recomendado.

- Slot que o cargo não alcança cai para o próximo item permitido — nunca sobra
  buraco.
- "Mais" garante que nenhuma rota fique só-por-URL, que é o buraco de hoje.
- **`padding-bottom: env(safe-area-inset-bottom)`** — não existe nenhum `env()` no
  projeto hoje; sem isso a barra fica embaixo da barra de gestos do iPhone.

### Acessibilidade

- Cabeçalho de grupo é `<button aria-expanded>`, não `<div>`.
- Item ativo ganha `aria-current="page"`.
- O drawer prende o foco enquanto aberto e devolve ao gatilho ao fechar.
- Ordem de tabulação segue a ordem visual.
- `gap: 1px` entre itens de nav (linhas 160, 254, 383) sobe para
  `var(--ar-tap-gap)` sob `pointer: coarse`.

## Conteúdo

Os 25 casos de grid travado não são 25 problemas. São duas famílias.

### Família A — tabelas de lista (7 telas)

| tela | px travados | colunas |
|---|---|---|
| `peak-rules/panel-peak-rules` | 720 | `1.6fr 100px 150px 90px 110px 100px 170px` |
| `coupons/panel-coupons` | 680 | 6 |
| `clubinho/panel-clubs` | 640 | 7 |
| `finance/panel-fiscal-invoices` | 630 | 7 |
| `promotions/panel-promotions` | 620 | 6 |
| `stock/panel-stock` | 600 | 7 |
| `clubinho/panel-club-detail` | 590 | 6 |

`peak-rules` trava 720px **mais** um `1.6fr` — quase o dobro de um celular de 390px.

**Tratamento:**

- **Padrão nas 7: scroll horizontal próprio.** O container rola, não a página. Zero
  perda de dado, uma classe compartilhada. É o que salvou a tabela de classificação
  do bracket no portal do atleta.
- **Virar cards abaixo de `sm`, só onde o celular é uso real:** `agenda`,
  `finance/panel-finance`, `bookings/panel-bookings` e `orders/panel-orders` — os
  quatro que o dono e o balcão abrem no telefone. Note que **estes quatro não estão
  na tabela acima**: são listas de 320–360px travados, que cabem no scroll mas não
  se leem bem no polegar. Nas 7 da tabela, virar card seria trabalho sob medida ×7
  sem ninguém para usar.

A página em si **nunca** rola na horizontal — só esses containers.

### Família B — layout partido (13 telas)

Uma coluna flexível + uma coluna fixa entre 300 e 400px:

| tela | colunas | | tela | colunas |
|---|---|---|---|---|
| `orders/panel-order-detail` | `1fr 373px` | | `home/panel-home` | `1fr 372px` |
| `plans/panel-plans` | `1fr 373px` | | `agenda/panel-agenda` | `1fr 340px` |
| `stock/panel-stock-detail` | `1fr 373px` | | `profile/panel-profile` | `1fr 340px` |
| `clubinho/panel-club-form` | `1fr 373px` | | `site/panel-site` | `minmax(0,1fr) 340px` |
| `promotions/panel-promotion-form` | `1fr 373px` | | `finance/panel-finance` | `1fr 320px` |
| `coupons/panel-coupon-form` | `1fr 373px` | | | |
| `profile/panel-profile-hours` | `1fr 373px` | | | |
| `finance/panel-finance-reports` | `373px 1fr` | | | |

É o **mesmo padrão repetido**. Uma regra compartilhada empilha as duas colunas
abaixo de `md` e conserta as 13 de uma vez. É a maior alavanca por esforço do
projeto.

### As 5 que sobram

As duas famílias são disjuntas e somam 20 das 25 unidades com grid travado. As
outras 5 não têm padrão comum e vão uma a uma:

| tela | px travados | fase |
|---|---|---|
| `team/panel-team` | 406 | 4 |
| `orders/panel-orders` | 360 | 3 (vira card no celular) |
| `bookings/panel-bookings` | 360 | 3 (vira card no celular) |
| `clubinho/panel-club-session` | 336 | 4 |
| `recurring/panel-recurring` | 320 | 4 (também está entre as sem `@media`) |

`finance/panel-finance` aparece nas duas listas de propósito: tem o layout partido
(`1fr 320px`) **e** uma tabela interna (`40px 1.3fr 96px 96px 96px`). A Fase 2
resolve o primeiro; a Fase 3, o segundo.

### Formulários

Regra global no `styles.scss`: `input, select, textarea` com `font-size: 16px` sob
`pointer: coarse`. Resolve as ~397 ocorrências de fonte pequena **sem tocar em 397
lugares**.

**Consequência a medir, não a supor:** campo de 16px é mais alto, e os grids de
coluna fixa podem estourar por causa disso. Por isso a Fase 3 vem **depois** da
Fase 0 e mede com a mudança ligada.

## Fases

Cada fase fecha sozinha e pode ir ao ar separada.

| fase | o que | por que nessa ordem |
|---|---|---|
| **0** | `includePaths`, `_breakpoints.scss`, `_density.scss`, ordem do cascade no `styles.scss`, camada de toque, `panel-card` | é o substrato; `panel-card` tem zero `@media` e está embaixo de quase tudo |
| **1** | Shell: grupos, `overflow-y: auto`, topbar + drawer, bottom-nav, persistência de estado | é onde o bug morre — 10 itens voltam a existir |
| **2** | Família B (13 telas, uma regra) | maior alavanca por esforço |
| **3** | Família A: scroll nas 7 + cards nas 4 do celular | depende da Fase 0 (input de 16px muda a altura das linhas) |
| **4** | As 23 unidades sem `@media` + fallout dos formulários | o resto |
| **5** | Passe medido | prova |

## Testes

Neste repo "build verde + suíte verde + CSS que parece certo" já enganou várias
vezes. Três camadas, não uma.

### 1. Spec de função pura — modelo de navegação

- Todo item de `NAV_ITEMS` pertence a exatamente um grupo.
- Todo grupo tem ao menos um item.
- Para os 4 cargos (`gestor`, `recepcao`, `financeiro`, `manutencao`) mais o dono, o
  conjunto renderizado é igual ao conjunto permitido — nem a mais, nem a menos.
- A rota ativa é detectada mesmo quando o item correspondente está fora da lista
  filtrada.

Rápido, mas **não pega fiação**. Não vem sozinho.

### 2. Spec de componente

`TestBed` com `provideZonelessChangeDetection()` — sem isso é `NG0908`, porque o
alvo `test` do arena não declara `zone.js` no `angular.json`.

- `.nav` **nunca** computa `overflow-y: hidden`.
- Abaixo de 900px o gatilho do drawer existe no DOM e a sidebar não é a única
  navegação.
- A bottom-nav tem no máximo 5 slots e nenhum slot vazio, para cada cargo.

### 3. Passe medido no navegador

A única camada que prova geometria. Harness servindo o CSS real, medindo
`getBoundingClientRect()` / `getComputedStyle`, na matriz:

- **larguras:** 320, 375, 414, 768, 1024, 1440
- **alturas:** 633, 665, 760, 820, 945
- **por cargo:** dono (21 itens) e `recepcao` (10)

Asserções:

- `nav.scrollHeight <= nav.clientHeight` **ou** `overflow-y` rolável — nunca corte
  mudo.
- Nenhum item de `NAV_ITEMS` permitido fica inalcançável.
- `document.documentElement.scrollWidth <= innerWidth` — a página não rola na
  horizontal em nenhuma largura.
- Sob `pointer: coarse`, todo alvo interativo tem ≥44px de altura e ≥8px de
  separação — **inclusive nas faixas `short`/`xshort`**, que é onde a ordem do
  cascade pode trair.

## Fora de escopo

- Organizador, atleta, backoffice, coach e site — mesmo tendo bugs da mesma família.
- Extrair o sistema de faixas para `frontend/shared/`.
- Sidebar-trilho de 64px e paleta de comando (⌘K).
- Transformar o shell em rota de layout (`children` em `app.routes.ts`) e remover o
  wrapper das 38 telas — vale sessão própria.
- Redesenho visual: isto é responsividade e alcance, não nova identidade.

## Pendência operacional

- O worktree **não tem `node_modules`**: `npm ci` em `frontend/` antes de qualquer
  build ou spec.
- O passe medido (Testes, camada 3) precisa de um servidor estático para o harness.
  Criar uma entrada `arena-harness` em `.claude/launch.json` no começo da Fase 5 e
  **removê-la ao fim da implementação** — decisão do dono, 23/09/2026. O arquivo é
  versionado: editar **à mão**, acrescentando só o objeto novo. Rodar
  `JSON.stringify` nele reformata as 9 entradas existentes (29 inserções para uma
  mudança de 10 linhas) e o diff deixa de mostrar a intenção — mesma armadilha do
  `prettier` em arquivo não formatado.
