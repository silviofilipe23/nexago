# Loja · Avaliação da compra (06b web · 08b/08c app) e avaliações no produto (02)

Quem comprou avalia o que recebeu. Só pedido **entregue (`ent`) ou retirado (`rtd`)** pode ser
avaliado, e só pelo dono (`customer.uid`). Toda avaliação é "Compra verificada" — não existe
avaliação de quem não comprou.

## Onde aparece

- **Meus pedidos** (web `/loja/pedidos`, app `/loja/pedidos`): pedido `ent`/`rtd` sem avaliação
  mostra o botão **"Avaliar compra"** em destaque; no histórico do app, a etiqueta **"Avaliar"**.
  Avaliado e dentro do prazo de edição → "Editar avaliação"; fora do prazo → "Avaliado" (só
  leitura). O detalhe do pedido (web e app) tem o mesmo botão.
- **Web 06b**: janela por cima de Meus pedidos, todos os itens numa tela só.
- **App 08b/08c**: um item por vez (`Pular` / `Próximo item`), depois a retirada (só pedido de
  arena), e a tela de agradecimento com o resumo. Rota `/loja/pedidos/:orderId/avaliar`.
- **Produto (02)**: seção "Avaliações" com nota média, distribuição, caimento do tamanho, filtros e
  os comentários.

## O que se avalia

Por **produto do pedido** (duas linhas do mesmo produto em cores diferentes viram uma avaliação,
com a variação da primeira linha):

| Campo | Regra |
|---|---|
| `rating` | inteiro 1–5, obrigatório pro item contar. Rótulos: Ruim, Regular, Bom, Muito bom, Excelente |
| `tags` | subconjunto de `qualidade`, `conforto`, `tamanho`, `foto`, `custo`, `durabilidade` (Qualidade, Conforto, Tamanho certo, Igual à foto, Custo-benefício, Durabilidade) |
| `fit` | `pequeno` \| `certo` \| `grande` \| `null` — só produto com eixo **Tamanho** (rótulo normalizado = "tamanho"); nesse produto a etiqueta "Tamanho certo" sai do formulário e a pergunta "Como ficou o tamanho?" entra no lugar |
| `comment` | opcional, até 500 caracteres (espaços nas pontas cortados) |
| `photos` | opcional, até 3 por item, jpeg/png/webp até 10 MB |

E, no pedido de retirada, a **retirada na arena** (`pickupRating` 1–5, opcional — não vai pra
página de produto nenhuma). "Publicar sem meu nome" vale para o pedido inteiro.

Publicar exige **pelo menos um produto com nota**. Item sem nota (pulado) não é avaliado.

## Prazo de edição

A primeira publicação abre **30 dias** de edição (`editableUntil`). Editar regrava o pedido
inteiro (o que vier na edição é o estado novo); depois do prazo, a callable recusa
(`failed-precondition`) e as telas mostram só leitura.

## Publicação

Publica **na hora**: não existe fila de moderação no backoffice. O desenho falava em "revisão
rápida em até 24 h"; sem ninguém revisando, a cópia virou "Ela já aparece na página do produto".
Esconder uma avaliação = gravar `items[].hiddenAt` no doc privado (console/admin) — o gatilho tira
do espelho e refaz a nota.

## Dados

```
storeOrderReviews/{orderId}          // privado: dono lê (get/list por uid), ninguém grava do cliente
  orderId, number, uid, anonymous, authorName, authorInitials
  items[{productId, skuId, name, variantLabel, imageUrl, sizeValueId|null,
         rating, tags[], fit|null, comment, photos[{path, publicPath, url}],
         publicId, hiddenAt|null, createdAt, updatedAt}]
  pickup: {placeName, rating} | null
  createdAt, updatedAt, editableUntil

storeShowcase/{productId}/reviews/{publicId}   // público, só o que a página mostra
  rating, tags[], fit|null, comment, photos[url], variantLabel, sizeValueId|null,
  authorName, authorInitials, createdAt, updatedAt

storeProductRatings/{productId}      // agregado (só servidor), copiado pro espelho do produto
  count, sum, dist[5] (índice 0 = 1 estrela), recommend (nota ≥ 4), withPhotos,
  fit{pequeno, certo, grande}, updatedAt
```

O espelho do produto (`storeShowcase/{id}`) leva `ratingAvg` (2 casas, `null` sem avaliação),
`ratingCount` e `reviewStats: {dist[5], recommend, withPhotos, fit{pequeno, certo, grande}}`. O
agregado mora fora de `storeProducts` porque o save do backoffice grava o produto com
`merge:false`.

- **Callable** `submitStoreOrderReview({orderId, anonymous, items[{productId, rating, tags, fit,
  comment, photos[path]}], pickupRating|null})` → `{ok, created, editableUntil}`.
- **Fotos**: o cliente sobe em `store/review-uploads/{uid}/{arquivo}` (só o dono); a callable
  confere dono, tipo e peso e copia para `store/reviews/{productId}/{arquivo}` (leitura pública,
  link com token). O caminho do upload é a identidade da foto na edição: foto que continua não é
  copiada de novo; foto que saiu tem a cópia pública apagada.
- **Gatilho** `onStoreOrderReviewWrittenSyncPublic`: relê o doc privado, regrava os espelhos dos
  itens visíveis, apaga os que saíram, refaz o agregado de cada produto tocado e ressincroniza o
  espelho do produto.

## Nome do autor

Do nome do comprador no pedido: primeiro nome + inicial do último sobrenome ("Rafaela M."),
iniciais do primeiro e do último ("RM"). Anônimo → "Atleta NexaGO" / "··". O caminho público da
foto não leva o uid (anônimo continua anônimo).

## Página do produto

- 0 avaliações → bloco curto "Ainda sem avaliações" + como avaliar.
- 1–2 → os comentários, sem nota média (a nota só aparece a partir de **3**, como o selo da
  vitrine: `showRating`).
- ≥ 3 → nota média ("4,8"), estrelas, "N avaliações · X% recomendam" (nota ≥ 4), distribuição
  em % por estrela.
- **Caimento**: só produto com eixo Tamanho e ≥ 3 respostas de `fit`. Posição =
  `50 + 50 × (grande − pequeno) / total` %; rótulo "Veste pequeno" (< 40%), "Veste grande"
  (> 60%), senão "Veste bem".
- Filtros: Todas · Com foto · 5 estrelas · "Tamanho M" (só com um tamanho escolhido na página e
  avaliação nesse tamanho). Ordem: Mais recentes (padrão), Melhor nota, Pior nota.
- Lista: as 100 mais recentes; mostra 3 e "Ver todas as N avaliações" abre o resto (web) / a
  tela de avaliações (app).
- Card: iniciais, nome, "Compra verificada", data ("12 out"), variação, estrelas, comentário,
  fotos, etiquetas (+ "Veste pequeno"/"Tamanho certo"/"Veste grande" pelo `fit`).
- **Fora de propósito**: "Útil (N)" e ordem "Mais úteis" (não há votos), resposta da loja.
