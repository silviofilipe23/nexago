# Loja · Produto (tela 02 · portal do atleta + app)

Rotas: web `/loja/p/:slug` (e `/loja/produto/:id`, o link antigo da vitrine) · app `/loja/produto/:id`
(`nexago://loja/p/:id` e `nexago://loja/produto/:id`). O link compartilhado é o do portal
(`https://atleta.nexago.com.br/loja/p/:slug`).
Acesso: aberto no web; adicionar ao carrinho e favoritar pedem login (web volta pro produto e
conclui a adição).

## Dados

A página não abre consulta nova: lê o **mesmo catálogo do canal** que a vitrine já escuta
(`storeShowcase` com `channels.web`/`channels.app`) e acha o produto por `slug` ou `id`. Os
relacionados ("Combina com") e o mini-carrinho saem do mesmo catálogo. O espelho
(`functions/src/store-showcase.ts`) ganhou, além do que a tela 01 usa:

```
photos[{url, colorValueId|null}]   // ordem do backoffice, até 10; a 1ª é a capa
description                        // texto livre do backoffice
details[{label, value}]            // "Detalhes técnicos" do backoffice
variants[].maxQty                  // saldo livre até 10 (o teto da compra); 0 = esgotado
variants[].lowStock                // saldo livre ≤ alerta de estoque baixo do produto
customization: {fromCents, leadDays, defectOnlyReturns} | null   // só com personalização ativa
```

e `storePublic/showcase` ganhou `delivery: {freeAboveCents|null, modes[{id, name, description,
priceCents|null}]}` — só as modalidades que o checkout aceita hoje (ativas e com preço fixo; a
"calculada" só com a integração de frete ligada). O gatilho de config passou a ouvir também
`storeConfig/shipping`.

Doc antigo, gravado antes destes campos: `maxQty` ausente vale 10 com saldo e 0 sem; o resto
vem vazio (sem galeria extra, sem detalhes, sem personalização, sem entrega).

## Regras (iguais no web e no app)

### Eixos e seleção
- Eixo com algum valor com `hex` é **cor** (bolinhas); os outros são botões (tamanho, modelo…).
- **Disponibilidade em cascata**: um valor está disponível se existe SKU com saldo que tenha esse
  valor E bata com o que está escolhido nos eixos **anteriores**. A cor (1º eixo) só fica riscada
  sem saldo em nenhum tamanho; o tamanho depende da cor escolhida.
- Cor riscada continua clicável (para ver as fotos) e deixa todos os tamanhos indisponíveis.
- Pré-seleção: a primeira cor com saldo (ou a primeira cor, se tudo esgotou); eixo de um valor só
  já vem escolhido; **tamanho nunca vem escolhido**.
- Trocar um valor limpa as escolhas dos eixos seguintes que ficaram indisponíveis.
- "Adicionar" sem todos os eixos escolhidos: o eixo que falta treme e aparece "Escolha um
  tamanho" (`cor` → "Escolha uma cor"; outro → "Escolha {rótulo}").
- Tamanho indisponível: riscado e esmaecido; tocar avisa que o "Avise-me" chega em breve
  (lista de espera ainda não existe) e registra `loja_avise_me`.

### Preço
- SKU escolhido → preço dele. Senão, entre os SKUs com saldo que batem com o escolhido:
  menor = maior → o preço; diferentes → "a partir de" o menor.
- Preço "de" riscado: `compareAtPriceCents` quando maior que o preço mostrado e não é "a partir de".
- Pix: `round(preço × (100 − pct)/100)` (mesma conta da tela 01) — some sem desconto configurado.
- Parcelamento: **não aparece** — não existe "parcelamento máximo" configurado na Loja.
- Personalizável: "+ personalização a partir de R$ X" (`customization.fromCents`).

### Quantidade e carrinho
- 1 até `maxQty` do SKU (sem SKU escolhido: até 10). No máximo, "+" desabilitado.
- Mesmo SKU já no carrinho soma, sem passar de `maxQty`; no teto, avisa e não soma.
- Estoque baixo: "Só N no tamanho M" (N < 10) ou "Últimas unidades no tamanho M".
- Esgotado (todos os SKUs): o CTA vira "Avise-me quando chegar" (secundário, "em breve").
- O SKU acabou entre a escolha e o toque (o listener já atualizou): "Acabou o estoque do M ·
  escolha outro tamanho".
- Carrinho continua sendo só intenção (`storeCarts/{uid}`, ≤30 linhas): o checkout relê tudo.

### Galeria
- Fotos da cor escolhida (`colorValueId`) seguidas das fotos sem cor; se a cor não tem foto
  própria, as sem cor; se nenhuma, todas. Sem foto nenhuma: fundo listrado com o nome.
- Web: miniaturas à esquerda, zoom 2× no hover, clique abre tela cheia (setas, `Esc`).
- App: arrastar troca a foto (bolinhas), toque abre tela cheia com pinça, arrastar pra baixo fecha.

### Como receber
- **Retirada** (produto com `pickup` e arena de retirada ativa): "Retirar na {arena}" · "Pronto
  {hoje|amanhã|dia da semana|dd/mm} a partir das {H}h" · **Grátis**. Conta (horário de São
  Paulo, UTC−3 fixo): agora + `readyHours` do ponto, arredondado pra cima até a hora cheia; antes
  das 8h vira 8h do mesmo dia, depois das 20h vira 8h do dia seguinte. Dia: 0 → "hoje", 1 →
  "amanhã", 2–6 → "domingo|segunda|terça|quarta|quinta|sexta|sábado", 7+ → "dd/mm".
  (Peça personalizada soma a produção — entra com o fluxo de personalização, 02b/02c.)
- Arena: web = a escolhida (`storeShoppers.pickupArenaId`) → a única ativa → nenhuma ("Escolher
  arena"); app = a mesma resolução da vitrine (escolhida → frequente → próxima).
- **Entrega** (produto com `delivery`): uma linha por modalidade de `delivery.modes` com a
  descrição dela e o preço; "Grátis" quando preço × quantidade alcança `freeAboveCents`. Sem CEP
  no cadastro e sem cálculo de frete: o CEP fica pro checkout.
- A escolha aqui é só da página (o checkout ainda não existe para herdá-la).
- Sem nenhuma opção, o bloco some.

### Detalhes e relacionados
- Detalhes: `details` em grade de 2 colunas (web) / lista com divisores (app); descrição abaixo
  (app: 4 linhas + "Ler mais").
- Combina com: 3 (web) / até 8 (app) — mais vendidos da mesma categoria, completados pelos mais
  vendidos das outras; esgotados ficam de fora. (Escolha manual no backoffice ainda não existe.)
- Avaliações: some sempre enquanto `ratingCount < 3` (não há avaliações ainda).
- Tabela de medidas: **não aparece** — não há tabela cadastrada no backoffice.

### Estados
- Carregando: skeleton da galeria e da coluna/painel.
- Produto fora do catálogo do canal (inativo, arquivado, sem canal): "Esse produto não está mais
  disponível" + 4 mais vendidos.
- App offline (catálogo do cache): página do cache, CTA desabilitado "Sem conexão".

## Analytics

`loja_produto_view {produto_id, origem}` · `loja_foto_swipe` · `loja_variacao_select {cor, tamanho}`
· `loja_avise_me {sku}` · `loja_add_carrinho {sku, qtd, preco}` · `loja_entrega_select {tipo}` ·
`loja_personalizar_open` · `loja_relacionado_click {produto_id}`
(`loja_tabela_medidas_open` entra junto com a tabela de medidas).
