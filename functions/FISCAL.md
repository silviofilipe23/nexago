# NFS-e da arena (Fatia A)

Emissão de nota fiscal de serviço eletrônica (NFS-e) em nome da arena, via
Focus NFe, para reservas de quadra e sessões do clubinho.

## Secrets (Firebase Functions)

```bash
firebase functions:secrets:set FOCUS_ACCOUNT_TOKEN
firebase functions:secrets:set FISCAL_WEBHOOK_TOKEN
```

`FOCUS_ENV` (`sandbox` | `production`) **não** é secret — é um `defineString`,
porque só escolhe a URL da Focus. Defina como parâmetro de ambiente
(`.env`/`firebase functions:config`), não com `functions:secrets:set`.

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
   (reserva paga ou sessão do clubinho paga — são as duas únicas origens
   implementadas; lançamento manual/nota avulsa é Fatia B, não existe aqui).
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
cd functions && npm test
```

Roda a suíte inteira (build + todos os `lib/**/*.test.js` + os testes `.mjs`).
O padrão do `node --test` vai entre aspas simples no script: sob `/bin/sh`, que
é o shell do `npm run`, `**` não expande recursivamente e o glob desabaria em
`lib/*.test.js` — quem expande é o próprio Node.

## Ativação (testing → active)

A arena emite uma nota real em homologação pelo passo 5 do wizard (botão
"Emitir nota de teste"). Autorizada, `status` vira `active` sozinho — quem
faz isso é o trigger `onActivationTestInvoiceResolved`, não o wizard. Rejeitada,
`status` vira `error` com o motivo real do emissor, e o mesmo botão (agora
"Tentar novamente") reemite a mesma nota.

A nota de teste usa um tomador sintético fixo (CPF formato-válido, não real,
"Cliente de Teste NexaGO") e o serviço padrão de reserva real da arena, valor
R$1,00. Aparece na lista de notas fiscais com a etiqueta "Teste" — nunca some,
nunca é confundida com venda real.

Reemitir uma nota real rejeitada (`retryFiscalInvoice`) usa o mesmo mecanismo.

## IAM da service account das Functions

Os papéis abaixo precisam estar concedidos à service account de runtime das
Cloud Functions **antes da primeira chamada real de `saveArenaFiscalConfig`**:

| Papel | Para quê |
| --- | --- |
| `roles/secretmanager.admin` | `saveArenaFiscalConfig` cria a secret `fiscal-issuer-token-{arenaId}` e adiciona versões. Least-privilege equivalente: `secretmanager.secretCreator` + `secretmanager.secretVersionAdder`. |
| `roles/secretmanager.secretAccessor` | `onFiscalInvoiceRequested` lê a versão mais recente do token da arena na hora de emitir. |

```bash
PROJECT_ID=<seu-projeto>
SA="$(gcloud iam service-accounts list --project "$PROJECT_ID" \
  --filter='email~compute@' --format='value(email)')"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/secretmanager.admin"
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:$SA" --role="roles/secretmanager.secretAccessor"
```

Sem esses papéis, `saveArenaFiscalConfig` falha **depois** de já ter registrado
o CNPJ da arena na Focus — o cadastro fica órfão, ocupando uma vaga do plano
pago. Desde a correção em `saveSecretToSecretManager` (que só engole
`ALREADY_EXISTS`), a falha é barulhenta em vez de silenciosa, mas o registro no
emissor já terá acontecido: ao ver esse erro, cheque também se há empresa
duplicada/órfã no painel da Focus.

## Não verificado contra a API real

O contrato com a Focus NFe (nomes de campos em `registerIssuer`/
`issueServiceInvoice`, formato do payload do webhook, unidade de `aliquota`)
foi escrito a partir da documentação e **nunca foi validado com uma conta
real**. Confirme cada um em homologação antes de emitir de verdade.
