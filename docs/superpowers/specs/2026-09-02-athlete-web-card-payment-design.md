# Cartão de crédito na inscrição — portal web do atleta — Design

Data: 2026-09-02
Status: aprovado em brainstorming (portal web do atleta + Cloud Functions)

## Objetivo

Permitir que o atleta pague a inscrição de torneio com cartão de crédito no
portal web, via **checkout hospedado do Asaas** (`invoiceUrl`) — nenhum dado de
cartão passa pelo nosso código, nem pelo navegador do atleta dentro do nosso
domínio. Vale para torneios com `paymentMode: 'appPixCard'`, que hoje só
oferecem PIX apesar do nome.

Fora de escopo: app Flutter (segue só PIX), parcelamento, estorno/chargeback
automático, e a tela do organizador que mostraria o saldo "a liberar".

## Contexto

O caminho de PIX já existe inteiro e funciona:
`createTournamentRegistrationPixPayment` → cobrança Asaas → webhook
`asaas-tournament-registration-webhook` → inscrição paga + carteira do
organizador creditada. Toda a trilha de guardas (elegibilidade de nível/idade,
prazo da vaga, rateio share/full, cliente Asaas, `externalReference`) é
agnóstica ao meio de pagamento.

Existe precedente de cartão no repo: `arena-subscription.ts` cria cobrança
`CREDIT_CARD` e devolve `invoiceUrl`; o portal da arena o abre com um
`<a target="_blank">` simples.

## Decisões de negócio (do dono, 02/09)

1. **Vaga garantida na aprovação.** No cartão, `CONFIRMED` (autorização) já
   confirma a inscrição. Esperar a liquidação (`RECEIVED`, ~D+30) deixaria o
   atleta sem vaga por um mês — inviável.
2. **Carteira do organizador só credita na liquidação (`RECEIVED`).** A
   plataforma não financia repasse. Consequência aceita: por ~30 dias o
   organizador vê a inscrição paga e a carteira parada.
3. **A taxa do gateway no cartão é repassada ao organizador.** Ele recebe
   `bruto − taxa da plataforma − taxa do cartão`. No PIX nada muda: a
   plataforma continua absorvendo o custo do PIX.
4. **Só à vista.** Parcelamento multiplicaria o descasamento de caixa.

## Modelo de dados

### `pixPending/{payerUid}` (subcoleção da inscrição)

O nome fica. Renomear para `paymentsPending` seria migração de coleção com
`collectionGroup` em produção, e o ganho é cosmético. Campo novo:

- `billingType: 'PIX' | 'CREDIT_CARD'` — ausente lê-se `'PIX'`
  (retrocompatibilidade com todo o acervo).

### `artifacts/{pid}/public/data/asaas_processed_payments/{paymentId}`

Marcador de idempotência do webhook, compartilhado com os handlers de reserva,
clubinho e assinatura — só o handler de inscrição muda de leitura.

Hoje o documento é um sinal binário: existe = já processei, saia. Vira marcador
por fase, porque no cartão as fases acontecem em eventos diferentes:

- `confirmedAt: Timestamp` — inscrição confirmada e notificada
- `walletCreditedAt: Timestamp` — carteira do organizador creditada
- `outcome` continua como está (`approved` | `orphan` | `duplicate_payer` |
  `rejected`); os três últimos seguem terminais e curto-circuitam tudo.

Documento legado (sem os campos novos) com `outcome: 'approved'` é lido como
"as duas fases já rodaram" — é a verdade para todo pagamento PIX do acervo.

### `organizerWallets/{organizerId}/ledger/{id}`

Campo novo no lançamento de crédito:

- `gatewayFeeReais: number` — taxa do gateway repassada (0 no PIX).

`netReais` passa a ser `bruto − taxaPlataforma − gatewayFeeReais`.

## Arquitetura

### 1. Cobrança — `tournament-registration-pix.ts`

A callable de PIX é um bloco de ~300 linhas dentro do `onCall`, e quase tudo
nela é preâmbulo comum a qualquer meio de pagamento. Extrair
`prepareRegistrationCharge()` — que devolve `{chargeAmount, amountType,
customerId, description, externalReference, pixWindow, registrationRef}` — e
deixar duas callables finas sobre ela:

- `createTournamentRegistrationPixPayment` — comportamento idêntico ao de hoje.
- `createTournamentRegistrationCardPayment` — nova. Cria a cobrança com
  `billingType: 'CREDIT_CARD'` e devolve
  `{paymentId, invoiceUrl, expiresAt, amountReais}`.

A extração é a melhoria pontual que o arquivo pede: sem ela a segunda callable
seria cópia carbono da primeira, e as duas divergiriam na primeira regra nova
de elegibilidade.

Em `asaas-booking-payment.ts`, `createAsaasCardCharge()` espelha
`createAsaasPixCharge()`: mesmo POST `/v3/payments`, `billingType` diferente,
e devolve o `invoiceUrl` (que o tipo `AsaasPaymentResponse` já declara e hoje
ninguém lê) em vez de buscar o QR.

**Janela de expiração:** reusa `computePixWindow` sem alteração. O checkout tem
o mesmo prazo que a vaga (`hold − 2 min`), e o piso de 3 min vale igual — não
adianta abrir um checkout que a varredura mata antes do atleta digitar.

### 2. Webhook em duas fases — `asaas-tournament-registration-webhook.ts`

Hoje um único evento (`RECEIVED`) confirma a inscrição, credita a carteira e
notifica. No cartão isso se separa no tempo:

| Meio | confirma inscrição + notifica | credita carteira |
|---|---|---|
| PIX | `RECEIVED` | `RECEIVED` |
| Cartão | `CONFIRMED` (ou `RECEIVED`) | só `RECEIVED` |

Regra pura extraída para `registration-payment-phases.ts`:

```
resolvePaymentPhases({billingType, status, alreadyConfirmed, alreadyCredited})
  → {confirm: boolean, credit: boolean}
```

- `CREDIT_CARD` + `CONFIRMED` → `{confirm: true, credit: false}`
- `CREDIT_CARD` + `RECEIVED` → `{confirm: !alreadyConfirmed, credit: true}`
  (o `RECEIVED` sozinho confirma, caso o evento `CONFIRMED` se perca)
- `PIX` + `RECEIVED` → `{confirm: true, credit: true}` — inalterado
- `PIX` + `CONFIRMED` → `{confirm: false, credit: false}` — inalterado,
  o PIX segue esperando a liquidação como sempre

O `billingType` não vem do corpo da notificação: o roteador `asaas-webhook.ts`
já faz um `GET /v3/payments/{id}` antes de despachar, então basta declarar os
campos `billingType` e `netValue` em `AsaasPaymentDetails` — são dados frescos
do gateway, não do payload que chegou pela rede. Ausente lê-se `PIX`, que
preserva o comportamento atual para qualquer evento antigo reprocessado.

A guarda de entrada deixa de ser `if (processedSnap.exists) return` e passa a
consultar as fases pendentes; com nenhuma fase a fazer, retorna como hoje.

### 3. Taxa do cartão — crédito da carteira

Em vez de fixar uma alíquota que envelhece no código, o valor sai do próprio
pagamento: `gatewayFee = max(0, value − netValue)`, com `netValue` vindo do
payload do webhook. Só se aplica quando `billingType === 'CREDIT_CARD'`.

Crédito do organizador = `bruto − taxaPlataforma(bruto) − gatewayFee`.

A taxa da plataforma continua incidindo sobre o **bruto** (regra inalterada:
8% ou a comissão negociada em `organizers/{uid}.commissionPercent`).

`netValue` ausente ou inválido: credita como hoje (`gatewayFee = 0`) e loga
como erro. Reter o dinheiro do organizador por causa de um campo faltando é
pior que absorver a taxa naquele pagamento.

### 4. Varredura de expiração — `tournament-registration-pix-expiry-sweeper.ts`

O job roda a cada minuto e deleta no gateway toda cobrança `pending` vencida.
Uma cobrança de cartão pode estar autorizada (`CONFIRMED`) enquanto o nosso
`pixPending` ainda está `pending` — a janela entre o atleta pagar e o webhook
chegar. Deletar ali destruiria um pagamento aprovado.

Guarda: para documentos com `billingType: 'CREDIT_CARD'`, consultar o pagamento
no gateway antes e só deletar se ainda estiver `PENDING`. Documento de PIX não
ganha nenhuma chamada extra — o caminho quente fica exatamente como está.

### 5. Portal do atleta

`tournament-payment.component` — com `paymentMode: 'appPixCard'` e nenhuma
cobrança viva, o passo de pagamento oferece **PIX** ou **cartão** (CPF exigido
nos dois, é requisito do gateway).

No cartão, depois da callable a tela mostra um link real
`<a [href]="invoiceUrl" target="_blank" rel="noopener">` — mesmo padrão do
portal da arena. Nada de `window.open()` depois de um `await`: bloqueador de
popup mata, e o erro é invisível.

O estado de espera reusa o `watchRegistration` que já está montado: quando o
webhook confirma, a tela vira "inscrição confirmada" e o
`payment-paid-exit` leva ao comprovante — de graça, sem polling novo.

"Voltar sem pagar" (`cancelPendingTournamentRegistrationPix`) e o piso de 5 min
para gerar de novo (`canRegeneratePix`) valem igual para cartão.

Copy: `registration-consent.component.html` afirma hoje que "não existe
pagamento por cartão (só PIX)" no termo LGPD. Muda junto, com os comentários de
doutrina em `tournament-payment.component.ts` e `arena-payment.component.ts`.

## Erros e casos de borda

- **Checkout abandonado**: a cobrança expira com a vaga (varredura), igual PIX.
- **Cartão recusado**: Asaas manda status negativo; o `pixPending` vira
  `expired` e o atleta gera outra cobrança. Já é o comportamento atual.
- **`AWAITING_RISK_ANALYSIS`**: continua não-terminal (nada acontece) até virar
  `CONFIRMED` ou negativo.
- **`CONFIRMED` perdido**: o `RECEIVED` confirma e credita na mesma passada.
- **Chargeback depois de confirmado**: `processedRef` já tem `confirmedAt`, e
  os status negativos seguem sem tratamento automático — mesma lacuna que o
  estorno de PIX tem hoje. Muda só que passa a logar como erro em vez de
  retornar em silêncio.
- **Pagamento duplicado do mesmo atleta**: desfecho `duplicate_payer`
  inalterado, terminal.

## Testes

TDD, teste antes da implementação.

**Node (`node:test`, sem emulador):**
- `registration-payment-phases.test.ts` — a matriz de fases inteira, incluindo
  os dois caminhos de PIX (que precisam continuar idênticos).
- `asaas-tournament-registration-webhook.test.ts` — cartão `CONFIRMED` confirma
  a inscrição e **não** credita; o `RECEIVED` seguinte credita e **não**
  reconfirma; `RECEIVED` sozinho faz as duas; PIX inalterado; dedução do
  `gatewayFee` a partir do `netValue`; `netValue` ausente credita como hoje.
- `tournament-registration-pix-expiry-sweeper.test.ts` — documento de cartão
  autorizado não é deletado; documento de cartão `PENDING` é; PIX não consulta
  o gateway.

**Angular (zoneless TestBed, padrão do portal):**
- seletor de método aparece só em `appPixCard`;
- cartão renderiza o link do checkout e não chama `window.open`;
- estado de espera vira confirmação quando o listener acusa `isPaid`.

## Arquivos

**Cloud Functions**
- `functions/src/tournament-registration-pix.ts` — extrair preâmbulo, nova callable
- `functions/src/asaas-booking-payment.ts` — `createAsaasCardCharge`, `AsaasPaymentDetails`
- `functions/src/registration-payment-phases.ts` — **novo**, regra pura
- `functions/src/asaas-tournament-registration-webhook.ts` — fases + taxa
- `functions/src/organizer-wallet.ts` — `gatewayFeeReais` no lançamento
- `functions/src/tournament-registration-pix-expiry-sweeper.ts` — guarda de cartão
- `functions/src/index.ts` — export da callable

**Portal do atleta**
- `src/app/data/tournament-registrations-repository.ts` — wrapper da callable
- `src/app/tournaments/registration/tournament-payment.component.{ts,html,scss}`
- `src/app/tournaments/registration/wizard/steps/registration-consent.component.html`

## Deploy

O índice e as funções de expiração de PIX ainda estão pendentes em produção
(ver memória `pix-cabe-no-prazo-da-inscricao`). O cartão sobe no mesmo lote:
funções primeiro em DEV, validação com cartão de teste do Asaas, depois PROD.

O webhook precisa ter os eventos `PAYMENT_CONFIRMED` habilitados no painel do
Asaas — hoje o PIX vive só de `PAYMENT_RECEIVED`. Conferir antes de anunciar o
recurso.
