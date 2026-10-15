# Backoffice · Loja · menu + tela de Produtos — design

## Contexto

O backoffice (`frontend/projects/backoffice`) hoje tem Início, Arenas, Torneios, Avaliações,
Organizadores, Atletas, Financeiro, Moderação (em breve) e Equipe. A **Loja** é uma área nova: a venda de
produtos da marca nexaGO (bolas, vestuário, acessórios, rede e quadra) com retirada na arena ou entrega em
casa. O desenho do produto prevê 8 telas — Visão geral, Pedidos, Personalizados, Produtos, Estoque,
Retirada & frete, Cupons & promoções, Trocas.

Duas constatações da varredura do repositório em 15/10/2026:

- **Não existe backend de loja.** Nenhuma coleção de produtos ou pedidos no `firestore.rules`, nenhuma
  callable em `functions/src`. O que existe é o estoque/cardápio **da arena** (`arena-comanda-app-orders`,
  produtos do bar), que é outro domínio e não se reaproveita aqui.
- **O `panel-shell` tem nav plana.** `PanelNavItem` é `{ id, label, icon, route }`, sem hierarquia nem
  contador. A Loja precisa das duas coisas, e o shell é compartilhado por todas as telas do painel.

Por isso a Loja inteira é um programa, não uma tarefa. Este documento cobre **só o primeiro sub-projeto**:
o menu Loja no shell e a tela de Produtos. Cada tela seguinte ganha seu próprio ciclo spec → plano →
implementação.

## Decisões

- **Entrega só de front, com dados de exemplo.** Decisão do dono: validar layout e interação antes de
  congelar o modelo de dados. Nesta fase não há Firestore, rules nem callable. O modelo descrito abaixo é o
  contrato *do front* — a forma que a tela consome — e vira a base da modelagem real na fase seguinte.
- **O menu nasce no shell existente**, com `PanelNavItem` virando união discriminada de três tipos (link,
  grupo, em breve). Alternativas descartadas: (B) um sub-shell só da Loja, que duplicaria sidebar, marca e
  rodapé de usuário para ganhar isolamento que não precisamos; (C) os 8 itens no nível raiz da nav, que não
  é o desenho e deixaria a sidebar com 17 itens soltos.
- **Só Produtos ganha rota.** Os outros 7 itens da Loja aparecem no submenu como **"Em breve"**
  desabilitados — o tratamento que `Moderação` já recebe hoje. Ninguém clica e cai em tela vazia.
- **Repositório com a forma do real.** `ProductsRepository.list()` devolve `Promise<StoreProduct[]>`, igual
  aos repositórios de verdade (`athletes.repository.ts`, `arenas.repository.ts`). O array de exemplo mora em
  arquivo separado. Quando o backend existir, troca-se o miolo do repositório e a tela não muda.
- **Lógica de filtro em funções puras**, fora do componente, com teste — padrão que o repo já usa
  (`tournament-status.spec.ts`, `role-form.state.spec.ts`). O componente só segura signals e compõe.
- **"Esgotado" e "estoque baixo" são derivados de `stock`**, nunca campos gravados. Contador de aba e pill da
  linha saem da **mesma função**, então não têm como divergir.
- **Filtros na URL** (query string), como a spec de Pedidos pede para aquela tela: a visão filtrada é
  compartilhável e sobrevive ao F5.
- **Ações de escrita ficam desabilitadas** com "Em breve": `Novo produto`, `Importar planilha`, menu `⋯` da
  linha e as ações em lote. O toggle **Ativo** é exceção: altera o estado em memória, porque é o que prova
  que a lista e os contadores reagem.
- **O card leva o kicker "dados de exemplo"**, para ninguém confundir a tela com produção.

## Fora do escopo

- Backend de qualquer espécie: coleção, rules, callable, índice.
- As outras 7 telas da Loja.
- Formulário de produto, importação de planilha, ações em lote de verdade.
- O badge `3` em Moderação que aparece no desenho: é número inventado numa área que não é desta entrega.

## Shell — menu com submenu

### Tipo

`PanelNavItem` vira união discriminada, porque três comportamentos diferentes em campos opcionais
(`route: string | null` + `children?` + `badge?`) obrigam o template a adivinhar a intenção:

```ts
type PanelNavItem =
  | { kind: 'link'; id: string; label: string; icon: PanelIconName; route: string; badge?: number }
  | { kind: 'soon'; id: string; label: string; icon: PanelIconName; badge?: number }
  | { kind: 'group'; id: string; label: string; icon: PanelIconName; children: PanelNavItem[] };
```

Os itens atuais migram direto: todos viram `kind: 'link'`, menos `Moderação`, que vira `kind: 'soon'`.
Grupo não aninha dentro de grupo — um nível só.

### Item Loja

Entre **Financeiro** e **Moderação**, com ícone novo `bag` (o conjunto atual não tem sacola):

| Filho | Tipo | Badge |
|---|---|---|
| Visão geral | soon | — |
| Pedidos | soon | 12 |
| Personalizados | soon | 2 |
| **Produtos** | **link** → `/painel/loja/produtos` | — |
| Estoque | soon | 4 |
| Retirada & frete | soon | — |
| Cupons & promoções | soon | 2 |
| Trocas | soon | 2 |

Os badges são números de exemplo, numa constante única comentada como provisória. Saem quando os
contadores reais existirem.

### Abertura e fechamento

Um grupo está aberto quando **a rota ativa está dentro dele** ou quando **o usuário o abriu**; o clique no
cabeçalho do grupo alterna. O override manual vale enquanto o usuário fica na mesma URL: o signal guarda
`{ url, openIds }` e é ignorado quando `url` não é mais a atual, então navegar devolve o comando à rota sem
precisar de `effect` (que no repo já rendeu loop quando leu signal dentro de helper).

O cabeçalho do grupo não navega: é `<button>`, com `aria-expanded`. O filho ativo recebe o mesmo destaque
que os itens de primeiro nível já usam.

## Tela de Produtos

Rota `/painel/loja/produtos`, título `Produtos — NexaGO Backoffice`, `canActivate: [authGuard]`,
`loadComponent` — igual às demais. Padrão `/painel/...` do app, não o `/backoffice/...` que aparece nas
specs de desenho.

### Modelo consumido pela tela

```ts
type ProductCategory = 'bolas' | 'vestuario' | 'acessorios' | 'rede-quadra' | 'kits';
type ProductChannel = 'web' | 'app';

interface StoreProduct {
  id: string;
  name: string;
  sku: string;                      // NX-BOL
  barcodes: string[];               // códigos das variações, para a busca
  category: ProductCategory;
  collections: string[];            // ex.: 'verao-2026'
  variations: number;               // quantidade de SKUs filhos
  priceCents: number;
  compareAtPriceCents: number | null; // preço riscado
  stock: number;
  lowStockThreshold: number;
  soldLast30: number;
  channels: ProductChannel[];
  status: 'ativo' | 'rascunho';     // rascunho = nunca publicado
  active: boolean;                  // publicado e ligado
  imageUrl: string | null;          // null → placeholder listrado
}
```

`status` e `active` são coisas diferentes: rascunho é produto incompleto, que nunca foi ao ar; `active` é o
toggle de um produto publicado. O desenho tem aba para os dois.

Derivados (em `product-filters.ts`, nunca gravados):

- `stockState(p)` → `'esgotado'` se `stock === 0`; `'baixo'` se `0 < stock <= lowStockThreshold`; senão `'ok'`.
- Pill da coluna Estoque e contador da aba saem desta função.

### Cabeçalho

Kicker `LOJA`, título `Produtos`, pill `N PRODUTOS · M SKUS` (M = soma de `variations`) — do **acervo
inteiro**, não do filtro, senão o número dança a cada clique. Botões `Importar planilha` e `Novo produto`
(primário) desabilitados com `title="Em breve"`.

### Abas

`Todos · Ativos · Rascunhos · Esgotados · Estoque baixo`, com contador. Cada contador é calculado sobre o
resultado dos **outros** filtros (busca, categoria, canal, coleção), não sobre a lista crua — assim o número
na aba é o que o usuário vai encontrar ao clicar.

| Aba | Regra |
|---|---|
| Todos | tudo |
| Ativos | `active === true` |
| Rascunhos | `status === 'rascunho'` |
| Esgotados | `stockState === 'esgotado'` |
| Estoque baixo | `stockState === 'baixo'` |

### Filtros

- **Busca** (debounce 300 ms): `name`, `sku` e `barcodes`, sem acento e sem caixa.
- **Categoria**, **Canal**, **Coleção**: seleção única por enquanto; o `<select>` do repo tem armadilha
  conhecida com `[value]`, então o binding é por `[selected]`/`value` no `<option>`.
- **Chips de categoria** à direita (Bolas, Vestuário, Acessórios, Rede & quadra, Kits): atalho para o mesmo
  filtro de categoria, clicar no chip ativo limpa.
- **URL**: `aba`, `q`, `categoria`, `canal`, `colecao`. Valor padrão não vai para a URL, e a busca só
  escreve na URL depois do debounce — senão cada tecla vira uma entrada no histórico.

### Tabela

Colunas: `☐ · Produto (foto, nome, SKU) · Categoria · Variações · Preço · Estoque · Vendas 30d · Canais ·
Ativo · ⋯`. Segue o padrão de grid do painel (`.table-head` / `.table-row` com `grid-template-columns`), não
`<table>` — é o que as telas existentes usam.

- **Preço**: valor atual e, quando houver `compareAtPriceCents`, o antigo riscado embaixo.
- **Estoque**: `86 un.` em texto; pill amarelo `9 · BAIXO` quando baixo; pill vermelho `ESGOTADO` quando zero.
- **Canais**: chips `WEB` / `APP`.
- **Ativo**: `bo-toggle`, com `ariaLabel` nomeando o produto. Alterna o estado em memória e os contadores
  das abas reagem.
- **⋯**: botão desabilitado, "Em breve".
- Clicar na linha não navega (a tela de detalhe não existe).

### Seleção

Checkbox por linha e no cabeçalho (seleciona a página). Com ≥1 selecionado aparece a barra laranja-tint
`N selecionados` com `Ativar`, `Desativar` e `Exportar` **desabilitados** ("Em breve") e um `Limpar`
funcional. A seleção é limpa quando o filtro muda, senão o usuário age sobre linhas que não vê.

### Estados

| Estado | Tela |
|---|---|
| Carregando | skeleton de 8 linhas |
| Vazio por filtro | "Nenhum produto com esses filtros" + botão "Limpar filtros" |
| Vazio total | "Nenhum produto cadastrado" |
| Erro | `.bo-alert` + "Tentar de novo" |

O repositório de exemplo não falha, mas o caminho de erro já fica montado — é o que a troca pelo backend vai
exercitar.

## Dados de exemplo

Os 8 produtos do desenho. Todos com `status: 'ativo'`, `channels: ['web', 'app']` e `imageUrl: null`.

| SKU | Nome | Categoria | Var. | Preço | De | Estoque | Limite | 30d | Ativo | Coleção |
|---|---|---|---|---|---|---|---|---|---|---|
| NX-BOL | Bola NexaGO Pro Beach | bolas | 2 | 289,90 | 329,90 | 86 | 10 | 64 | sim | linha-pro |
| NX-CAM | Camiseta Dry UV50 Areia | vestuario | 15 | 129,90 | — | 34 | 10 | 51 | sim | verao-2026 |
| NX-OCU | Óculos Polarizado Sunline | acessorios | 3 | 199,90 | — | 22 | 10 | 21 | sim | verao-2026 |
| NX-VIS | Viseira Dry Fit | acessorios | 3 | 69,90 | — | 9 | 12 | 47 | sim | verao-2026 |
| NX-RED | Rede Oficial Beach 8,5 m | rede-quadra | 1 | 459,90 | — | 14 | 6 | 6 | sim | linha-pro |
| NX-KIT | Kit Demarcação de Quadra | rede-quadra | 1 | 349,90 | — | 11 | 12 | 9 | sim | linha-pro |
| NX-SQU | Garrafa Térmica 750 ml | acessorios | 4 | 89,90 | 109,90 | 58 | 10 | 33 | sim | verao-2026 |
| NX-MOC | Mochila Praia Impermeável | acessorios | 2 | 239,90 | — | 0 | 10 | 12 | **não** | — |

Preços em centavos no código. Um ou dois códigos de barras fictícios por produto, só para a busca ter o que
casar. `NX-MOC` sem coleção de propósito, para o filtro de coleção ter o caso vazio.

Os derivados que isso produz: **8 produtos · 31 SKUs** no pill do cabeçalho, e abas `Todos 8 · Ativos 7 ·
Rascunhos 0 · Esgotados 1 · Estoque baixo 2`. A categoria `kits` existe no tipo sem nenhum produto — é o
chip que filtra para o vazio.

## Arquivos

Novos, em `frontend/projects/backoffice/src/app/painel/loja/produtos/`:

| Arquivo | Papel |
|---|---|
| `panel-produtos.component.ts` | tela: shell, cabeçalho, abas, filtros, tabela, estados |
| `ui/product-row.component.ts` | uma linha da tabela |
| `data/products.repository.ts` | `list()` + tipos |
| `data/products.mock.ts` | os 8 produtos de exemplo |
| `data/product-filters.ts` | `stockState`, `filterProducts`, `tabCounts`, `searchMatches` |
| `data/product-filters.spec.ts` | testes das funções puras |
| `panel-produtos.component.spec.ts` | teste de fiação |

Alterados: `ui/panel-shell.component.ts` (união discriminada + grupo + badge), `ui/icon.component.ts`
(ícone `bag`), `app.routes.ts` (rota nova).

Se `panel-produtos.component.ts` passar de ~450 linhas, a barra de filtros sai para
`ui/product-filters-bar.component.ts`. Abaixo disso, dividir só espalha a tela.

## Testes

- `product-filters.spec.ts`: `stockState` nas três faixas e na borda (`stock === lowStockThreshold`); busca
  achando por nome, por SKU e por código de barras, ignorando acento e caixa; `filterProducts` combinando
  aba + busca + categoria; `tabCounts` respeitando os outros filtros.
- `panel-produtos.component.spec.ts`: trocar de aba muda as linhas renderizadas, e o toggle Ativo move o
  contador da aba Ativos. Função pura passando não prova que a tela está ligada nela — é erro que já
  aconteceu neste repo.
- `ng build backoffice` precisa passar: `tsc` e Karma não checam template, e erro de binding só aparece no
  build.

## Divergências conscientes do desenho

1. **Contador de "Estoque baixo".** O desenho mostra `4` na aba mas pill de baixo em 2 linhas (9 e 11 un.).
   Como contador e pill saem da mesma função, os dois números vão bater: os thresholds do mock deixam
   baixos exatamente as linhas que o desenho desenha com pill, e a aba mostra `2`. Mudar isso é mexer em
   `lowStockThreshold` no arquivo de exemplo, nada mais.
2. **Sidebar.** O desenho omite Pré-cadastradas, Avaliações e Equipe. São telas reais em uso; ficam onde
   estão.
