# Loja · Checkout (web 03–06 · app 03–08)

Do carrinho ao pedido pago. O cliente nunca manda preço: manda **o que quer** (canal, entrega,
cupom) e o servidor relê carrinho, catálogo, personalização, ponto de retirada, frete, cupom e
desconto do Pix. O total que o cliente mostrou volta como `expectedTotalCents`, e se não bater
o pedido não nasce.

v1: **só Pix** (30 min). Cartão, saldo (cashback desligado) e "reembolso como saldo" ficam
para depois. Parcelamento do desenho não existe.

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
paymentMethods,
pix: { copyPaste, expiresAt } | null,            // só enquanto status == 'pag'
delivery: { type: 'arena', placeName, counter, address, pickupCode, pickupDeadline }
        | { type: 'casa', modeName, address, city, uf, zip, carrier, tracking, trackingUrl, eta },
createdAt, paidAt, separatedAt, arrivedAt, shippedAt, completedAt, canceledAt,   // ISO
cancelReason, refundedCents, updatedAt
```
- `pickupCode` só aparece com o pedido **na arena** (`ret`).
- Nunca vão para a visão: CPF, reserva de estoque, custo, nota interna.
- Lista: `where('uid','==',uid).orderBy('createdAt','desc')` (índice composto).
- O `storeOrders` de verdade continua só do servidor.

### Status
| status | atleta vê |
|---|---|
| `pag` | Aguardando pagamento (Pix com prazo) |
| `sep` / `sepd` | Em separação |
| `ret` | Pronto pra retirar (código + prazo) |
| `tra` | A caminho |
| `ent` | Entregue |
| `rtd` | Retirado |
| `can` | Cancelado (motivo) |

## Callables (região do cliente)

### `quoteStoreCheckout({channel, delivery, couponCode})` → `Quote`
Só leitura. `channel ∈ web|app_ios|app_android`. `delivery`:
`{type:'arena', arenaId}` · `{type:'casa', addressId, modeId}` · `null` (ainda não escolheu).
```
Quote = { lines: [{ key, productId, skuId, qty, name, variantLabel, imageUrl, category, collection,
                    baseCents, extraCents, unitCents, totalCents, personalized, customizationLabel,
                    problem }],
          units, subtotalCents,
          coupon: { id, code, discountCents, stacksWithPix, problem, message } | null,
          pixDiscountPct, pixDiscountCents, shippingCents, freeShipping, totalCents, problems }
```
- `line.problem ∈ indisponivel|esgotado|sem_retirada|sem_entrega|personalizacao_off|null`.
- `problems ∈ carrinho_vazio|entrega_faltando|arena_indisponivel|endereco_faltando|
  modalidade_indisponivel|linha_com_problema`. Com qualquer problema não se paga.
- `coupon.message` já vem pronta em português para mostrar sob o campo.

### `createStoreOrder({channel, delivery, couponCode, expectedTotalCents, cpf})`
→ `{orderId, number, totalCents, pix: {copyPaste, expiresAt}}`

Erros (`HttpsError`, mensagem pronta):
- `failed-precondition` com `details.problems` + `details.quote`: carrinho com problema.
- `failed-precondition` com `details.quote`: cupom recusado.
- `failed-precondition` com `details.reason == 'cpf_required'`: pedir o CPF e reenviar com `cpf`.
- `aborted` com `details.quote`: o total mudou; mostrar o novo e pedir confirmação.

Ao criar: cobra o Pix no Asaas, reserva o estoque e tira do carrinho **só as linhas compradas**.
Se a reserva falhar (estoque acabou no meio), a cobrança é cancelada.

## Regras de preço (`store-checkout-price.ts`)
1. **Linha:** produto ativo e à venda no canal (web ou app); retirada exige `fulfillment.pickup`,
   casa exige `delivery`; saldo = máximo entre CD e arena escolhida; personalizada soma o
   adicional da config **atual** (e some se a personalização foi desligada).
2. **Cupom** (na ordem): existe → encerrado/pausado/agendado → só no app → escopo (loja, categoria,
   coleção, produtos, arena) → pedido mínimo → esgotado → já usado por este atleta. Percentual
   arredonda e respeita o teto; fixo nunca passa do valor elegível. Escopo de torneio não é aceito.
3. **Pix:** `% de storeConfig/discounts` sobre (subtotal − cupom). Cupom com
   `stacksWithPix: false` cancela o desconto do Pix.
4. **Frete:** por último. Só modos de preço fixo ativos; grátis a partir de
   `freeShippingAboveCents` (sobre o subtotal). Retirada na arena é sempre grátis.

## Pagamento
- `externalReference = storeOrder:{orderId}`. O webhook do Asaas confirma: `pag → sep`, `paidAt`,
  Pix limpo, uso do cupom +1 e, para cada linha personalizada, um item na fila de arte
  (`storeCustomItems/{orderId}-{n}`, status `aprovar`, SLA 4h) com o link da arte.
- Notificação repetida é inofensiva (`asaas_processed_payments/{paymentId}`).
- **Pix vencido** (varredura a cada 5 min): se pagou sem webhook, confirma; senão apaga a cobrança e
  cancela o pedido ("Pix expirou sem pagamento"), liberando o estoque.
- Pix pago **depois** de cancelado: estorno automático.

## Telas
- **Carrinho + entrega** (web 03/04, app 03/04): linhas com problema aparecem marcadas e bloqueiam
  o "Pagar". A cotação roda de novo a cada mudança de entrega, endereço, modo ou cupom.
- **Novo endereço** (web 05, app 05): CEP → ViaCEP preenche rua, bairro, cidade e UF.
- **Pix** (app 06; web no fim do checkout): QR gerado no cliente a partir do copia-e-cola,
  contagem regressiva até `expiresAt`, e a tela acompanha a visão do pedido — virou `sep` → pago.
- **Pronto pra retirar** (app 07): código grande + arena + prazo, a partir da visão.
- **Meus pedidos** (web 06, app 08): lista da visão, mais recentes primeiro.
