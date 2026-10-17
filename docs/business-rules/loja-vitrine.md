# Loja · Vitrine (tela 01 · portal do atleta + app)

Rotas: web `/loja` (`?categoria=bolas`, `?colecao=verao-2026`, `?q=bola`) · app `/loja` (`nexago://loja`).
Entrada: item "Loja" na sidebar do portal e atalho "Loja" na home do app — os dois atrás da flag
`appConfig/store.enabled` (doc ausente = desligado). A rota funciona com a flag desligada (link direto, QA).

## Dados

O catálogo (`storeProducts`, `storeConfig`, `storePickupPoints`) é só do backoffice: leva autor da
edição, saldo por local, alerta de estoque e comissão da arena. A vitrine lê um **espelho público**,
recalculado pelos gatilhos de `functions/src/store-showcase-sync.ts` a cada escrita da fonte.

| Caminho | Quem lê | Quem grava | O quê |
|---|---|---|---|
| `storeShowcase/{productId}` | qualquer um | só gatilho | produto à venda (`status: ativo` + `active`) |
| `storePublic/showcase` | qualquer um | só gatilho | banners, benefícios, categorias, coleções, arenas de retirada |
| `storeShoppers/{uid}` | dono | dono | `favoriteIds[]` (≤200), `pickupArenaId`, `recentSearches[]` (≤5), `updatedAt` |
| `storeCarts/{uid}` | dono | dono | `items[{productId, skuId, qty}]` (≤30), `updatedAt` |
| `appConfig/store` | logado | script | `enabled` (entrada da Loja) |

### `storeShowcase/{productId}`
```
name, slug, category, collection|null, brand,
badge: 'mais-vendida'|'nova'|'edicao-limitada'|null, badgeExpiresAt: Timestamp|null,
priceCents, compareAtPriceCents|null, minPriceCents, maxPriceCents,
coverUrl|null, channels{app,web}, pickup, delivery,
axes[{id,label,values[{id,label,hex?}]}], variants[{id, values{eixo:valor}, priceCents, inStock}],
soldOut, customizable, ratingAvg|null, ratingCount, soldLast30, publishedAt, updatedAt
```
Consulta do canal: `where('channels.web', '==', true)` (web) / `channels.app` (app). Sem índice composto.

### `storePublic/showcase`
```
banners[{id, kicker, title(≤50), subtitle(≤90), imageUrl|null,
         primary{label, collectionId}, secondary{label, categoryId|null, url|null}|null,
         startDate|null, endDate|null}],
benefits{pixDiscountPct|null, pickupReadyHours|null, exchangeDays},
categories[{id,label}], collections[{id,label}],
pickupArenas[{arenaId, name, address, city, state, latitude|null, longitude|null, readyHours}]
```

## Regras de exibição (iguais no web e no app)

- **Banner**: no ar se hoje (data civil de São Paulo) ∈ `[startDate, endDate]` (vazio = sem limite);
  até 3. Sem banner, o bloco some e a grade sobe. Banners vêm de `storeConfig/campaigns`
  (`scripts/seed-store-campaigns.js` até existir tela no backoffice).
- **Benefícios** (web): card do Pix só com `pixDiscountPct`; card da retirada só com `pickupReadyHours`.
- **Chips**: "Tudo" + categorias de `categories` (nessa ordem) com ≥1 produto no canal.
- **Selo**: esgotado → "Esgotado"; senão selo válido (`badge` e `badgeExpiresAt` nulo ou no futuro):
  `mais-vendida` = "Mais vendida" (web) / "Top" (app), laranja; `nova` = "Nova", escuro;
  `edicao-limitada` = "Edição limitada", escuro; sem selo e com preço "de" → "-X%" laranja,
  `X = round((1 − preço/de) × 100)`.
- **Preço exibido** = `minPriceCents`. Com `minPriceCents != maxPriceCents`: "a partir de R$ X",
  sem preço "de". Senão preço + "de" riscado quando houver.
- **Pix**: `round(preço × (100 − pct) / 100)` em centavos (meio centavo sobe) —
  `pixPriceCents` em `store-showcase.ts`; web e app espelham com o mesmo teste (28990 → 27541).
- **Nota**: só com `ratingCount ≥ 3` (ainda não há avaliações: some sempre).
- **Esgotado**: foto a 55% de opacidade; no app o "+" vira sino ("Avise-me" — lista de espera ainda
  não existe: avisa "Em breve").
- **Ordenação**: Mais vendidos = `soldLast30` desc, empate `publishedAt` desc · Menor/Maior preço =
  preço exibido · Novidades = `publishedAt` desc · Melhor avaliados = `ratingAvg` desc (nulo no fim),
  depois `ratingCount` desc.
- **Busca**: sem acento e sem caixa; todo termo precisa casar com nome, rótulo da categoria ou da
  coleção. Sugestões a partir de 2 caracteres: até 5 produtos e 3 categorias.
- **Filtrar** (app): ordenação + faixa de preço + "Só com retirada na minha arena" (`pickup` e arena
  escolhida) + "Em promoção" (`compareAtPriceCents`). Botão mostra "Filtrar · N".
- **Paginação**: o catálogo inteiro do canal vem numa consulta (cabe folgado); a grade mostra 24 e
  carrega mais 24 ao chegar no fim. Passando de ~300 produtos, paginar no servidor.

## Arena de retirada (app)

Ordem: escolhida pelo atleta (`storeShoppers.pickupArenaId`, se ainda for ponto ativo) → a mais
frequente nas reservas ativas dos últimos 60 dias que seja ponto de retirada (empate: a mais recente)
→ a mais próxima pela localização já concedida (o app não pede permissão aqui) → nenhuma
("Escolha uma arena pra retirar grátis · Escolher"). Trocar grava `pickupArenaId`.

## Fora da tela 01 (por enquanto)

Página do produto (02), carrinho/checkout e Favoritos (07) ainda não existem: os destinos abrem uma
tela "chega na próxima etapa". O carrinho só guarda intenção — o checkout tem de reler preço, saldo e
personalização no servidor (`createOrderCore`).

## Analytics

`loja_vitrine_view` · `loja_banner_click {campanha_id}` · `loja_categoria_select {categoria}` ·
`loja_busca {termo, resultados}` · `loja_produto_click {produto_id, posicao}` ·
`loja_add_rapido {produto_id}` · `loja_favoritar {produto_id, on}` · `loja_arena_trocar {arena_id}`
