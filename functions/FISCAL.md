# NFS-e da arena (Fatia A)

Emissão de nota fiscal de serviço eletrônica (NFS-e) em nome da arena, via
Focus NFe, para reservas de quadra e sessões do clubinho.

## Secrets (Firebase Functions)

```bash
firebase functions:secrets:set FOCUS_ACCOUNT_TOKEN
firebase functions:secrets:set FOCUS_ENV   # sandbox | production
firebase functions:secrets:set FISCAL_WEBHOOK_TOKEN
```

`FOCUS_ACCOUNT_TOKEN` é o token da conta nexaGO na Focus, usado só para
cadastrar empresas (`registerIssuer`). A emissão em si usa o token de cada
arena, que fica no Secret Manager (`fiscal-issuer-token-{arenaId}`, gravado
por `saveSecretToSecretManager` e lido por `readIssuerTokenFromSecretManager`)
— nunca em Firestore.

## Webhook

URL: `https://us-central1-<PROJECT_ID>.cloudfunctions.net/fiscalIssuerWebhook`

No painel da Focus, cadastre essa URL para o callback assíncrono de NFS-e e
configure o mesmo valor de `FISCAL_WEBHOOK_TOKEN` no header `x-fiscal-token`.

Eventos tratados: `autorizado`, `erro_autorizacao`, `cancelado`. Uma vez que a
nota chega a `authorized` ou `cancelled`, o webhook ignora notificações
subsequentes para a mesma nota (`FINAL_STATUSES`).

## Fluxo

1. Um documento nasce em `fiscalInvoices/{invoiceId}` com `status: "requested"`
   (reserva paga, sessão do clubinho ou lançamento manual).
2. O trigger `onFiscalInvoiceRequested` dispara, revalida a origem e a
   configuração da arena (`shouldProcess`) e chama a Focus NFe.
3. Se a Focus responde na hora, o resultado já vai para o documento
   (`authorized`/`rejected`/`processing`). Se fica `processing`, a confirmação
   final chega depois pelo `fiscalIssuerWebhook`.
4. Erro de rede/5xx na chamada à Focus propaga a exceção — o trigger tem
   `retry: true`, então o Cloud Functions tenta de novo automaticamente
   (o documento fica em `requested` até então).

## Functions do módulo

- `saveArenaFiscalConfig` — gestor cadastra CNPJ, endereço fiscal, serviços e
  certificado; registra a empresa na Focus e grava o token no Secret Manager.
- `setArenaFiscalMode` — liga/desliga a emissão (`always`/`on_demand`/`off`);
  exige `status: "active"` antes de ligar.
- `getArenaFiscalRequirements` — devolve os campos exigidos pelo município
  (wizard de cadastro).
- `onFiscalInvoiceRequested` — trigger `onDocumentCreated` em
  `fiscalInvoices/{invoiceId}` que efetivamente emite a nota.
- `fiscalIssuerWebhook` — recebe a confirmação assíncrona da Focus.

## Deploy

```bash
firebase deploy --only functions:saveArenaFiscalConfig,functions:setArenaFiscalMode,functions:getArenaFiscalRequirements,functions:onFiscalInvoiceRequested,functions:fiscalIssuerWebhook
```

Publicar também `firestore:rules` (leitura de `arenas/{arenaId}/fiscal` e
`fiscalInvoices`) e `firestore:indexes` (listagem de `fiscalInvoices` por
`arenaId` + `createdAt`).

### Teste local

```bash
cd functions && npm run build && node --test lib/fiscal/*.test.js
```
