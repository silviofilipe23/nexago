# Passe medido de geometria responsiva — sidebar do painel da arena

Task 12 do plano `2026-09-23-arena-responsivo`. Esta é a única camada das três
(spec de função pura, spec de componente, este passe) que prova **geometria**
— pixel real, medido no navegador — em vez de **intenção**. Foi exatamente a
ausência dela que deixou passar o bug original:

> `.nav` tinha `overflow: hidden` dentro de um `.shell { height: 100dvh }` com
> 21 itens de altura fixa. Num MacBook Air 13" sumiam **10 dos 21 itens**, sem
> barra de rolagem e sem a página rolar — só alcançáveis digitando a URL.
> Abaixo de 900px a sidebar virava `display: none` sem nada no lugar: a
> 834px, **zero** rotas alcançáveis.

## Escopo deste passe

O brief original (`task-12-brief.md`) descreve uma matriz de 6 larguras × 5
alturas × 2 cargos **sobre o app inteiro**. O app real exige auth do Firebase
e o arena não tem rota de QA — montar uma está fora de escopo. Este passe
mede a mesma matriz, mas sobre um **harness estático** que espelha, com
fidelidade, apenas o *shell* (`panel-shell.component.ts` + `drawer.component.ts`
+ o CSS global compilado): topbar, sidebar/drawer com grupos recolhíveis,
bottom-nav. O conteúdo das 38 telas (`<ng-content>`) não entra — ver
"Não coberto" no fim.

## Como gerar o harness

```bash
# 1. Compilar o CSS global (o harness usa o CSS REAL, não uma cópia do SCSS-fonte —
#    styles.scss usa @use/mixins que só o build do Angular resolve).
cd frontend && npx ng build arena --configuration development
cd ..

# 2. Gerar o harness num diretório de saída (script sempre resolve os caminhos-fonte
#    a partir da raiz do worktree, independente de onde é chamado).
node scripts/qa/arena-sidebar-harness.mjs "$TMPDIR/arena-qa"
```

Saída em `<dir-de-saída>/`:
- `index.html` — a página do harness (marcação do shell + painel de QA);
- `shell.css` — CSS global compilado + CSS real do shell + CSS real do drawer,
  concatenados (útil para diff/inspeção isolada);
- `harness.js` — lógica cliente: `canSee`, `buildNavSections`, `isOpen`,
  `bottomItems` são portas 1:1 das funções reais de `panel-nav.model.ts` /
  `panel-shell.component.ts` — mesmo algoritmo, dado extraído do fonte a cada
  geração (não copiado à mão);
- `nav-data.json` — os `NAV_ITEMS` reais extraídos de `panel-nav.model.ts` +
  as áreas do cargo `recepcao` extraídas de `arena-roles.model.ts`, em JSON.

O gerador falha alto (com mensagem clara) se algum arquivo-fonte não existir,
se a extração de CSS não achar o marcador `styles: \`...\``, ou se a extração
de `NAV_ITEMS` não casar nenhum item — para nunca gerar um harness
silenciosamente desalinhado do componente real.

### Fidelidade — o que o harness reproduz e o que não

Reproduz:
- os grupos recolhíveis reais (Início solto + 5 cabeçalhos: Operação, Vendas,
  Dinheiro, Público, Conta), com **no máximo um grupo aberto por vez** — o
  mesmo estado de 3 vias (`null` fallback pela rota ativa / `'none'` fechado
  de propósito / grupo explícito) de `isOpen()`/`toggleGroup()`;
- a matriz de permissão real por cargo: `dono` (≈ `isOwner()`, vê tudo — 21
  itens) e `recepcao` (extraído de `arena-roles.model.ts` — 10 itens:
  início, agenda, reservas, horários fixos, clubinho, comandas, estoque,
  avaliações, seguidores, ranking);
- a densidade real (`--ar-nav-item-h`) e a escada de largura/altura/toque —
  lidas do CSS global compilado, não recalculadas;
- topbar + drawer (com o mesmo `z-index` do scrim real) abaixo de 900px,
  bottom-nav abaixo de 720px, sidebar direta acima de 900px — os mesmos
  breakpoints (`--ar-bp-md`/`--ar-bp-sm`), lidos do CSS, não hardcoded.

Não reproduz (deliberado, documentado no cabeçalho do gerador):
- autenticação, dados reais de Firestore, roteamento de verdade;
- o conteúdo de `<ng-content>` — as 38 telas do painel;
- os ícones reais: viram caixas do mesmo tamanho (`width`/`height` do
  `[size]`). A geometria não depende do `path` do SVG, só da caixa.

## Como servir

Entrada temporária `arena-harness` em `.claude/launch.json` (apontando para o
diretório de scratch, porta 4398) — **não commitada**, ver "Restrições" no
brief. Servir sempre por `preview_start`, nunca subindo servidor por Bash
diretamente (o preview interno precisa do handshake do `preview_start` para
`elementFromPoint` funcionar — ver nota de metodologia abaixo).

```
preview_start({ name: "arena-harness" })
navigate("http://localhost:4398/<subpasta-do-harness>/")   // barra final obrigatória:
                                                             // sem ela, "serve" resolve
                                                             // o index.html mas os <link>/
                                                             // <script> relativos saem
                                                             // pedidos na raiz do site
```

## A matriz

**Larguras:** 320, 375, 414, 768, 1024, 1440
**Alturas:** 633, 665, 760, 820, 945
**Cargos:** `dono` (21 itens) e `recepcao` (10 itens) — os dois testados em
**todas** as 30 combinações de largura×altura (não só uma amostra).

Por combinação, o harness varre **todos os estados de grupo alcançáveis**
para cada cargo (cada grupo aberto sozinho, mais o estado "tudo fechado") —
não só o estado inicial — porque só um grupo fica aberto por vez e o pior
caso de altura de conteúdo depende de qual grupo está aberto.

## Asserções (medidas com `getBoundingClientRect()` / `getComputedStyle()`)

1. `nav.scrollHeight <= nav.clientHeight` **ou** `overflow-y` rolável
   (`auto`/`scroll`) — nunca corte mudo.
2. Nenhum item permitido de `NAV_ITEMS` fica inalcançável (união de
   `data-nav-id` vistos em **todos** os estados de grupo, por cargo).
3. `document.documentElement.scrollWidth <= window.innerWidth` — a página
   não rola na horizontal (medido também no `#host`, para isolar o shell do
   painel de QA que envolve o harness).
4. Sob `pointer: coarse`, todo alvo interativo tem ≥44px de altura e ≥8px de
   separação de qualquer outro alvo.
5. Nenhum `input`/`select`/`textarea` computa `font-size` < 16px sob
   `pointer: coarse`.

## Resultados medidos

`pointerCoarse` é lido ao vivo (`matchMedia('(pointer: coarse)').matches`),
não presumido pela largura — ver nota de metodologia. Nas 6 larguras da
matriz, só 320/375/414 vieram com `pointer: coarse` verdadeiro no preview
(explicado abaixo).

| Largura × Altura | pointerCoarse | 1. nav não corta mudo | 2. todo item alcançável | 3. sem scroll horizontal | 4. alvos de toque ≥44/8px | 5. input ≥16px |
|---|---|---|---|---|---|---|
| 320×633  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×665  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×760  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×820  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×945  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×633  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×665  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×760  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×820  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×945  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×633  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×665  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×760  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×820  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×945  | true  | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 768×633  | **false** | ✅ | ✅ | ✅ | N/A (ver nota) | N/A |
| 768×665  | false | ✅ | ✅ | ✅ | N/A | N/A |
| 768×760  | false | ✅ | ✅ | ✅ | N/A | N/A |
| 768×820  | false | ✅ | ✅ | ✅ | N/A | N/A |
| 768×945  | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×633 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×665 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×760 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×820 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×945 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×633 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×665 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×760 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×820 | false | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×945 | false | ✅ | ✅ | ✅ | N/A | N/A |

Asserções 1, 2 e 3: **verde em toda a matriz, para os dois cargos**, em
**todos** os estados de grupo varridos (não só o inicial). Isto é exatamente
o invariante que o bug original violava — é o resultado central deste passe.

Evidência de que a asserção 1 é exercida de verdade (não passa trivialmente
por nunca precisar rolar): em 1024×633 (sidebar desktop, faixa `xshort`),
cargo `dono`, grupo **Público** aberto (6 itens — o maior grupo) —
`nav.scrollHeight = 401px` > `nav.clientHeight = 397px`. O `.nav` do
`<aside class="sidebar">` de fato precisa rolar 4px, e `overflow-y: auto`
cobre isso (`fits: true`). Nas demais combinações a folga foi maior.

## Achado A (assertão 4) — corrigido e re-medido

**Estado original (vermelho):** reproduzido de forma idêntica em **todas** as
15 combinações com `pointer: coarse` verdadeiro (320/375/414 × as 5 alturas),
cargos `dono` e `recepcao`, com a opção "múltiplas arenas" ligada (caso
realista: qualquer gestor que administra mais de uma arena vê a linha "Trocar
arena" — não é cenário só do harness).

Números medidos antes do conserto (`getBoundingClientRect()`/`getComputedStyle()`):

| Elemento | Métrica | Medido | Mínimo exigido | Onde |
|---|---|---|---|---|
| `.switch-arena-link` (link "Trocar arena") | altura | 13px | 44px | `panel-shell.component.ts`, template `navTree`, classe `.switch-arena-link` |
| `.switch-arena-link` | gap até `.switcher` (acima) | 6px | 8px | idem |
| `.user-row` (link para `/painel/perfil`, roda da sidebar/drawer) | altura | 43px | 44px | idem, classe `.user-row` |

Causa: a Task 2 fez `@include ar.touch { --ar-nav-item-h: var(--ar-tap); }`
sobrescrever a altura de `.nav-item`/`.nav-group-head` sob `pointer: coarse`
(e esse mecanismo **funciona** — nenhuma violação neles em nenhum caso
medido). Mas `.switcher`, `.switch-arena-link` e `.user-row` não usam
`--ar-nav-item-h` — têm padding fixo (`.switch-arena-link { padding: 0 10px }`,
`.user-row { padding-top: 10px }`) que nenhuma regra de `ar.touch` cobria.
`.switcher` (a linha do nome da arena, logo acima) nunca apareceu como
violação porque sua altura já passa de 44px por outro motivo (avatar de 28px
+ padding), mas o **gap** entre ele e `.switch-arena-link` logo abaixo era só
6px. `.user-row` ficava a só 1px do mínimo — o tipo de achado que só aparece
medindo de verdade; deduzir do CSS não teria dado certeza do veredito.

**Conserto** (`panel-shell.component.ts`, dentro do `@media (pointer: coarse)`
já existente — o mesmo bloco onde a Task 7 pôs `.nav { gap: var(--ar-tap-gap) }`):

```css
@media (pointer: coarse) {
  .nav {
    gap: var(--ar-tap-gap);
  }

  .switch-arena-link {
    min-height: var(--ar-tap);
    margin-top: var(--ar-tap-gap);
  }

  .user-row {
    min-height: var(--ar-tap);
  }
}
```

`min-height` (não `height`) para não brigar com conteúdo intrínseco se algum
dia crescer; os dois seletores já tinham `align-items: center`, então o
conteúdo recentraliza sozinho na caixa mais alta sem precisar de nenhum outro
ajuste. Nada fora do bloco `pointer: coarse` foi tocado.

**Re-medição — as mesmas 15 combinações, depois do conserto:**

| Elemento | Métrica | Medido (depois) | Mínimo exigido |
|---|---|---|---|
| `.switch-arena-link` | altura | **44px** | 44px |
| `.switch-arena-link` | gap até `.switcher` | **8px** | 8px |
| `.user-row` | altura | **44px** | 44px |

Idêntico nas 15/15 combinações (320/375/414 × 633/665/760/820/945), ambos os
cargos. `assertion4_touchTargetsOk` do harness: `true` nas 15 — zero
`undersized`, zero `gapViolations`.

**Confirmação de que o desktop não mudou um pixel** (medido, não deduzido —
o arquivo do commit anterior a este conserto foi temporariamente restaurado,
o harness regenerado a partir dele, e a mesma largura medida antes de
restaurar o conserto):

| Largura×Altura | pointerCoarse | `.switch-arena-link` altura | `.user-row` altura |
|---|---|---|---|
| 1440×760, **antes** do conserto | false | 13px | 43px |
| 1440×760, **depois** do conserto | false | 13px | 43px |

Idêntico — o `@media (pointer: coarse)` nunca casa em `pointer: fine`, então
o código adicionado é inerte ali por construção. As 15 combinações
768/1024/1440 × 5 alturas continuam `pointerCoarse: false` e A4/A5 seguem
N/A nelas (ver nota abaixo), sem nenhuma mudança de comportamento.

**Efeito colateral verificado:** os dois elementos mais altos aumentam a
altura total que a sidebar/drawer pedem. Assertão 1 (`nav` não corta mudo) —
que é sobre o `.nav`, não sobre `.switch-arena-link`/`.user-row` diretamente,
mas a altura desses dois consome espaço do mesmo pai flex — continua **verde
nas 30 combinações** depois do conserto (ver tabela principal). O
`overflow-y: auto` do `.nav` (sidebar) e do `.panel` (drawer, achado B)
seguram a folga extra sem cortar nada.

## Nota sobre `pointer: coarse` no preview (768/1024/1440)

O Browser pane emula toque (UA Android Chrome, 5 pontos de toque, e portanto
`pointer: coarse`) automaticamente só para larguras **< 768px** — 768px
exatamente e acima ficam com `pointer: fine` mesmo sem eu pedir. Confirmado
ao vivo com `matchMedia('(pointer: coarse)').matches` em cada caso, não
presumido — por isso a coluna "pointerCoarse" existe na tabela e vem lida,
não deduzida.

Isto é uma limitação real de ambiente, não do shell: um iPad em modo retrato
a 768px de largura é `pointer: coarse` na vida real, e o preview não
reproduz isso. As asserções 4 e 5 em 768/1024/1440 ficam **N/A** — não testado
aqui, não "passou". A asserção 4 (achado A) é sobre `pointer: coarse`, não
sobre largura: como a regra que falta cobrir (`.switcher`/`.switch-arena-link`/
`.user-row`) não tem nenhuma condição de largura no CSS — só
`@media (pointer: coarse)` — é razoável esperar que a mesma falta valha em
qualquer largura com um dispositivo de toque real (ex.: um Surface ou
all-in-one touch em 1440px), mas isso **não foi medido**, só inspecionado no
CSS-fonte. Registro a diferença para não confundir inferência com medição.

## Achado B (decisão consciente de não consertar) — drawer não isola o scroll do `.nav` como a sidebar

Em largura compacta (< 900px), a navegação usa `<ar-drawer>` em vez do
`<aside class="sidebar">`. O `<div class="panel">` do drawer
(`drawer.component.ts`) não tem `display: flex; flex-direction: column`
como `.sidebar` tem — então o mesmo conteúdo projetado (`navTree`) se
comporta diferente nos dois contêineres:

- **Sidebar (desktop):** `.nav` é item de um flex column; `min-height: 0` +
  `overflow-y: auto` deixam a **lista** encolher e rolar sozinha, com
  `.user-row`/o item desabilitado sempre visíveis logo abaixo. Confirmado:
  em 1024×633/grupo Público, `nav.scrollHeight (401) > nav.clientHeight (397)`
  — o `.nav` rola internamente, como desenhado.
- **Drawer (compacto):** sem contexto flex, `.nav` nunca fica
  altura-restrita — `scrollHeight === clientHeight` em **toda** combinação
  medida (nunca precisa rolar sozinho). Quem rola é o `.panel` inteiro (que
  tem seu próprio `overflow-y: auto`), carregando junto `.user-row`,
  `.switch-arena-link` etc. Nada fica cortado (asserção 1 continua verde —
  o `.panel` sempre rola), mas em grupos grandes (ex.: dono/Público, 6 itens,
  em 375×760) o `.user-row` sai da primeira tela e só aparece rolando o
  drawer inteiro — reachable (confirmado pela asserção 2, união de estados),
  só que por um caminho diferente do desktop.

Não é uma asserção vermelha (nenhuma das 5 pede que sidebar e drawer se
comportem *igual*) — é uma assimetria estrutural real, mas **decisão
consciente de não consertar agora**: nada é cortado (asserção 1 verde), e o
`ar-drawer` também é usado pelo painel de detalhe da tela de Ranking — mudar
o modelo de layout do `.panel` agora arrisca regressão ali em troca de
nenhum ganho medido. Registrado aqui como decisão, não como pendência em
aberto.

## Verificação (build + suíte, pós-conserto do achado A)

```
$ cd frontend && npx ng build arena --configuration production
Application bundle generation complete. [5.283 seconds]
▲ [WARNING] bundle initial exceeded maximum budget. Budget 500.00 kB was not met by 256.87 kB with a total of 756.87 kB.
EXIT: 0
```
Mesmo warning pré-existente de orçamento de bundle já visto nas Tasks 9-11 (756.87 kB) — não é
erro, não relacionado a esta mudança (é CSS de dentro de um componente já existente).

```
$ npx ng test arena --watch=false --browsers=ChromeHeadless
Chrome Headless 153.0.0.0 (Mac OS 10.15.7): Executed 182 of 182 SUCCESS (0.494 secs / 0.419 secs)
TOTAL: 182 SUCCESS
```
182 — mesmo total de antes do conserto, zero `FAILED`.

## Não coberto

Este passe prova a geometria do **shell** (sidebar/drawer/topbar/bottom-nav).
Fica de fora, e ainda precisa de olho humano com dado real:

- **As 13 telas de layout partido** (`.ar-split`) — Família B, Task 8.
- **As 7 tabelas com scroll próprio** (`.ar-table-scroll`) — Família A, Task 9.
- **As 4 telas que viram card no celular** — Task 10.
- **A rolagem vertical+horizontal simultânea da grade de semana da agenda**
  (`agenda-week-grid`) — já medida em repro nas rodadas da Task 11; não
  repetida aqui (ver `tournament-bracket-data-traps.md`/notas da Task 11 no
  plano para o histórico dessa medição).
- Conteúdo real de qualquer uma das 38 telas do painel (`<ng-content>`) —
  o harness deixa `.content` vazio de propósito.
- `pointer: coarse` em larguras ≥768px (explicado acima) — o preview não
  emula toque aí; um dispositivo de toque real nessas larguras não foi
  testado.
- Ícones reais (paths SVG) — o harness usa caixas do tamanho certo, não os
  paths de `icon.component.ts`; irrelevante para geometria, mas quem for
  fazer QA visual (não geométrico) precisa olhar o app de verdade.
- Autenticação, dados reais de Firestore, navegação de verdade (roteamento
  real, badges dinâmicos como o `2` de Torneios).

## Nota de metodologia — dois bugs de medição encontrados e corrigidos no próprio harness

1. **Falso positivo de "elemento perto demais"**: a primeira versão comparava
   pares de elementos por retângulo bruto (`getBoundingClientRect()`), sem
   checar se algo estava por cima. Isso acusava gap=0 entre um item do menu
   e um slot da bottom-nav **por trás do scrim do drawer** (z-index 1000 vs
   30 — fisicamente inacessível ao mesmo tempo), e entre itens de nav
   **rolados para fora do `.nav`** (que `getBoundingClientRect()` ainda
   reporta, mesmo clipados por `overflow`). Corrigido filtrando por
   `document.elementFromPoint()` no centro de cada alvo: só entra na conta
   quem é o elemento (ou ancestral/descendente dele) realmente pintado ali.
   Isso exige o preview servido por HTTP de verdade (`preview_start`) e ao
   menos um `screenshot` já tirado na aba antes — sem isso o viewport fica
   0×0 para `elementFromPoint`.
2. **Falso negativo por `style="font-size:inherit"` na sonda**: o input de
   teste da asserção 5 tinha um `style` inline que forçava herdar do painel
   de QA (12px), mascarando se a regra global do app (`input,select,textarea
   {font-size:16px}` sob toque) realmente funciona. Removido; a sonda agora
   mede a regra real do app, não a do próprio harness.
