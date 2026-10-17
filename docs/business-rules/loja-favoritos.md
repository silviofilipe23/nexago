# Loja · Favoritos (web 07 · app 09/09b)

Entrada. **Web:** o coração do cabeçalho da Loja abre `/loja/favoritos`, que pede login. **App:**
coração no cabeçalho da vitrine, entre a busca e a sacola, abre `/loja/favoritos`. A tela é interna,
sem tab bar, igual à busca e ao produto.

## Dados
- `storeShoppers/{uid}.favoriteIds` já existe, gravado com `arrayUnion`/`arrayRemove` pelo coração
  da vitrine e do produto. **Ordem:** o último favoritado aparece primeiro (inverso do array).
- O produto vem do espelho `storeShowcase`, o mesmo catálogo da vitrine do canal. Favorito que saiu
  do catálogo do canal não aparece, mas o id fica no doc e o card volta se o produto voltar.
- Nada novo no Firestore nem nas rules.

## Regras (iguais no web e no app)

### Selo do card (um só, nesta ordem)
1. **Esgotado** (`soldOut`): selo "Esgotado" e foto apagada (opacidade 0,55).
2. **Desconto** (preço "de" riscado da vitrine, `strikePriceCents`): web "Baixou R$ X", app "−R$ X",
   com X = de − por. Valor redondo vai sem centavos ("R$ 20"); com centavos, completo ("R$ 20,50").
   O "de" aparece riscado ao lado do preço.
3. **Fim de estoque:** todos os SKUs com saldo estão em `lowStock`. Selo "Últimas N unidades"
   (app "Últimas N"), com N = soma do `maxQty` desses SKUs. Com N ≥ 10, só "Últimas unidades".

Produto personalizável (`customization` com nome ou imagem ligados) ganha também a tag
"Personalizável".

### Ação do card
- **Esgotado:** "Avise-me quando chegar". Mostra o mesmo aviso da página do produto (a lista de
  espera ainda não existe) e registra `loja_avise_me`.
- **Personalizável:** "Personalizar" abre a tela de personalizar. Web:
  `/loja/p/:slug/personalizar`. App: `/loja/produto/:id/personalizar` sem `sku`, que usa a
  pré-seleção do produto.
- **SKU único com saldo** (produto sem escolha a fazer): "Adicionar" põe 1 no carrinho com a mesma
  soma e o mesmo teto da página do produto. Web abre o mini-carrinho; app mostra
  "Adicionado ao carrinho · Ver".
- **Com escolha a fazer** (cor/tamanho): "Ver opções" abre a página do produto.
- **Coração:** tira dos favoritos na hora (otimista, como na vitrine) e o card some. Se o servidor
  recusar, o card volta e aparece aviso de erro.

### Filtros (web)
Chips com contagem: **Todos** · **Com desconto** (selo 2) · **Disponíveis** (não esgotado). Chip
sem itens fica desabilitado. O app não tem filtro e mostra tudo.

### "Adicionar disponíveis ao carrinho" (web)
- Adiciona 1 de cada favorito que dá para adicionar direto (SKU único com saldo). Os que pedem
  escolha ficam de fora.
- Aviso de resultado: "{n} itens no carrinho". Se alguns ficaram de fora, acrescenta
  "{m} pedem cor ou tamanho na página do produto". A sacola pulsa e o mini-carrinho não abre
  (abriria no mesmo canto do aviso).
- Sem nenhum favorito adicionável, o botão não aparece.

### Destaque (app)
Faixa verde no topo com o favorito de **maior** desconto: "**{nome}** está R$ X mais barato".
Tocar abre o produto. Sem desconto entre os favoritos, a faixa não aparece.

### "Combina com seus favoritos" (web)
- Até 6 produtos à venda que não estão nos favoritos.
- Ordem: primeiro os das categorias dos favoritos, depois os outros, sempre do mais vendido para o
  menos vendido.
- "Ver loja" volta à vitrine.

### Vazio
Coração no círculo laranja e o título "Nada salvo ainda". Texto: "Toque no coração de um produto
pra guardar aqui." Botão **Explorar a loja**, que volta à vitrine.

### Linha de preço
Igual ao card da vitrine: preço (o mínimo, com "a partir de" quando varia) e, quando há "de", o "de"
riscado. App: "R$ X no Pix" quando há desconto Pix; esgotado mostra "Avisaremos quando voltar";
personalizável mostra "Personalize com seu nome" (só imagem ligada: "Personalize com sua imagem").

## Fora (por enquanto)
- "Avisar quando baixar de preço" (o toggle do desenho) e o "Avise-me" de verdade: ainda não há
  disparo de notificação.
- "Baixou desde que você favoritou": precisaria guardar o preço no dia do favorito. Por enquanto
  usamos o "de/por" da vitrine.

## Analytics
- `loja_favoritos_view {canal, total}` (novo).
- `loja_add_carrinho {sku, qtd, preco, origem: 'favoritos'}`.
- `loja_favoritar {produto_id, on: false}` e `loja_avise_me {produto_id}`, que já existem.
