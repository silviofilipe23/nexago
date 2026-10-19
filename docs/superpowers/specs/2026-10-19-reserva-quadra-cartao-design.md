# Cartão de crédito no aluguel de quadra — Design

Data: 2026-10-19
Status: decidido pelo padrão da inscrição (cartão em 02/09, PR #384; app #759; "a liberar" #762)

## Objetivo

O atleta paga a reserva de quadra com cartão de crédito à vista, pelo **checkout hospedado do
Asaas** (`invoiceUrl`), no app e no portal do atleta. Nenhum dado de cartão passa pelo nexaGO.

## Decisões (iguais às da inscrição, 02/09)

1. **Horário garantido na autorização** (`CONFIRMED`): a reserva vira `confirmed` e os slots
   `booked`. Esperar a liquidação (~D+32) deixaria a quadra solta por um mês.
2. **Carteira da arena só na liquidação** (`RECEIVED`): a plataforma não financia repasse.
   Até lá o líquido previsto fica em `arenaWallets.awaitingSettlementReais` ("a liberar"),
   abatido no mesmo lançamento do crédito.
3. **Taxa do cartão sai do líquido da arena**: `bruto − taxa da plataforma − taxa do cartão`
   (`value − netValue` do próprio pagamento). PIX não muda.
4. **Só à vista.** Sinal de 50% (`paymentFraction`) vale para cartão como vale para PIX.
5. **Reserva dividida segue só PIX** (as fatias são cobranças PIX próprias).

## Prazo

O PIX segura o horário 5 min. O cartão precisa digitar dados e passar por 3DS: o prazo vira
`max(paymentExpiresAt, criação + 15 min)`. Ancorado na criação — gerar de novo não estica.

## Peças

- `createArenaBookingCardPayment` (mesma preparação do PIX: titular, `pending_payment`, valor
  de `arenaBookingPricing`, squad, cashback, cliente Asaas). Grava `billingType: CREDIT_CARD`.
  O PIX passa a gravar `billingType: PIX` (ausente = PIX).
- **Cobrança anterior de cartão**: antes de gerar outra (PIX ou cartão), consulta o Asaas. Se
  está aprovada/em análise, reconcilia pelo webhook e recusa a nova cobrança; se não foi
  possível apagá-la, recusa também — senão o atleta poderia pagar duas vezes.
- **Webhook em duas fases** (`resolvePaymentPhases`): o doc de `asaas_processed_payments`
  ganha `confirmedAt` / `walletCreditedAt` / `awaitingSettlement`. Doc aprovado sem marcador
  = acervo PIX (as duas fases já rodaram). Estorno/chargeback DEPOIS de confirmar não cancela a
  reserva (só tira do "a liberar" e grita no log), como na inscrição.
- **Crédito idempotente** na carteira da arena pelo doc processado (hoje não tem marcador).
- **Varredura e "voltar sem pagar"** em reserva de cartão consultam o Asaas antes: aprovada →
  reconcilia (confirma); em análise → espera; pendente → apaga (tem de dar certo) e libera.
  O caminho do PIX não muda.
- Rótulo "Cartão" onde a reserva mostra o meio de pagamento (`paymentChannel: card`).

## Fora desta entrega

- Estorno automático ao cancelar reserva paga (não existe nem no PIX).
- Exibir o "a liberar" da arena no portal/app da arena (o dado já nasce gravado).
