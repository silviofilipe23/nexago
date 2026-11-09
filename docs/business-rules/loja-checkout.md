# Loja · Checkout (web 03–06 · app 03–08)

Do carrinho ao pedido pago. O cliente nunca manda preço: manda **o que quer** (canal, entrega,
cupom, forma de pagamento) e o servidor relê carrinho, catálogo, personalização, ponto de retirada,
frete, cupom e desconto do Pix. O total que o cliente mostrou volta como `expectedTotalCents`, e se
não bater o pedido não nasce.

Formas: **Pix** (30 min) ou **cartão de crédito** (15 min, à vista, checkout hospedado do Asaas —
nenhum dado de cartão passa por nós). Saldo (cashback desligado) e "reembolso como saldo" ficam para
depois. Parcelamento não existe.

Decisões do cartão (09/11/2026):
- **Só à vista; a Loja absorve a taxa do cartão** (o atleta paga o mesmo que sem desconto). O
  acréscimo existe no código desligado: `STORE_CARD_FEE_TERMS = NO_CARD_FEE` em
  `functions/src/store-checkout.ts`; trocar por `await loadCardFeeTerms()` repassa processamento +
  antecipação como na inscrição, e a cotação/o pedido já somam `cardFeeCents` no total do cartão.
- **Desconto Pix só no Pix.** No cartão: subtotal − cupom + frete (+ acréscimo, hoje 0).
- **Estoque e cupom ficam reservados desde a criação**, como no Pix, pelos 15 min do cartão.

## Dados

### Endereços — `storeAddresses/{uid}`
```
{ items: [{ id, label, recipient, phone, zip, street, number, complement, district, city, uf,
            main? }],      // até 10
  updatedAt }
```
Só o dono lê e grava. Não vai em `users/{uid}` porque esse doc é legível por outros atletas. A rule
confere só forma e tamanho; o servidor saneia cada campo e descarta endereço sem rua, cidade ou UF.
O CEP é preenchido no cliente pelo ViaCEP.

### Pedido do atleta — `storeOrderViews/{orderId}` (espelho por gatilho; só o dono lê)
```
uid, orderId, number ('NX-0001'), status, channel,
items: [{ productId, skuId, name, variantLabel, imageUrl, qty, unitCents, totalCents,
          personalized, customizationLabel }],
units, subtotalCents, couponCode, couponDiscountCents, pixDiscountCents, shippingCents, totalCents,
paymentMethods, paymentMethod ('pix' | 'cartao'; acervo sem = 'pix'), cardFeeCents,
pix: { copyPaste, expiresAt } | null,            // só enquanto status == 'pag'
card: { invoiceUrl, expiresAt } | null,          // só enquanto status == 'pag'
delivery: { type: 'arena', placeName, counter, address, pickupCode, pickupDeadline }
        | { type: 'casa', modeName, address, city, uf, zip, carrier, tracking, trackingUrl, eta },
createdAt, paidAt, separatedAt, arrivedAt, shippedAt, completedAt, canceledAt,   // ISO
cancelReason, refundedCents, updatedAt
```
- `pickupCode` só aparece com o pedido **na arena** (`ret`).
- Nunca vão para a visão: CPF, reserva de estoque, custo, nota interna.
- Lista: `where('uid','==',uid).orderBy('createdAt','desc')` (índice composto).
- `get` de um id que ainda não existe é permitido (a rule aceita `resource == null`): a tela do Pix
  escuta o pedido antes do gatilho criar o espelho. Negar mataria o listener e o "pago" não chegaria.
- O `storeOrders` de verdade continua só do servidor.

### Status
| status | atleta vê |
|---|---|
| `pag` | Aguardando pagamento (Pix ou cartão, com prazo) |
| `sep` / `sepd` | Em separação |
| `ret` | Pronto pra retirar (código + prazo) |
| `tra` | A caminho |
| `ent` | Entregue |
| `rtd` | Retirado |
| `can` | Cancelado (motivo) |

## Callables (região do cliente)

### `quoteStoreCheckout({channel, delivery, couponCode, paymentMethod})` → `Quote`
Só leitura. `channel ∈ web|app_ios|app_android`. `delivery`:
`{type:'arena', arenaId}` · `{type:'casa', addressId, modeId}` · `null` (ainda não escolheu).
`paymentMethod ∈ pix|cartao`; ausente = `pix` (app/portal anteriores ao cartão).
```
Quote = { paymentMethod,
          lines: [{ key, productId, skuId, qty, name, variantLabel, imageUrl, category, collection,
                    baseCents, extraCents, unitCents, totalCents, personalized, customizationLabel,
                    problem }],
          units, subtotalCents,
          coupon: { id, code, discountCents, stacksWithPix, problem, message } | null,
          pixDiscountPct, pixDiscountCents, cardFeeCents, shippingCents, freeShipping, totalCents,
          pixTotalCents, cardTotalCents, problems }
```
- `totalCents` é o da forma pedida; `pixDiscountCents` é 0 no cartão e `cardFeeCents` é 0 no Pix.
- `pixTotalCents`/`cardTotalCents` vêm sempre: a tela mostra os dois e "R$ X a menos que no
  cartão" no Pix. Cotação sem eles (servidor antigo) = a tela não oferece cartão.
- `line.problem ∈ indisponivel|esgotado|sem_retirada|sem_entrega|personalizacao_off|null`.
- Código de cupom fora do formato (traço, espaço, longo) não derruba a cotação: volta `nao_existe`.
- `problems ∈ carrinho_vazio|entrega_faltando|arena_indisponivel|endereco_faltando|
  modalidade_indisponivel|linha_com_problema`. Com qualquer problema não se paga.
- `coupon.message` já vem pronta em português para mostrar sob o campo.

### `createStoreOrder({channel, delivery, couponCode, paymentMethod, expectedTotalCents, cpf})`
→ `{orderId, number, totalCents, paymentMethod, pix: {copyPaste, expiresAt} | null,
   card: {invoiceUrl, expiresAt} | null}`

`expectedTotalCents` é o total **da forma escolhida** (mandar o do Pix pedindo cartão = `aborted`).

Erros (`HttpsError`, mensagem pronta):
- `failed-precondition` com `details.problems` + `details.quote`: carrinho com problema.
- `failed-precondition` com `details.quote`: cupom recusado, ou o estoque/cupom acabou entre a
  cotação e a reserva (a cotação nova já vem com a linha ou o cupom marcado).
- `failed-precondition` com `details.reason == 'cpf_required'`: pedir o CPF e reenviar com `cpf`.
- `aborted` com `details.quote`: o total mudou; mostrar o novo e pedir confirmação.

Ao criar: segura o cupom, cobra no Asaas (Pix, ou cartão com `billingType: CREDIT_CARD` e o
`invoiceUrl` do checkout hospedado), reserva o estoque e tira do carrinho **só as linhas
compradas**. Se a reserva falhar (estoque acabou no meio), a cobrança é cancelada e o cupom volta.
Falhar só na limpeza do carrinho não é erro (o pedido já existe; repetir duplicaria).

## Regras de preço (`store-checkout-price.ts`)
1. **Linha:** produto ativo e à venda no canal (web ou app); retirada exige `fulfillment.pickup`,
   casa exige `delivery`; personalizada soma o adicional da config **atual** e é conferida de novo
   (nome na lista de bloqueio, fonte e cor da config, arte na pasta do próprio atleta, área ligada):
   o carrinho é gravável pelo dono, então nada dele é confiável.
   **Estoque** com a conta da reserva: tudo na arena da retirada se ela cobre o pedido inteiro
   (o mesmo SKU de linhas diferentes soma), senão tudo no CD; o que não cabe sai `esgotado`.
2. **Cupom** (na ordem): existe → encerrado/pausado/agendado → só no app → escopo (loja, categoria,
   coleção, produtos, arena) → pedido mínimo → esgotado (`uses` + reservados) → já usado por este
   atleta → `reservado` (está num pedido dele esperando o Pix). Percentual arredonda e respeita o
   teto; fixo nunca passa do valor elegível. Escopo de torneio não é aceito.
   **Reserva:** criar o pedido soma em `storeCouponUses/{couponId}.reserved` e, no "uma vez por
   atleta", grava o marcador `{couponId}_{uid}` como `reservado` (em transação). Pago → marcador
   `usado`, `uses + 1`, reserva sai. Cancelado sem pagar (Pix vencido, backoffice) → o gatilho do
   pedido devolve a reserva e apaga o marcador. O doc do cupom não guarda a reserva porque a edição
   do backoffice regrava o doc inteiro.
3. **Pix:** `% de storeConfig/discounts` sobre (subtotal − cupom). Cupom com
   `stacksWithPix: false` cancela o desconto do Pix.
4. **Frete:** por último. Só modos de preço fixo ativos; grátis a partir de
   `freeShippingAboveCents` (sobre o subtotal). Retirada na arena é sempre grátis.

## Pagamento
- `externalReference = storeOrder:{orderId}`. O webhook do Asaas confirma: `pag → sep`, `paidAt`,
  Pix limpo, uso do cupom +1 e, para cada linha personalizada, um item na fila de arte
  (`storeCustomItems/{orderId}-{n}`, status `aprovar`, SLA 4h) com o link da arte.
- **Cartão:** confirma no `PAYMENT_CONFIRMED` (ou no `RECEIVED`, se o CONFIRMED se perder); o
  `RECEIVED` de ~30 dias depois cai como já processado. Mesmo ciclo do Pix a partir daí (`sep`…).
  A Loja não tem carteira, então não há a "fase de crédito" da inscrição.
- Notificação repetida é inofensiva (`asaas_processed_payments/{paymentId}`).
- **Pix vencido** (varredura a cada 5 min): se pagou sem webhook, confirma; senão apaga a cobrança e
  cancela o pedido ("Pix expirou sem pagamento"), liberando o estoque.
- **Cartão vencido** (mesma varredura, `card.expiresAt`, índice `status + card.expiresAt`): pergunta
  ao Asaas antes de soltar o estoque. Pago → confirma; `AWAITING_RISK_ANALYSIS` → adia 10 min;
  senão apaga a cobrança (`deleteAsaasPaymentOrThrow`: falhou = o pedido fica e a próxima rodada tenta)
  e cancela ("Pagamento com cartão não concluído no prazo"), devolvendo estoque e cupom.
- Pix/cartão pago **depois** de cancelado: estorno automático, registrado no pedido (`refunds`,
  `refundedCents`, histórico). Estorno que falha fica `refund_failed` e a varredura tenta de novo.
- A varredura nunca cancela pedido que o Asaas diz que foi pago (valor que não fecha vai pra
  conferência manual). Confirmado pela varredura também gera o link da arte.
- O gatilho do espelho relê o pedido (evento fora de ordem não volta o espelho no tempo).

## Telas
- **Carrinho + entrega** (web 03/04, app 03/04): linhas com problema aparecem marcadas e bloqueiam
  o "Pagar". A cotação roda de novo a cada mudança de entrega, endereço, modo ou cupom.
- **Novo endereço** (web 05, app 05): CEP → ViaCEP preenche rua, bairro, cidade e UF.
- **Pix** (app 06; web no fim do checkout): QR gerado no cliente a partir do copia-e-cola,
  contagem regressiva até `expiresAt`, e a tela acompanha a visão do pedido — virou `sep` → pago.
- **Cartão** (mesma tela): valor, contagem e o botão que abre o `invoiceUrl` (app: navegador do app,
  aberto sozinho ao sair do checkout e fechado quando aprova; web: nova aba). Só abre link `https`.
- **Pronto pra retirar** (app 07): código grande + arena + prazo, a partir da visão.
- **Meus pedidos** (web 06, app 08): lista da visão, mais recentes primeiro.
