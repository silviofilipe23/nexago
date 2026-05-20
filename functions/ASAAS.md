# Integração Asaas (arenas)

## Secrets (Firebase Functions)

```bash
firebase functions:secrets:set ASAAS_API_KEY
firebase functions:secrets:set ASAAS_WEBHOOK_ACCESS_TOKEN
firebase functions:secrets:set ASAAS_ENV   # sandbox | production
```

`PLATFORM_FEE_FIXED_BRL` continua em uso para crédito na carteira interna.

## Webhook

URL: `https://us-central1-<PROJECT_ID>.cloudfunctions.net/asaasWebhook`

No painel Asaas, configure o mesmo token em **Integrações → Webhooks** (`asaas-access-token` header).

Eventos recomendados:

- Cobrança: `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_REFUNDED`
- Transferência (auditoria): `TRANSFER_DONE`, `TRANSFER_FAILED`

## Saques (repasse PIX)

- Gestor chama `requestArenaWithdrawal` — saldo validado no backend (`reserveWithdrawalAmount` + `assertWithdrawalReservationValid` antes do PIX).
- Até **R$ 500**: tentativa de `POST /v3/transfers` na hora (`pixAddressKey` + `pixAddressKeyType`, ex. CPF só dígitos).
- Acima de R$ 500 ou falha Asaas: `status: pending` na fila do backoffice (`reviewArenaWithdrawal`).
- Um saque `pending` por arena por vez.

## Deploy

```bash
firebase deploy --only functions:createArenaBookingPixPayment,functions:cancelPendingArenaBookingPayment,functions:requestArenaWithdrawal,functions:reviewArenaWithdrawal,functions:asaasWebhook,functions:expirePendingArenaBookingPayments,functions:listPendingArenaWithdrawals
```

Índice Firestore: `arenaWithdrawals` — `arenaId` + `status` (deploy `firestore:indexes` se necessário).

### Teste local (normalização PIX)

```bash
cd functions && npx ts-node --transpile-only src/asaas-payout.pix.test.ts
```

Reservas com `mercadopagoPaymentId` pendente seguem confirmando via `mercadopagoWebhook` até expirarem.

## PIX / QR Code

Após `POST /v3/payments` com `billingType: PIX`, o campo `pixTransaction` na resposta pode vir `null` — isso é normal. O QR é obtido em `GET /v3/payments/{id}/pixQrCode` (com retries no backend).

A conta Asaas precisa ter **chave PIX cadastrada** (painel Asaas → Pix). Sem chave, o QR pode não ser gerado no sandbox.
