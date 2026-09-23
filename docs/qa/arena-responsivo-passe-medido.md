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
- `index.html` — a página do harness **auto-contida**: CSS e JS embutidos
  via `<style>`/`<script>` inline, não `<link>`/`<script src>` (motivo na
  nota de metodologia, item 8) — é o único arquivo que o navegador
  realmente carrega;
- `shell.css` — CSS global compilado + CSS real do shell + CSS real do drawer,
  concatenados, escrito à parte só para diff/inspeção isolada (o `index.html`
  não o referencia);
- `harness.js` — mesmo conteúdo que vai embutido no `index.html`, também
  escrito à parte para diff/inspeção. Lógica cliente: `canSee`,
  `buildNavSections`, `isOpen`, `bottomItems` são portas 1:1 das funções
  reais de `panel-nav.model.ts` / `panel-shell.component.ts` — mesmo
  algoritmo, dado extraído do fonte a cada geração (não copiado à mão);
- `nav-data.json` — os `NAV_ITEMS` reais extraídos de `panel-nav.model.ts` +
  as áreas do cargo `recepcao` extraídas de `arena-roles.model.ts`, em JSON.

O gerador falha alto (com mensagem clara) se algum arquivo-fonte não existir,
se a extração de CSS não achar o marcador `styles: \`...\``, ou se a extração
de `NAV_ITEMS` não casar nenhum item — para nunca gerar um harness
silenciosamente desalinhado do componente real. `measureTouchTargets()`
(dentro do harness) tem a mesma guarda: se `TOUCH_TARGET_SELECTOR` não casar
nenhum elemento num estado renderizado, lança erro em vez de devolver "zero
alvos, zero violações" em silêncio (item 5 da nota de metodologia).

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
navigate("http://localhost:4398/<subpasta-do-harness>/")
```

Depois de **regenerar** o harness (rodar o script de novo sobre o mesmo
diretório), **recarregue a página** (`navigate` de novo, não só o resize) —
o servidor estático usado aqui pode devolver `304 Not Modified` pra uma
reescrita recente do mesmo caminho, e como CSS/JS agora vão embutidos no
próprio `index.html` (não mais em arquivos `<link>`/`<script src>`
separados), um reload comum já basta para pegar a versão nova (ver nota de
metodologia, item 8).

## A matriz

**Larguras:** 320, 375, 414, 768, 1024, 1440
**Alturas:** 633, 665, 760, 820, 945
**Cargos:** `dono` (21 itens) e `recepcao` (10 itens) — os dois testados em
**todas** as 30 combinações de largura×altura (não só uma amostra).

Por combinação, o harness varre **todos os estados de grupo alcançáveis**
para cada cargo (cada grupo aberto sozinho, mais o estado "tudo fechado") —
não só o estado inicial — porque só um grupo fica aberto por vez e o pior
caso de altura de conteúdo depende de qual grupo está aberto. Em largura
compacta, varre também um estado extra com o **drawer fechado** — o padrão
real antes de qualquer interação — pra medir `.nav-trigger`/`.topbar-avatar`/
`.bottom-slot`, que ficam permanentemente cobertos pelo drawer enquanto ele
está aberto (ver "Nota de metodologia", item 4).

### Procedimento em largura compacta (< 900px): abrir o drawer exige esperar um screenshot

`drawer.component.ts` anima a entrada do painel (`ar-drawer-in`/
`ar-drawer-in-left`, 240ms). Medido ao vivo que essa animação **não
avança** nem com `animation-duration` zerado nem com reflow síncrono
forçado (`offsetHeight`) — só com tempo de **parede real** passando, e só é
"lida" pelo motor de layout quando um `screenshot` força um paint de
verdade (ver item 7 da nota de metodologia). Sem isso, o painel do drawer
mede com `transform: translateX(±100%)` ainda aplicado — fora da tela —
corrompendo qualquer alcançabilidade baseada em `elementFromPoint` no mesmo
instante em que o drawer abre.

Por isso, em qualquer largura compacta, a sequência tem de ser:

```js
window.arenaHarness.openDrawer();     // 1. abre (dispara a animação)
// 2. computer{action:"screenshot"} — força o paint que assenta o transform
window.arenaHarness.sweepRole('dono');       // 3. mede (drawer já assentado)
window.arenaHarness.openDrawer();            // 4. reabre — sweepRole fecha o
                                              //    drawer na própria limpeza
// 5. computer{action:"screenshot"} de novo
window.arenaHarness.sweepRole('recepcao');   // 6. mede o segundo cargo
```

`sweepRole()` **não reabre o drawer sozinho ao restaurar estado** de
propósito — reabrir sem um screenshot no meio contaminaria a leitura
seguinte com o mesmo problema. `window.arenaHarness.summary(sweepDono,
sweepRecepcao)` aceita os dois resultados já calculados, pra não precisar
rodar `sweepRole` de novo dentro da função de resumo. Em largura NÃO
compacta (sidebar direta, sem drawer/animação) `window.arenaHarness.summary()`
sem argumentos basta — é o que as 10 combinações 1024/1440 usaram.

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

A coluna "alvos medidos" é `assertion4_targetsMeasuredCount` — a união de
todo alvo **alcançável de verdade** (não obscurecido, não fora do viewport)
visto em qualquer estado varrido, os dois cargos. É o número que a guarda
do item 5 da nota de metodologia protege: se um seletor sair de sincronia
com o shell, ele cai — visível aqui, não escondido atrás de um
`assertion4_touchTargetsOk: true` que na verdade mediu zero.

| Largura × Altura | pointerCoarse | alvos medidos | 1. nav não corta mudo | 2. todo item alcançável | 3. sem scroll horizontal | 4. alvos de toque ≥44/8px | 5. input ≥16px |
|---|---|---|---|---|---|---|---|
| 320×633  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×665  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×760  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×820  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 320×945  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×633  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×665  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×760  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×820  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 375×945  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×633  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×665  | true  | 35 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×760  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×820  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 414×945  | true  | 36 | ✅ | ✅ | ✅ | ✅ (corrigido — ver achado A) | ✅ |
| 768×633  | **false** | 31 | ✅ | ✅ | ✅ | N/A (ver nota) | N/A |
| 768×665  | false | 31 | ✅ | ✅ | ✅ | N/A | N/A |
| 768×760  | false | 31 | ✅ | ✅ | ✅ | N/A | N/A |
| 768×820  | false | 31 | ✅ | ✅ | ✅ | N/A | N/A |
| 768×945  | false | 31 | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×633 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×665 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×760 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×820 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1024×945 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×633 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×665 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×760 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×820 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |
| 1440×945 | false | 29 | ✅ | ✅ | ✅ | N/A | N/A |

**Antes do conserto do buraco de cobertura (item 4 da nota de metodologia),
a contagem em 320/375/414 (compacto + toque) era só 7-9** — `.nav-trigger`,
`.topbar-avatar` e `.bottom-slot` nunca entravam, porque o drawer ficava
aberto o tempo todo durante a varredura e os três só existem alcançáveis
com ele fechado. A contagem subir para 35-36 é a prova de que o buraco era
real; nenhuma asserção ficou vermelha com a cobertura maior — o sistema
não achou violação nova nos alvos que passaram a ser medidos (achado A já
cobria os únicos dois que violavam, e ambos já estavam no conjunto medido
antes).

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
violação porque sua altura mede **exatamente** 44px (avatar de 28px +
padding de 7px×2 + borda de 1px×2 = 44 — coincidência de dimensionamento,
não uma regra de toque cobrindo o seletor), na fronteira, não acima dela —
mas o **gap** entre ele e `.switch-arena-link` logo abaixo era só 6px.
`.user-row` ficava a só 1px do mínimo — o tipo de achado que só aparece
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

## Verificação (build + suíte)

Rodado depois de cada rodada de conserto — do achado A (mudança em
`frontend/`) e, nesta rodada, dos buracos do próprio harness (mudança só em
`scripts/qa/`, que não afeta build/suíte do Angular, mas rodado de novo por
disciplina):

```
$ cd frontend && npx ng build arena --configuration production
Application bundle generation complete. [5.130 seconds]
▲ [WARNING] bundle initial exceeded maximum budget. Budget 500.00 kB was not met by 256.87 kB with a total of 756.87 kB.
EXIT: 0
```
Mesmo warning pré-existente de orçamento de bundle já visto nas Tasks 9-11 (756.87 kB) — não é
erro, não relacionado a esta mudança (é CSS de dentro de um componente já existente).

```
$ npx ng test arena --watch=false --browsers=ChromeHeadless
Chrome Headless 153.0.0.0 (Mac OS 10.15.7): Executed 182 of 182 SUCCESS (0.368 secs / 0.325 secs)
TOTAL: 182 SUCCESS
```
182 — mesmo total de antes, zero `FAILED`.

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

## Nota de metodologia — bugs de medição encontrados e corrigidos no próprio harness

Esta seção é o que torna o harness confiável para quem for reusá-lo daqui a
seis meses — ela **cresce**, não encolhe. Nenhum dos bugs abaixo mudou um
veredito já reportado (as asserções 1/2/3/5 continuam verdes na matriz
inteira depois de cada conserto), mas todos eram caminhos reais para "passa
em silêncio", que é exatamente o modo de falha que esta camada existe para
eliminar.

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
3. **Falso positivo de ancestralidade estrutural no conserto do item 1**
   (achado numa revisão): a condição de alcançabilidade aceitava `hit ===
   el || el.contains(hit) || hit.contains(el)` — o último ramo (o alvo é
   descendente do elemento pintado ali) trata qualquer ANCESTRAL estrutural
   como prova de alcance, e ancestralidade não é pintura. Reproduzido: um
   elemento recortado pelo `overflow` de um ancestral, posicionado fora da
   região visível desse ancestral (mas com retângulo cru ainda dentro do
   viewport), devolve `<html>` no `elementFromPoint` — e `html.contains(el)`
   é sempre `true`, mesmo com o elemento invisível. Medido ao vivo, antes e
   depois do conserto, no mesmo hit-test real:

   | | `hit` no ponto | `hit` é ancestral do alvo | lógica antiga (`\|\| hit.contains(el)`) | lógica nova (`hit===el \|\| el.contains(hit)`) |
   |---|---|---|---|---|
   | Elemento recortado, fora da região visível do ancestral | `HTML` | sim | **alcançável (falso positivo)** | **inalcançável (correto)** |

   Corrigido removendo o ramo `hit.contains(el)` — fica só `hit === el ||
   el.contains(hit)` (o ponto pintou o próprio alvo, ou um filho dele, ex.:
   o ícone/texto por dentro de um `nav-item`). Isso não flipou nenhum
   veredito já reportado só porque o transbordo real do `.nav` é minúsculo
   (≤4px) — item recortado sempre caía sobre um irmão de verdade, nunca
   sobre `<html>`. Não era garantia; era sorte da geometria atual. Cair para
   "inalcançável" no caso ambíguo é o erro seguro aqui: um falso-negativo
   vira uma linha extra em `obscured` pra conferir à mão; um falso-positivo
   passaria em silêncio.
4. **Buraco de cobertura: três classes de alvo de toque nunca eram medidas**
   (achado numa revisão). `sweepRole()` abria o drawer uma vez no início e
   nunca fechava durante a varredura de estados de grupo — necessário pra
   medir o `.nav`, mas isso deixa `.nav-trigger`/`.topbar-avatar` cobertos
   pelo `brand` do próprio drawer e `.bottom-slot` atrás do `scrim` em
   **toda** célula compacta. O "15/15, zero violações" relatado antes só
   cobria as 5 classes que vivem dentro do painel do drawer — os controles
   da topbar e da bottom-nav nunca tinham sido verificados no estado padrão
   (drawer fechado). Corrigido acrescentando uma passada extra com o drawer
   fechado ao fim de cada `sweepRole()` (estado `'drawer-fechado'` na lista
   `perGroup`), e a limpeza da função **não reabre** o drawer ao restaurar
   estado — reabrir sem um screenshot no meio recriaria o problema do item 7
   pra próxima leitura. Efeito medido: a contagem de alvos medidos em
   320/375/414×toque subiu de 7-9 para 35-36 (tabela de resultados acima) —
   é a prova de que o buraco era real.
5. **Sem guarda contra o seletor sair de sincronia, e a contagem de alvos
   nunca aparecia em lugar nenhum** (achado numa revisão). A extração de
   `NAV_ITEMS`/CSS já falhava alto se não achasse nada — decisão certa desde
   o início —, mas `measureTouchTargets()`/`summarize()` nunca afirmavam
   `targetCount > 0`, e a contagem não aparecia nem no resumo nem na tabela
   do documento. Se alguém renomear uma classe em
   `panel-shell.component.ts` sem espelhar em `TOUCH_TARGET_SELECTOR`, a
   asserção 4 passaria a devolver `true` pra sempre, medindo zero elementos
   — silenciosamente. Corrigido com uma guarda (`els.length === 0` lança
   erro, mesmo espírito da guarda de `NAV_ITEMS`) e expondo
   `assertion4_targetsMeasuredCount`/`assertion4_targetsMeasured` no resumo
   — agora é a coluna "alvos medidos" da tabela de resultados, visível pra
   quem ler o documento perceber se a cobertura cair.
6. **`el.hidden` não escondia nada de verdade** (achado ao tentar verificar
   o conserto do item 4 — a contagem continuava batendo 0 pros três alvos
   mesmo com o drawer supostamente fechado). `.topbar`/`.sidebar`/
   `.bottom-nav`/`.scrim` (CSS real, extraído do shell/drawer) declaram o
   próprio `display` (`flex`/`flex`/`grid`/`flex`) — regra de origem
   **autor**, e origem autor sempre ganha da origem **UA** (o
   `[hidden]{display:none}` embutido do navegador), **independente de
   especificidade ou ordem no cascade**. Resultado: `el.hidden = true` não
   escondia nada — os quatro contêineres continuavam ocupando layout e
   pintando por cima uns dos outros mesmo "escondidos" (inclusive o
   `.sidebar`, sempre presente no DOM do harness — diferente do app real,
   que remove o `<aside>` via `@if` — ocupando uma linha fantasma no grid do
   `.shell` em largura compacta). Corrigido com um `setVisible(el, show)`
   que força `el.style.display` explicitamente: estilo inline sempre ganha
   de regra de classe, não importa a origem.
7. **A animação de entrada do drawer precisa de tempo de parede real pra
   assentar, e só um `screenshot` de verdade "lê" esse tempo** (achado ao
   verificar o conserto do item 4 na prática — mesmo com o item 6
   corrigido, a contagem de alvos dentro do drawer aberto continuava vindo
   zero). `drawer.component.ts` anima a entrada (`ar-drawer-in-left`,
   `transform: translateX(-100%) → none`, 240ms). Neste motor de preview, o
   relógio dessa animação não avança sozinho — nem com `animation-duration:
   0.01ms !important`, nem com `animation: none !important` no reset do
   harness, nem com reflow síncrono forçado (`void el.offsetHeight`).
   **Só esperar tempo real e então tirar um `screenshot`** assenta o
   `transform` (`getBoundingClientRect().left` medido `-320` → `0` no mesmo
   elemento, no mesmo estado, só com um screenshot no meio). Não é um bug
   de código pra corrigir no harness — é uma restrição real do ambiente de
   preview, documentada como parte do **procedimento** (ver "Procedimento
   em largura compacta" acima): `openDrawer()` → `screenshot` →
   `sweepRole()`, sempre nessa ordem, pros dois cargos.
8. **O servidor estático podia devolver conteúdo desatualizado depois de
   regenerar o harness** (achado ao verificar o item 7 — um `screenshot`
   não bastava, e a causa acabou sendo esta, não a animação, numa das
   tentativas). Comparando `document.styleSheets` (contagem de regra
   presa numa versão antiga) contra um `fetch()` manual pro mesmo `href`
   (contando a versão nova certa) no mesmo carregamento de página, ficou
   claro que o `<link>`/`<script src>` às vezes carregava uma resposta
   desatualizada do "serve" (o servidor estático usado por
   `preview_start`) mesmo depois do arquivo em disco já ter sido
   reescrito — um query string de cache-busting por geração não resolveu
   (o sintoma se repetiu idêntico com a URL trocada). Não persegui a causa
   raiz no servidor; eliminei a classe inteira do problema **embutindo**
   `shell.css`/`harness.js` direto no `index.html` via `<style>`/`<script>`
   inline, em vez de referenciá-los por `<link>`/`<script src>` — sem
   requisição HTTP separada pra esses dois arquivos, não tem o que ficar
   desatualizado. `shell.css`/`harness.js` continuam escritos em disco à
   parte, só para inspeção/diff isolado (não são mais o que o navegador
   carrega).
