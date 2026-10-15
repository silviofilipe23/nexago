# Loja · catálogo: modelo e backend (fatia A) — design

## Contexto

A área **Loja** do backoffice está sendo construída em fatias. A primeira entrega — menu na sidebar e
tela de Produtos — está no PR #693, **front-only sobre dados de exemplo**: `ProductsRepository.list()`
devolve um array const e toda ação de escrita aparece desabilitada com "Em breve".

A tela 05 · Editar produto é uma tela de escrita de ponta a ponta, e o dono decidiu em 15/10/2026 que
ela dispara a fase de backend de verdade. O trabalho foi decomposto em quatro fatias, cada uma com
spec, plano e PR próprios:

| | Fatia | Toca | Depende de |
|---|---|---|---|
| **A** | **Modelo e backend do catálogo** (este documento) | `functions/`, `firestore.rules`, `firestore.indexes.json` | — |
| B | Migrar a tela de Produtos para dados reais | `painel/loja/produtos/data/` | A, #693 |
| C | Tela 05 sem fotos | `painel/loja/produtos/` | A, B |
| D | Fotos: Storage, upload, reordenar, capa, associar à cor | `functions/`, `painel/loja/produtos/` | A, C |

A fatia A é a única que não espera ninguém, e seus arquivos não colidem com os do PR #693 — pode
seguir em paralelo, o que importa num repositório sem CI, onde PRs paralelos já se quebraram.

Este é o catálogo **da marca nexaGO** (bolas, vestuário, acessórios), vendido no app e no portal do
atleta com retirada na arena ou entrega. Não confundir com `arenas/{id}/products`, que é o cardápio do
bar da arena — outro domínio, outra dona, nenhum código compartilhado.

## Decisões

- **Escrita só por callable; leitura direto do Firestore.** É o padrão do backoffice
  (`arenas.repository` e `tournaments.repository` leem com `getDocs`; `athletes.repository` usa
  callable para o privilegiado). O que obriga o servidor: o rollup de estoque tem que bater com a soma
  dos SKUs, código de SKU e slug são únicos, e a versão que detecta conflito não pode ser escolhida
  pelo cliente. As rules do catálogo ficam curtas de propósito — leitura para admin, **escrita negada a
  todo cliente** — porque rules que validam documento grande já custaram caro neste repositório.
- **Admin da plataforma, e só.** Guard novo e estreito, `callerIsPlatformAdmin`: papel `admin` na lista
  de `roles` ou claim `superAdmin`. **Não** reusar `callerCanAccessBackoffice`, que é
  `callerIsOrganizer(user) || isSuperAdminClaim(...)` — com ele, qualquer gestor de torneio editaria
  preço e estoque do catálogo da marca. É o menor acesso que atende hoje e afrouxa depois sem migração.
- **SKUs em subcoleção, não array embutido no produto.** A tela 06 · Estoque já prevê estoque **por
  local** (CD + arenas) dentro de cada SKU: num array embutido isso cresce por produto × local no mesmo
  documento e todo ajuste disputa o mesmo doc. Em subcoleção cada SKU escreve sozinho, e a lista de
  Produtos nem lê os SKUs — vive dos rollups do pai. Descartado também um `storeSkus` plano com
  `productId`: perderia a escrita atômica junto do pai sem ganhar nada.
- **Custo fora do documento do produto**, em `storeProductCosts/{productId}`, exatamente como
  `arenas/{id}/productCosts` resolveu o mesmo problema em 24/09/2026. Regra do Firestore não esconde
  campo: se um dia o app ler `storeProducts` para a vitrine, a margem iria junto. Como lá,
  **`costCents` ausente é "não informado" e zero é um custo informado** — testar `!= null`, nunca
  falsy — e a margem é sobre a venda, `(venda − custo) ÷ venda`.
- **Unicidade por documento-chave, não por query.** `storeCatalogKeys/{key}` com `sku:NX-CAM-BRANCO-P`
  e `slug:camiseta-dry-uv50-areia` na mesma coleção. Uma consulta `collectionGroup` não é à prova de
  corrida; um documento criado na mesma transação é.
- **`stockByLocation` já nasce no SKU**, com só a chave `cd` preenchida. É um mapa sem consequência
  hoje e evita migrar todo SKU quando a tela 06 chegar.
- **`status` e `active` continuam separados**, como na tela já entregue e no desenho do mockup, mesmo
  havendo redundância com os toggles de canal.

## Modelo de dados

### `storeProducts/{productId}`

Nada aqui é segredo: o documento foi desenhado para poder ser lido pela vitrine no futuro.

| Campo | Tipo | Nota |
|---|---|---|
| `name` | string | 3–80 caracteres |
| `slug` | string | gerado do nome; único via `storeCatalogKeys` |
| `baseSku` | string | `NX-CAM`; raiz do código dos SKUs |
| `category` | string | `bolas` \| `vestuario` \| `acessorios` \| `rede-quadra` \| `kits` |
| `collection` | string \| null | `verao-2026` |
| `brand` | string | padrão `NexaGO` |
| `description` | string | até 2.000 caracteres |
| `technicalDetails` | `{label,value}[]` | vira o bloco "Detalhes" da página |
| `badge` | `'nova' \| 'mais-vendida' \| 'edicao-limitada'` \| null | ver `publishedAt` |
| `publishedAt` | timestamp \| null | primeira vez que virou `ativo` |
| `priceCents` | int > 0 | |
| `compareAtPriceCents` | int \| null | se presente, **maior** que `priceCents` |
| `axes` | `{id,label,values:[{id,label,hex?}]}[]` | no máximo 2 |
| `channels` | `{app:bool, web:bool}` | |
| `fulfillment` | `{pickup:bool, delivery:bool}` | |
| `featured` | bool | máximo 8 produtos em destaque |
| `shipping` | `{weightGrams,lengthCm,widthCm,heightCm}` \| null | obrigatório se `fulfillment.delivery` |
| `lowStockThreshold` | int ≥ 0 | padrão 3 |
| `status` | `'rascunho' \| 'ativo' \| 'arquivado'` | |
| `active` | bool | o toggle da lista |
| `photos` | `{id,url,colorValueId?}[]` | fatia D preenche; A grava `[]` |
| `soldLast30` | int | não é sensível; fica no produto |
| `skuCount`, `stockTotal`, `priceFromCents` | int | **rollups** — dono é a callable |
| `version` | int | incrementado a cada escrita |
| `createdAt`, `updatedAt` | timestamp | |
| `updatedBy` | `{uid,name}` | alimenta o banner de conflito |

`esgotado` **não é campo**: é `stockTotal === 0`, calculado na leitura, pela mesma razão que
`stockState` é derivado na tela de Produtos — contador e pill não podem divergir.

O selo `nova` **expira na leitura**, não por tarefa agendada: vale enquanto `publishedAt` estiver a
menos de 30 dias. Uma agendada para apagar o campo seria uma função a mais, um deploy a mais e uma
janela em que o selo mente; a comparação de data não erra e não custa nada.

### `storeProducts/{productId}/skus/{skuId}`

| Campo | Tipo | Nota |
|---|---|---|
| `code` | string | `NX-CAM-BRANCO-P`; único no sistema, editável |
| `barcode` | string \| null | |
| `axisValues` | `{[axisId]: valueId}` | `{cor:'branco', tam:'p'}` |
| `priceCents` | int \| null | preço próprio da variação; null = usa o do produto |
| `stockByLocation` | `{[locationId]: int ≥ 0}` | só `cd` por enquanto |
| `stock` | int ≥ 0 | soma de `stockByLocation`; dono é a callable |

O **id do documento vem dos valores de eixo** (`branco_p`), não do código: assim renomear um código
não move o documento nem perde o estoque. Produto **sem variação** não é caso especial — tem
exatamente um SKU, com `axisValues: {}` e `code` igual ao `baseSku`, para os rollups valerem sempre.

Teto de **100 SKUs por produto**. No pior caso uma troca completa de variações apaga 100 SKUs e 100
chaves e cria outros 100 de cada, mais produto, slug e custo: ~400 operações, dentro do limite de 500
por transação do Firestore. Chave cujo código não mudou não é tocada.

### `storeProductCosts/{productId}`

`{ costCents: int ≥ 0, updatedAt }`. Admin-only na leitura e na escrita. Id igual ao do produto.

### `storeCatalogKeys/{key}`

`{ productId, skuId? }`. Chave é `sku:<CODE>` ou `slug:<slug>`. Existe só para garantir unicidade
dentro da transação.

## Rules

```
match /storeProducts/{productId} {
  allow read: if isAdmin() || isSuperAdmin();
  allow write: if false;                       // só callable
  match /skus/{skuId} {
    allow read: if isAdmin() || isSuperAdmin();
    allow write: if false;
  }
}
match /storeProductCosts/{productId} { allow read: if isAdmin() || isSuperAdmin(); allow write: if false; }
match /storeCatalogKeys/{key}       { allow read: if false; allow write: if false; }
```

`isAdmin()` e `isSuperAdmin()` já existem no topo do `firestore.rules`. A vitrine pública não entra
nesta fatia: quando entrar, é só afrouxar o `read` para `status == 'ativo'`, e o custo já está fora.

## Callables

Todas com `{region: CLIENT_FACING_REGIONS, invoker: "public"}`, como `backoffice-finance.ts` — Gen2
precisa de invoker público para o preflight do browser; a autenticação fica no handler.

| Callable | Entrada | Faz |
|---|---|---|
| `saveStoreProduct` | produto + `version` (ausente = criação) + `costCents` | valida, grava produto + custo + chave de slug numa transação, incrementa `version` |
| `saveStoreProductVariations` | `{productId, version, axes[], skus[]}` | substitui eixos e SKUs, recalcula rollups, cuida das chaves de SKU |
| `archiveStoreProduct` | `{productId, version, restore?}` | alterna `status` entre `arquivado` e `rascunho` |
| `duplicateStoreProduct` | `{productId}` | cria cópia `rascunho` "Cópia de …", SKUs com estoque zerado, códigos e slug novos |

Erros: `permission-denied` (não admin), `failed-precondition` (conflito de versão, com `updatedBy` e
`updatedAt` no `details`), `invalid-argument` (validação, com a lista de campos), `not-found`.

### Validações

Publicar (`status: 'ativo'`) exige nome, categoria, `priceCents > 0`, ao menos um canal, ao menos uma
forma de entrega, `shipping` completo se houver entrega, e códigos de SKU únicos. **Rascunho salva sem
nenhuma delas.**

**Lacuna deliberada:** a spec da tela 05 também exige "≥1 foto para publicar". Fotos são a fatia D, e
`photos` fica `[]` aqui — então **a fatia A não valida foto**, senão nada seria publicável e a fatia B
não teria produto ativo para listar. A regra entra junto com o upload, na D, com o teste que a prende.

## Rollups e invariantes

Mantidos pela callable, nunca pelo cliente, e verificados por teste:

- `stockTotal` = soma de `sku.stock` de todos os SKUs.
- `sku.stock` = soma dos valores de `stockByLocation`.
- `skuCount` = número de documentos em `skus`.
- `priceFromCents` = menor entre `priceCents` do produto e os `priceCents` não nulos dos SKUs.
- Toda escrita incrementa `version` em 1 e reescreve `updatedAt`/`updatedBy`.

## Conflito

O cliente manda a `version` que leu. Diferente da gravada → `failed-precondition` com quem salvou e
quando, que é o que o banner "Este produto foi alterado por Ana S. às 15:42 · Recarregar" precisa.
Criação não manda `version` e o documento nasce com `version: 1`.

## Seed

`functions/scripts/seed-store-catalog.js`, no padrão dos vizinhos (`--project`, `--yes`), escrevendo
pelo Admin SDK — que não passa pelas callables nem pelas rules. Semeia os 8 produtos do mock da tela de
Produtos, com a Camiseta ganhando os eixos reais do mockup: 3 cores × 5 tamanhos = 15 SKUs, somando
**31 SKUs** no total, para a fatia B encontrar exatamente os números que a tela já testa.

## Testes

`npm test` em `functions/` compila e roda `lib/*.test.js`, então um `src/store-catalog.test.ts` entra
sozinho na suíte.

- **Funções puras**: geração de código de SKU a partir dos eixos, geração de slug com desempate,
  rollups, validação de publicação campo a campo, comparação de versão, cópia na duplicação.
- **Handlers** com Firestore fake, como os `*.test.ts` vizinhos: admin passa e organizador não;
  conflito devolve `failed-precondition`; código de SKU repetido entre produtos diferentes é recusado;
  custo entra em `storeProductCosts` e nunca no documento do produto.
- **Rules** em `functions/test/store-catalog.rules.test.mjs`, rodando no emulador por
  `npm run test:rules`: admin lê, organizador não lê, ninguém escreve.

## Fora do escopo

- Qualquer tela. A fatia B migra a tela de Produtos; a C constrói a tela 05.
- Fotos e Storage (fatia D), e a validação de foto na publicação.
- Estoque por local e transferências (tela 06): o campo existe, a mecânica não.
- Vitrine pública para app e portal.
- `loja.produtos.editar` como permissão fina: hoje é admin da plataforma inteiro.
