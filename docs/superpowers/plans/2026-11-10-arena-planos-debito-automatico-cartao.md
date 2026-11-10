# Planos de horário — débito automático no cartão — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o pagador de um plano de horário salva um cartão, liga o débito automático e cada mensalidade online dele
é cobrada com o token do Asaas no vencimento; recusa duas vezes cai no link Pix/cartão de hoje.

**Architecture:** o motor de mensalidades não muda. Um cartão salvo por atleta (`users/{uid}/asaas/savedCard`,
token do Asaas). A decisão da mensalidade (`decideScheduleChargeBilling`) passa a marcar `autopay.state: 'scheduled'`
em vez de criar o link quando o pagador ligou o débito. Um job diário (06:00) cobra o token dentro do MESMO grupo
`arenaScheduleAsaasPayments` da mensalidade, e o webhook de hoje faz baixa, crédito no caixa e estorno.

**Tech Stack:** Cloud Functions v2 (TypeScript, `node:test`, `FakeFirestore`), Asaas REST v3, Flutter + Riverpod
(app), Angular (portal da arena).

**Spec:** `docs/superpowers/specs/2026-11-09-arena-planos-debito-automatico-cartao-design.md`. Ler antes. A spec
anterior que este código estende: `docs/superpowers/specs/2026-11-03-arena-planos-cobranca-online-design.md`.

## Global Constraints
- Chave de ambiente: doc `appConfig/payments`, campo `scheduleCardAutopay` (booleano; ausente ou ≠ `true` = desligado).
- Número do cartão e CVV **nunca** em Firestore, log (`logger.*`), mensagem de erro devolvida, Crashlytics ou cache local
  do app. As callables de cartão não logam `request.data`.
- Funções novas: região `CLIENT_FACING_REGIONS` para callables; jobs com `timeZone: "America/Sao_Paulo"`; segredos
  `asaasArenaSecrets` (+ `WEB_PUSH_*` onde notificar), como as vizinhas em `arena-schedule-asaas.ts`.
- Toda chamada ao Asaas passa por `assertAsaasAllowed()` (emulador só em sandbox).
- Ambiente do token: `getAsaasEnvTag()`; cartão salvo de outro ambiente = sem cartão.
- Strings da UI e das mensagens em português; código em inglês. Erro na tela do app via `friendlyErrorMessage`, nunca `$e`.
- Retrocompatível: apps antigos continuam pagando pelo link; mensalidade sem `autopay` se comporta como hoje.
- Testes: rodar só os arquivos novos/afetados (`cd functions && npm run build && node --test lib/<arquivo>.test.js`),
  não a suíte inteira.

## Review Focus
1. **Débito duplo.** Job das 06:00 e varredura de 30 min pegando a mesma mensalidade, ou "Pagar com cartão salvo"
   tocado durante o débito. Esperado: uma cobrança no Asaas. Teste em Task 4 ("dois workers ao mesmo tempo") e em
   Task 5 ("manual durante charging → busy").
2. **Mensalidade resolvida no meio.** Gestor dá baixa ou pausa entre o claim e a resposta do Asaas. Esperado: o
   débito aprovado é estornado pela regra `stale` do webhook. Teste em Task 4 ("baixa manual depois do claim → estorno").
3. **Rateio.** Dois pagadores na mesma assinatura, um com débito e outro sem. Esperado: só a mensalidade do primeiro é
   agendada; a do outro ganha link. Teste em Task 3.
4. **Volta da pausa regrava a mensalidade no mesmo id** (`canWriteCharge`). Esperado: nova decisão, `attempts` zerado,
   chave de idempotência nova (o `attemptId` é aleatório). Teste em Task 4 ("mesmo chargeId, tentativa nova, chave nova").
5. **Taxa do cartão no caixa.** O webhook pode chegar antes da resposta do POST. Esperado: a taxa por cima sai do bruto
   da arena (lida de `tokenCharges.{attemptId}` pelo `externalReference`), igual ao checkout de cartão. Teste em Task 4.

---

## File Structure

Backend (`functions/src/`):
- Create `asaas-saved-card.ts`: cartão salvo do atleta (validação, tokenização, limite de tentativas, leitura). Genérico:
  aulas e CT reaproveitam depois.
- Create `asaas-saved-card.test.ts`.
- Create `arena-schedule-autopay.ts`: chave de ambiente, ligar/desligar, prévia da taxa, núcleo do débito com token,
  job diário, recuperação e as callables `setScheduleAutopay`, `getScheduleAutopayPreview`,
  `payScheduleChargeWithSavedCard`, `removeMyPaymentCard`.
- Create `arena-schedule-autopay.test.ts`.
- Modify `arena-schedule-asaas.ts`: decisão com débito, grupo `autopay`, garantir link, pulo do débito no gatilho,
  `firstChargePaidAtAsaas`, varredura chamando a recuperação.
- Modify `arena-class-asaas-model.ts`: `ClassAsaasState` ganha `"autopay"`.
- Modify `asaas-booking-payment.ts`: `createAsaasTokenCardCharge`.
- Modify `asaas-arena-schedule-webhook.ts`: `externalReference` com tentativa e taxa de `tokenCharges`.
- Modify `arena-schedule-billing.ts`: régua e suspensão ignoram a janela do débito.
- Modify `arena-schedule-plan-constants.ts`: constantes compartilhadas (abaixo).
- Modify `index.ts`: exports.
- Modify `../../firestore.rules` e `../../firestore.indexes.json`.

App e portal: ver Tasks 7–11.

---

### Task 1: Cartão salvo do atleta (`asaas-saved-card.ts`)

**Files:**
- Create: `functions/src/asaas-saved-card.ts`
- Test: `functions/src/asaas-saved-card.test.ts`
- Modify: `functions/src/index.ts`, `firestore.rules`

**Interfaces:**
- Produces:
  - `export interface SavedCard {creditCardToken: string; brand: string; last4: string; expiryMonth: number;
    expiryYear: number; holderName: string; customerId: string; env: "sandbox" | "production"; remoteIp: string}`
  - `export function savedCardRef(db: Firestore, uid: string): DocumentReference` → `users/{uid}/asaas/savedCard`
  - `export async function readSavedCard(db: Firestore, uid: string, env: "sandbox"|"production"): Promise<SavedCard | null>`
    e `export async function readSavedCardTx(tx: Transaction, db: Firestore, uid: string, env): Promise<SavedCard | null>`.
    Retorna null se o doc falta, se `env` difere ou se falta `creditCardToken`.
  - `export function cardValidForDueDate(card: Pick<SavedCard, "expiryMonth" | "expiryYear">, dueDate: string): boolean`:
    válido se (ano, mês) da validade ≥ (ano, mês) de `dueDate` (`AAAA-MM-DD`).
  - `export interface SavedCardDeps { resolveCustomer(uid: string): Promise<string | null>;
    holderInfo(uid: string): Promise<{name: string; email: string; cpfCnpj: string; phone: string}>;
    tokenize(input: {customerId: string; card: {holderName: string; number: string; expiryMonth: string; expiryYear: string; ccv: string};
      holderInfo: {name: string; email: string; cpfCnpj: string; postalCode: string; addressNumber: string; phone: string};
      remoteIp: string}): Promise<{creditCardToken: string; creditCardBrand: string; creditCardNumber: string}>;
    now(): Date; envTag(): "sandbox" | "production" }`
  - `SavedCardDeps` também tem `registerCustomer(uid: string, cpfCnpj: string): Promise<string>` (o mesmo de
    `defaultScheduleAsaasDeps.registerCustomer`).
  - `export const defaultSavedCardDeps: SavedCardDeps`. `resolveCustomer` = o `resolveScheduleCustomer` de
    `arena-schedule-asaas.ts`: mover para cá e reexportar de lá. `tokenize` = `POST /v3/creditCard/tokenizeCreditCard`
    com `{customer, creditCard, creditCardHolderInfo, remoteIp}`.
  - `export async function saveMyPaymentCardCore(db: Firestore, uid: string, input: unknown, remoteIp: string, deps?: SavedCardDeps): Promise<{brand: string; last4: string}>`
  - `export async function getMyPaymentCardCore(db: Firestore, uid: string, env): Promise<{brand; last4; expiryMonth; expiryYear} | null>`
  - `export async function deleteSavedCardCore(db: Firestore, uid: string): Promise<boolean>` (true se existia).
  - Callables `saveMyPaymentCard` e `getMyPaymentCard` (`removeMyPaymentCard` fica na Task 5, porque precisa desligar o débito).
  - Mensagens exportadas (texto exato):
    - `CARD_INVALID_MESSAGE = "Confira os dados do cartão."`
    - `CARD_ATTEMPTS_MESSAGE = "Muitas tentativas. Tente de novo amanhã."`
    - `CARD_REFUSED_TOKENIZE_MESSAGE = "Não foi possível validar este cartão. Confira os dados."`
    - CPF faltando reusa `CPF_REQUIRED_MESSAGE` ("Informe seu CPF para pagar online.").

- [ ] **Step 1: Write the failing tests** (`asaas-saved-card.test.ts`, FakeFirestore de `fake-firestore.test-helper`)
  - `saves token, brand and last4 only`: com deps falsas (`tokenize` devolve `{creditCardToken: "tok_1", creditCardBrand: "VISA", creditCardNumber: "4242"}`),
    o doc `users/u1/asaas/savedCard` fica com exatamente as chaves de `SavedCard` + `createdAt`/`updatedAt`, `env: "sandbox"`,
    `remoteIp: "1.2.3.4"`. `JSON.stringify(doc)` não contém `"4111111111111111"` nem o `ccv`.
  - `rejects invalid input`: número que falha no Luhn, mês 13, validade no passado, CVV de 2 dígitos, CEP com 7 dígitos,
    `addressNumber` vazio → `HttpsError` `invalid-argument` com `CARD_INVALID_MESSAGE`, e `tokenize` não é chamado.
  - `asks for CPF`: `resolveCustomer` → null → `failed-precondition` com `"Informe seu CPF para pagar online."`.
    Com `cpfCnpj: "52998224725"` na entrada, chama `registerCustomer("u1", "52998224725")` e segue. CPF inválido →
    `invalid-argument` "CPF inválido. Confira os números.".
  - `limits to 5 attempts per 24h`: 5 chamadas (válidas ou recusadas) passam e a 6ª dá `resource-exhausted` com
    `CARD_ATTEMPTS_MESSAGE`. Com `now` 24 h depois, volta a passar. Contador em `users/u1/asaas/savedCardAttempts`
    `{windowStart: Timestamp, count}`.
  - `maps Asaas refusal`: `tokenize` lança `new AsaasApiError("Cartão recusado pela operadora.", 400)` →
    `invalid-argument` com essa mensagem; erro sem mensagem → `CARD_REFUSED_TOKENIZE_MESSAGE`; erro não-Asaas →
    `internal`.
  - `replaces previous card`: 2º save sobrescreve token/last4.
  - `readSavedCard ignores other env`: doc com `env: "production"` lido com `"sandbox"` → null.
  - `cardValidForDueDate`: `{12, 2026}` com `"2026-12-05"` → true; com `"2027-01-05"` → false.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `cd functions && npm run build && node --test lib/asaas-saved-card.test.js`
  Expected: FAIL (módulo não existe / build falha).

- [ ] **Step 3: Implement `asaas-saved-card.ts`**
  - Entrada aceita: `{number, holderName, expiryMonth, expiryYear, ccv, postalCode, addressNumber, cpfCnpj?}`. `number`, `ccv` e
    `postalCode` só com dígitos (tirar espaços/pontos/traço antes de validar); `number` com 13–19 dígitos e Luhn;
    `expiryMonth` 1–12; `expiryYear` com 4 dígitos (aceitar 2 e somar 2000); validade ≥ mês corrente em São Paulo;
    `ccv` com 3–4 dígitos; `postalCode` com 8 dígitos; `addressNumber` com 1–10 caracteres; `holderName` com 2–80.
  - Ordem: validar → contar a tentativa (transação no contador) → cliente (CPF) → `holderInfo` → `tokenize` → gravar.
  - O contador conta toda tentativa que passou da validação, aprovada ou não.
  - `brand` = `creditCardBrand` em maiúsculas; `last4` = os últimos 4 de `creditCardNumber`.
  - Callables com `secrets: asaasArenaSecrets`; `remoteIp` = `request.rawRequest.ip ?? ""`.
  - Erros com `AsaasApiError` (`asaas-client.ts`). Log só com `uid` e `httpStatus`.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd functions && npm run build && node --test lib/asaas-saved-card.test.js`
  Expected: PASS

- [ ] **Step 5: Rules + exports**
  - `firestore.rules`: perto das regras de `arenaScheduleAsaasPayments`, `match /users/{userId}/asaas/{docId} { allow read, write: if false; }`
    com o comentário "Cliente Asaas, cartão salvo (token) e contador: só servidor.". Conferir antes que nenhuma regra
    existente libera `users/{uid}/asaas` (hoje só o catch-all nega).
  - `index.ts`: `export {saveMyPaymentCard, getMyPaymentCard} from "./asaas-saved-card";`
  - Run: `cd functions && npm run lint`. Expected: sem erros.

- [ ] **Step 6: Commit**
  `git add functions/src/asaas-saved-card.ts functions/src/asaas-saved-card.test.ts functions/src/arena-schedule-asaas.ts functions/src/index.ts firestore.rules`
  `git commit -m "feat(planos): cartão salvo do atleta (token Asaas)"`

---

### Task 2: Chave, ligar/desligar e prévia (`arena-schedule-autopay.ts`, parte 1)

**Files:**
- Create: `functions/src/arena-schedule-autopay.ts`
- Test: `functions/src/arena-schedule-autopay.test.ts`
- Modify: `functions/src/arena-schedule-plan-constants.ts`, `functions/src/arena-schedule-asaas.ts`, `functions/src/index.ts`

**Interfaces:**
- Consumes: `readSavedCard`, `readSavedCardTx`, `cardValidForDueDate` (Task 1); `scheduleOnlineBillingOn`,
  `scheduleSettingsRef` (`arena-schedule-plans.ts`); `scheduleAsaasGroupData`, `chargeAsaasMirror`.
- Produces (em `arena-schedule-plan-constants.ts`):
  - `APP_PAYMENTS_CONFIG_PATH = "appConfig/payments"`
  - `type AutopayState = "scheduled" | "retry" | "charging" | "paid" | "failed" | "skipped"`
  - `AUTOPAY_WINDOW_STATES: ReadonlySet<AutopayState> = new Set(["scheduled", "retry", "charging"])`
  - `export function autopayOf(charge: Data | undefined): Data` (o mapa `autopay` ou `{}`)
- Produces (em `arena-schedule-asaas.ts`):
  - `export async function ensureScheduleChargeLinkGroup(db: Firestore, chargeId: string): Promise<string | null>`.
    Em transação: mensalidade `open` com `billingMode == 'asaas'`. Sem grupo no espelho, ou com grupo `void`, cria um
    grupo `pending` novo (`scheduleAsaasGroupData`) e aponta o espelho para ele. Grupo `autopay` passa para `pending`
    no mesmo id (espelho `pending`). Grupo vivo: não faz nada. Devolve o id do grupo ou null.
- Produces (em `arena-schedule-autopay.ts`):
  - `export async function scheduleAutopayFlagOn(reader: {get(ref)}): Promise<boolean>` (lê `APP_PAYMENTS_CONFIG_PATH`;
    funciona com `db` e com `tx`)
  - `export async function setScheduleAutopayCore(db: Firestore, uid: string, input: unknown, env: "sandbox"|"production"): Promise<{enabled: boolean; brand: string | null; last4: string | null}>`
  - `export async function getScheduleAutopayPreviewCore(db, uid, input: unknown, env, terms: CardFeeTerms): Promise<{brand: string|null; last4: string|null; cardFeePercent: number; cardProcessingPercent: number; cardFixedReais: number; next: {chargeId: string; dueDate: string; amountReais: number; cardFeeReais: number; chargedReais: number} | null}>`
  - `export async function disableAllScheduleAutopayCore(db: Firestore, uid: string): Promise<number>` (quantas assinaturas)
  - Assinatura ganha `autopay.{uid}: {enabled, brand, last4, consentAt, consentText, updatedAt}` e
    `autopayAthleteIds: string[]` (só os com `enabled: true`; índice de consulta para `disableAll`).
  - Mensalidade agendada: `autopay: {state: "scheduled", scheduledFor: dueDate, attempts: 0, lastAttemptAt: null,
    lastError: null, brand, last4, chargedReais: null}`.
  - Mensagens (texto exato): `AUTOPAY_NO_CARD_MESSAGE = "Salve um cartão para ligar o débito automático."`,
    `AUTOPAY_ARENA_OFFLINE_MESSAGE = "Esta arena não recebe online."`,
    `AUTOPAY_UNAVAILABLE_MESSAGE = "Débito automático indisponível no momento."`,
    `AUTOPAY_NOT_MEMBER_MESSAGE = "Este plano não é seu."`,
    `AUTOPAY_SUB_ENDED_MESSAGE = "Este plano foi encerrado."`, `AUTOPAY_CONSENT_MESSAGE = "Autorização inválida."`.
  - Callables `setScheduleAutopay({subscriptionId, enabled, consentText?})` e `getScheduleAutopayPreview({subscriptionId})`.

- [ ] **Step 1: Write the failing tests** (`arena-schedule-autopay.test.ts`; reaproveitar o padrão do `seedOnline` de
  `arena-schedule-asaas.test.ts`, copiando-o para um helper local ou exportando-o do teste para `arena-schedule.test-helper.ts`)
  - `enable schedules open online charges of the payer`: chave ligada, cartão salvo `env` igual, sub `s1` com
    `memberAthleteIds: ["u1","u2"]`, mensalidades `c1` (u1, `billingMode: "asaas"`, `dueDate` futuro), `c2` (u2), `c3`
    (u1, `billingMode: "manual"`) e `c4` (u1, vencida ontem) → após `setScheduleAutopayCore(db, "u1", {subscriptionId: "s1", enabled: true, consentText: "Autorizo…"}, "sandbox")`:
    `c1.autopay.state == "scheduled"` e `scheduledFor == c1.dueDate`; c2, c3 e c4 sem `autopay`;
    `s1.autopay.u1.enabled == true`, `consentText` gravado, `autopayAthleteIds == ["u1"]`. Retorno `{enabled: true, brand: "VISA", last4: "4242"}`.
  - `enable keeps an existing live link`: `c1` com grupo `open` no espelho → ganha `scheduled` e o grupo fica `open`.
  - `errors`: sem cartão → `failed-precondition` `AUTOPAY_NO_CARD_MESSAGE`; chave ausente → `AUTOPAY_UNAVAILABLE_MESSAGE`;
    arena sem `onlinePaymentEnabled` → `AUTOPAY_ARENA_OFFLINE_MESSAGE`; uid fora de `memberAthleteIds` →
    `permission-denied` `AUTOPAY_NOT_MEMBER_MESSAGE`; sub `canceled` → `failed-precondition` `AUTOPAY_SUB_ENDED_MESSAGE`;
    `consentText` vazio ou com mais de 1000 caracteres ao ligar → `invalid-argument` `AUTOPAY_CONSENT_MESSAGE`.
  - `disable moves scheduled/retry to skipped and ensures the link`: `c1` `scheduled` sem grupo → após desligar,
    `c1.autopay.state == "skipped"` e existe grupo `pending` apontado pelo espelho; `autopayAthleteIds == []`.
  - `ensureScheduleChargeLinkGroup turns an autopay group into pending in place`: grupo `g1` `state: "autopay"` no
    espelho → `g1.state == "pending"`, o espelho segue em `g1` com estado `pending`.
  - `disableAll`: duas assinaturas com u1 no `autopayAthleteIds` → as duas desligadas; retorno 2.
  - `preview`: com terms `{anticipationPercent: 1.5, processingPercent: 3.99, fixedReais: 0.49}` e a próxima `c1` de
    R$ 300 → `next.amountReais == 300`, `next.chargedReais == 300 + cardSurcharge(300, terms).totalCents / 100`.
    Sem mensalidade aberta → `next: null`.

- [ ] **Step 2: Run tests to verify they fail**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-autopay.test.js`
  Expected: FAIL

- [ ] **Step 3: Implement** as interfaces acima.
  - Ligar e desligar rodam uma transação na assinatura e, depois, uma transação por mensalidade do pagador
    (`where subscriptionId == s && payerAthleteId == uid && status == "open"`). Não fazer uma transação gigante.
  - Elegível para agendar: `billingMode == "asaas"`, `dueDate >= hoje` (SP) e `autopay.state` ausente ou em
    `skipped`/`failed`.
  - Ligar com cartão vencido para o mês de `dueDate` não agenda aquela mensalidade.
  - `getScheduleAutopayPreview` busca as taxas com `loadCardFeeTerms()` e exige `secrets: asaasArenaSecrets`.

- [ ] **Step 4: Run tests to verify they pass**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-autopay.test.js lib/arena-schedule-asaas.test.js`
  Expected: PASS

- [ ] **Step 5: Exports + commit**
  `index.ts`: `export {setScheduleAutopay, getScheduleAutopayPreview} from "./arena-schedule-autopay";`
  `git commit -m "feat(planos): ligar/desligar débito automático e prévia da taxa"`

---

### Task 3: Decisão da mensalidade, grupo `autopay` e saída de "em aberto" (`arena-schedule-asaas.ts`)

**Files:**
- Modify: `functions/src/arena-schedule-asaas.ts`, `functions/src/arena-class-asaas-model.ts`
- Test: `functions/src/arena-schedule-asaas.test.ts` (casos novos num `describe("débito automático")`)

**Interfaces:**
- Consumes: `scheduleAutopayFlagOn` (Task 2, versão que aceita `tx`), `readSavedCardTx`, `cardValidForDueDate` (Task 1),
  `autopayOf`, `AUTOPAY_WINDOW_STATES` (Task 2).
- Produces:
  - `ClassAsaasState` ganha `"autopay"` (sem efeito nas Aulas).
  - `decideScheduleChargeBilling(db, chargeId)` devolve `{billingMode, groupId, autopay: boolean}`.
  - `export function autopayLeftOpen(before: Data | undefined, after: Data | undefined): boolean`: antes `open`, depois
    ≠ `open`, e `autopay.state` de `after` em `scheduled`/`retry`.
  - `export async function skipScheduleAutopay(db: Firestore, chargeId: string, reason: string): Promise<boolean>`:
    `scheduled`/`retry` → `skipped` com `lastError: reason`.

- [ ] **Step 1: Write the failing tests**
  - `decide with autopay schedules and creates no group`: chave ligada, `s1.autopay.u1.enabled`, cartão válido →
    `c1.billingMode == "asaas"`, `c1.autopay.state == "scheduled"`, `scheduledFor == "2026-12-05"`, sem `c1.asaas`,
    nenhum doc em `arenaScheduleAsaasPayments`; nenhum push `schedule_plan_charge_link`.
  - `decide without autopay keeps today's link`: `u2` sem débito → grupo `pending` + espelho (comportamento atual).
  - `rateio`: `c1` (u1, débito ligado) agendada e `c2` (u2) com grupo `pending`.
  - `expired card falls back to the link and warns`: cartão `{expiryMonth: 11, expiryYear: 2026}` e `dueDate`
    `2026-12-05` → grupo `pending` e push `type: "schedule_plan_autopay_card_expired"` com título
    `"Seu cartão venceu"` e corpo `"O cartão final 4242 venceu. Pague o plano Fixo 1x por Pix ou cartão e salve um cartão novo."`.
  - `flag off → link`: `appConfig/payments` ausente → grupo `pending`, sem `autopay`.
  - `leaving open skips the debit`: `c1` `scheduled` → baixa manual (`registerSchedulePaymentCore`) → gatilho
    (`autopayLeftOpen` + `skipScheduleAutopay`) → `c1.autopay.state == "skipped"`.
  - `void of an autopay group is immediate`: grupo `autopay` + mensalidade cancelada → `requestScheduleGroupVoid` →
    `state: "void"` direto (nada a apagar no Asaas).
  - `first charge paid by token counts for the 30-min window`: grupo com `paymentId: null` e
    `tokenCharges.t1 = {paymentId: "pay_t1", status: "paid"}` → `expireSchedulePendingPayments` não expira (conta como
    `waitingWebhook`). Com `status: "charging"` e `getPayment("pay_t1")` → `CONFIRMED` → também não expira.

- [ ] **Step 2: Run to verify fail**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-asaas.test.js`
  Expected: FAIL nos casos novos; os antigos seguem PASS.

- [ ] **Step 3: Implement**
  - Na transação de `decideScheduleChargeBilling`, só quando `mode === "asaas"`: ler `APP_PAYMENTS_CONFIG_PATH` e o
    cartão do pagador (`readSavedCardTx` com `getAsaasEnvTag()`). Agenda se: chave ligada,
    `sub.autopay[payer].enabled === true`, cartão existe e `cardValidForDueDate`. Cartão vencido devolve
    `cardExpired: {last4, planName}` na resposta da transação, e o push sai depois dela por `notifyScheduleSafe`
    (`arena-schedule-plans.ts`, o mesmo da régua de atraso).
  - `onArenaScheduleChargeWritten`: além do que já faz, `if (autopayLeftOpen(before, after)) await skipScheduleAutopay(db, chargeId, "charge_resolved")`.
  - `requestScheduleGroupVoid`: estado `autopay` → `void` direto, como `needs_cpf`.
  - `firstChargePaidAtAsaas`: depois do `group.paymentId`, olhar cada `tokenCharges.*`. `status: "paid"` → true;
    com `paymentId`, consultar `deps.getPayment` e testar `PAID_STATUSES`.
  - `onArenaScheduleAsaasPaymentWritten` não muda (ele só reage a `pending`/`voiding`); escrever um teste que grava um
    grupo `autopay` e confere que `ensureScheduleAsaasPayment` não é chamado.

- [ ] **Step 4: Run to verify pass**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-asaas.test.js lib/arena-schedule-review-fixes.test.js lib/arena-schedule-pending-payment.test.js`
  Expected: PASS

- [ ] **Step 5: Commit**
  `git commit -m "feat(planos): mensalidade com débito automático agenda em vez de gerar link"`

---

### Task 4: Débito com token, job diário e webhook (`arena-schedule-autopay.ts` parte 2, webhook, `asaas-booking-payment.ts`)

**Files:**
- Modify: `functions/src/arena-schedule-autopay.ts`, `functions/src/asaas-booking-payment.ts`,
  `functions/src/asaas-arena-schedule-webhook.ts`, `functions/src/arena-schedule-asaas.ts` (varredura),
  `functions/src/index.ts`, `firestore.indexes.json`
- Test: `functions/src/arena-schedule-autopay.test.ts`, `functions/src/arena-schedule-asaas.test.ts` (webhook)

**Interfaces:**
- Consumes: Tasks 1–3; `processArenaScheduleAsaasNotification`; `cardSurcharge`, `loadCardFeeTerms`;
  `ensureScheduleChargeLinkGroup` (Task 2).
- Produces:
  - `asaas-booking-payment.ts`: `export async function createAsaasTokenCardCharge(params: {customerId: string; valueReais: number;
    description: string; externalReference: string; idempotencyKey: string; creditCardToken: string; remoteIp: string}): Promise<{paymentId: string; status: string}>`.
    Faz `POST /v3/payments` com `billingType: "CREDIT_CARD"`, `dueDate` = hoje em SP, `creditCardToken`, `remoteIp`.
    Recusa vem como `AsaasApiError` (HTTP 400).
  - Webhook: `export function parseScheduleTokenAttempt(ref: string): string | null` (`arenaSchedulePayment:{groupId}:t{attemptId}` → `attemptId`).
    `parseSchedulePaymentRef` passa a devolver só o `groupId` (a parte antes do 2º `:`).
  - `export interface AutopayDeps { resolveCustomer(uid): Promise<string | null>; cardFeeTerms(): Promise<CardFeeTerms>;
    createTokenCharge(input: {groupId: string; attemptId: string; customerId: string; valueReais: number; description: string; creditCardToken: string; remoteIp: string}): Promise<{paymentId: string; status: string}>;
    getPayment(paymentId: string): Promise<AsaasPaymentDetails>;
    settle(db: Firestore, paymentId: string, payment: AsaasPaymentDetails): Promise<void>;
    notify(input: {userId; title; body; type; data}): Promise<void>; now(): Date; envTag(): "sandbox"|"production";
    newAttemptId(): string }`.
    Default: `externalReference: arenaSchedulePayment:{groupId}:t{attemptId}`, `idempotencyKey: schedule-token-{env}-{attemptId}`;
    `settle` = `processArenaScheduleAsaasNotification` com o `processedRef` de `artifacts/{projectId}/public/data/asaas_processed_payments/{paymentId}`.
  - `export type TokenChargeOutcome = {outcome: "paid"} | {outcome: "refused"; message: string} | {outcome: "skipped"; reason: string} | {outcome: "busy"}`
  - `export async function runScheduleTokenCharge(db: Firestore, chargeId: string, source: "autopay" | "manual", deps: AutopayDeps, opts?: {uid?: string; resumeAttemptId?: string}): Promise<TokenChargeOutcome>`
  - `export async function chargeScheduleAutopayDue(db, now: Date, deps): Promise<{upcoming: number; charged: number; paid: number; refused: number; failed: number; skipped: number}>`
  - `export async function recoverScheduleAutopay(db, now: Date, deps): Promise<{resumed: number; linked: number}>`
  - Job `chargeArenaScheduleAutopay` (`schedule: "every day 06:00"`, SP, `timeoutSeconds: 540`).
  - Pushes (texto exato; `data: {chargeId, subscriptionId, arenaId, url: ATHLETE_PLANS_URL}`):
    - `schedule_plan_autopay_upcoming`: título `"Débito automático em 3 dias"`, corpo
      `"Dia {DD/MM} vamos debitar R$ {Z} no cartão final {last4} (plano {plano})."`
    - `schedule_plan_autopay_paid`: título `"Mensalidade paga"`, corpo `"Plano {plano} · {mês}: R$ {Z} no cartão final {last4}."`
    - `schedule_plan_autopay_failed`: título `"Não conseguimos debitar"`, corpo
      `"Não conseguimos debitar R$ {Z} no cartão final {last4}. Pague por Pix ou cartão."`
    - Valores com `toFixed(2).replace(".", ",")`, como o lembrete de hoje.

  Algoritmo de `runScheduleTokenCharge` (a ordem importa):
  1. **Claim (transação).** Lê a mensalidade, a assinatura, a arena, as regras, `appConfig/payments` e o cartão do pagador.
     - `source: "autopay"` exige `autopay.state` em `scheduled`/`retry`, mensalidade `open` + `billingMode: "asaas"`,
       débito do pagador ligado, cartão do ambiente válido para `dueDate`, chave ligada e arena apta
       (`scheduleOnlineBillingOn`). Faltou algo → `skipped` com `lastError` = motivo (`charge_resolved`, `autopay_off`,
       `no_card`, `card_expired`, `flag_off`, `arena_offline`) e, se a mensalidade segue aberta, chamar
       `ensureScheduleChargeLinkGroup` fora da transação. Devolve `{outcome: "skipped"}`.
     - `source: "manual"` exige `open` + `billingMode: "asaas"`, cartão e chave; `autopay.state === "charging"` →
       `{outcome: "busy"}`.
     - Grupo: o do espelho se estiver vivo (`pending|creating|open|failed|autopay`). Se não houver, cria um grupo
       `autopay` (`scheduleAsaasGroupData` + `state: "autopay"`, `customerAthleteId: payer`) e aponta o espelho para ele
       com estado `autopay`.
     - `attemptId = opts.resumeAttemptId ?? deps.newAttemptId()`. O valor é a base do grupo (`group.amountReais`) mais
       `cardSurcharge(base, terms)`. As taxas são lidas ANTES da transação e passadas para dentro.
     - Grava `tokenCharges.{attemptId} = {paymentId: null, source, status: "charging", feeCents, processingCents, chargedReais, at}`
       no grupo. Se `source: "autopay"`, também `autopay: {...state: "charging", attempts: +1, lastAttemptAt: now, chargedReais}`.
  2. **Fora da transação:** `deps.createTokenCharge(...)`.
     - Erro `AsaasApiError` com `httpStatus` 400 → recusa (passo 4).
     - Outro erro (rede/5xx) → deixa `charging` (a recuperação repete com o mesmo `attemptId`) e devolve `{outcome: "busy"}`.
  3. **Criou:** grava `tokenCharges.{attemptId}.paymentId`. Se o status for `CONFIRMED`/`RECEIVED`, `deps.getPayment` →
     `deps.settle(...)`: o webhook marca a mensalidade como paga, ou estorna se ela já estava resolvida. Depois
     `tokenCharges.{attemptId}.status = "paid"`; se `autopay`, `autopay.state = "paid"`; push `paid`. Devolve `{outcome: "paid"}`.
     Status diferente (raro com token) → fica `charging`, para a recuperação consultar.
  4. **Recusa:** `tokenCharges.{attemptId}.status = "refused"` e `error` = mensagem do Asaas.
     - `manual`: não mexe em `autopay`; devolve `{outcome: "refused", message}`.
     - `autopay` com `attempts == 1` → `retry` com `scheduledFor` = amanhã.
     - `autopay` com `attempts == 2` → `failed`, `ensureScheduleChargeLinkGroup` (o grupo `autopay` vira `pending` e
       ganha o link) e push `failed`.

  `chargeScheduleAutopayDue`:
  - (a) aviso: `autopay.state == "scheduled"` e `autopay.scheduledFor == hoje + 3` sem `autopay.upcomingSentAt` → push `upcoming`
    e grava `upcomingSentAt`;
  - (b) débito: `autopay.state in ["scheduled", "retry"]` e `autopay.scheduledFor <= hoje`, até 300 por rodada →
    `runScheduleTokenCharge(..., "autopay")` em série.

  `recoverScheduleAutopay` (chamada pela varredura de 30 min):
  - `charging` com `lastAttemptAt` há mais de 15 min: ache a tentativa `charging` do grupo. Com `paymentId`, consulte →
    pago: `settle` + `paid`; recusado ou removido: recusa (passo 4); senão espere. Sem `paymentId`,
    `runScheduleTokenCharge` com `resumeAttemptId` (mesma chave no Asaas).
  - `scheduled`/`retry` com `scheduledFor <= hoje − 2` → `skipped` (`lastError: "missed_run"`) + `ensureScheduleChargeLinkGroup`.

  Webhook (`processArenaScheduleAsaasNotification`): a taxa por cima vem de `cardCharges[paymentId]` e, se faltar, de
  `tokenCharges[parseScheduleTokenAttempt(externalReference)]` (mesmo formato `{feeCents, processingCents}`). Nada mais muda.

- [ ] **Step 1: Write the failing tests**
  - `debits on the due date`: `c1` `scheduled` para hoje; `createTokenCharge` → `{paymentId: "pay_1", status: "CONFIRMED"}`;
    `settle` real (webhook com `webhookDeps`) → `c1.status == "paid"`, `paidVia == "asaas"`, `c1.autopay.state == "paid"`,
    `attempts == 1`, `tokenCharges.<id>.paymentId == "pay_1"`. O caixa da arena recebe R$ 300 menos a taxa nexaGO
    (a taxa do cartão não entra no bruto). Push `schedule_plan_autopay_paid`.
  - `refused → retry → paid`: 1ª chamada lança `AsaasApiError("Saldo insuficiente.", 400)` → `retry`, `scheduledFor` =
    amanhã, nenhum grupo `pending`. No dia seguinte, aprovado → `paid`, `attempts == 2`.
  - `refused twice → link`: grupo `autopay` → `pending` (mesmo id), espelho `pending`, `autopay.state == "failed"`, push
    `schedule_plan_autopay_failed` com `"Não conseguimos debitar R$ 312,46 no cartão final 4242. Pague por Pix ou cartão."`
    (calcular o valor com `cardSurcharge` e os terms do teste).
  - `paid by link before → skipped`: `c1` `paid` via link antes da rodada → `skipped`, `createTokenCharge` não é chamado.
  - `two workers at once → one charge`: `Promise.all([run(), run()])` → `createTokenCharge` chamado 1 vez.
  - `manual payment during charging → busy`.
  - `resolved after claim → refund`: `createTokenCharge` dá baixa manual na mensalidade antes de devolver → `settle` →
    `refunds == ["pay_1"]`.
  - `network error keeps charging; recovery resumes with the same key`: 1ª lança `new Error("ECONNRESET")` → `charging`;
    `recoverScheduleAutopay` 16 min depois chama `createTokenCharge` com o MESMO `attemptId`.
  - `same chargeId after pause gets a new key`: duas tentativas em dias diferentes → `attemptId` diferentes.
  - `flag off / arena offline / card removed on the day → skipped + link`.
  - `missed run → link`: `scheduledFor` há 2 dias → `recoverScheduleAutopay` → `skipped` + grupo `pending`.
  - `upcoming push once`: `scheduledFor = hoje+3` → 1 push e, numa 2ª rodada, nenhum.
  - Webhook: `parseScheduleTokenAttempt("arenaSchedulePayment:g1:tabc") == "abc"`; `parseSchedulePaymentRef` do mesmo
    → `"g1"`; webhook antes da resposta do POST (sem `tokenCharges.paymentId`) credita o caixa sem a taxa do cartão.
  - Nada gravado ou logado contém o `creditCardToken` fora de `savedCard`: `JSON.stringify` dos grupos e mensalidades.

- [ ] **Step 2: Run to verify fail**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-autopay.test.js lib/arena-schedule-asaas.test.js`
  Expected: FAIL nos novos.

- [ ] **Step 3: Implement** conforme o algoritmo acima.
  - `reconcileScheduleAsaasPayments` chama `recoverScheduleAutopay` no fim e soma `autopayResumed`/`autopayLinked` ao
    resultado.
  - O loop "staleVoided" da varredura não toca grupos `autopay` com a mensalidade em `charging` (estão em voo).
- [ ] **Step 4: Índice** em `firestore.indexes.json`: `arenaScheduleCharges` com `autopay.state ASC, autopay.scheduledFor ASC`.
- [ ] **Step 5: Run to verify pass** (mesmo comando + `lib/arena-schedule-review-fixes.test.js`). Expected: PASS.
- [ ] **Step 6: Exports + commit**
  `index.ts`: `chargeArenaScheduleAutopay`.
  `git commit -m "feat(planos): débito com token no vencimento, retentativa e queda para o link"`

---

### Task 5: Régua de atraso, pagar com cartão salvo e remover cartão

**Files:**
- Modify: `functions/src/arena-schedule-billing.ts`, `functions/src/arena-schedule-autopay.ts`, `functions/src/index.ts`
- Test: `functions/src/arena-schedule-billing.test.ts`, `functions/src/arena-schedule-autopay.test.ts`

**Interfaces:**
- Consumes: `AUTOPAY_WINDOW_STATES`, `autopayOf` (Task 2); `runScheduleTokenCharge` (Task 4); `deleteSavedCardCore` (Task 1);
  `disableAllScheduleAutopayCore` (Task 2); `assertPaymentWindowOpen`, `decideScheduleChargeBilling` (`arena-schedule-asaas.ts`, exportar `assertPaymentWindowOpen`).
- Produces:
  - `export function inAutopayWindow(charge: Data): boolean`
  - `export async function payScheduleChargeWithSavedCardCore(db, uid: string, input: unknown, deps: AutopayDeps): Promise<{status: "paid"}>`
  - Callables `payScheduleChargeWithSavedCard({chargeId})` e `removeMyPaymentCard()` → `{removed: boolean; plans: number}`.
  - Mensagens: `AUTOPAY_BUSY_MESSAGE = "Estamos debitando esta mensalidade. Aguarde um instante."`,
    `CARD_REFUSED_MESSAGE = "O cartão foi recusado. Tente outro cartão ou pague com Pix."`.

- [ ] **Step 1: Write the failing tests**
  - `no reminder and no suspension inside the debit window`: `overdueReleaseDays: 1`, `c1` vencida há 1 dia com
    `autopay.state: "retry"` → `runScheduleSubscriptionsDaily` não manda `schedule_plan_charge_reminder` nem suspende.
    Com `failed`, manda e suspende como hoje.
  - `pay with saved card`: `c1` open/asaas sem débito → `{status: "paid"}`, `tokenCharges.<id>.source == "manual"`, sem
    campo `autopay` criado. Assinatura `pending_payment` com a 1ª paga → ativa (gatilho de hoje).
  - `manual does not count as an attempt`: `c1` em `retry` (`attempts: 1`) → manual recusado → `invalid-argument` com
    a mensagem do Asaas; `autopay.attempts` segue 1 e o estado segue `retry`.
  - `manual on failed works`: `c1` `failed` com link → pago pelo token; o link pago depois é estornado (webhook).
  - `busy`: `charging` → `failed-precondition` `AUTOPAY_BUSY_MESSAGE`.
  - `not visible`: uid fora de `visibleTo` → `permission-denied` "Esta mensalidade não é sua." (mesma mensagem do link).
  - `payment window closed`: assinatura `pending_payment` vencida → `PAYMENT_WINDOW_CLOSED_MESSAGE`.
  - `remove card`: com duas assinaturas ligadas → `{removed: true, plans: 2}`, `savedCard` apagado, mensalidades
    `scheduled` → `skipped` + link.
- [ ] **Step 2: Run to verify fail**
  Run: `cd functions && npm run build && node --test lib/arena-schedule-billing.test.js lib/arena-schedule-autopay.test.js`
- [ ] **Step 3: Implement**
  - `dueReminder` e `isPastRelease` devolvem null/false quando `inAutopayWindow(charge)`.
  - A callable de pagar decide a mensalidade com `billingMode: null` antes de tudo (como o "Pagar" de hoje).
  - Recusa com `message` vazia → `CARD_REFUSED_MESSAGE`.
  - Sem cartão → `AUTOPAY_NO_CARD_MESSAGE`.
- [ ] **Step 4: Run to verify pass** (mesmo comando). Expected: PASS.
- [ ] **Step 5: Lint, exports e commit**
  `cd functions && npm run lint`.
  `index.ts`: `payScheduleChargeWithSavedCard`, `removeMyPaymentCard`.
  `git commit -m "feat(planos): pagar com cartão salvo, remover cartão e régua respeita o débito"`

---

### Task 6: Rules (teste de emulador)

**Files:**
- Create: `functions/test/schedule-autopay.rules.test.mjs` (copiar o arranque de um `*.rules.test.mjs` existente)

- [ ] **Step 1:** Escrever os testes:
  - o dono não lê nem grava `users/{uid}/asaas/savedCard` nem `users/{uid}/asaas/savedCardAttempts`;
  - o atleta continua lendo a assinatura dele com o campo `autopay` (a regra atual de `arenaScheduleSubscriptions`);
  - o atleta não grava `autopay` na mensalidade nem na assinatura.
- [ ] **Step 2:** Run: `cd functions && firebase emulators:exec --only firestore --project nexago-rules-test "node --test --test-concurrency=1 test/schedule-autopay.rules.test.mjs"`.
  Expected: PASS. Se a gravação do atleta passar, ajustar a rule de `arenaScheduleCharges`/`arenaScheduleSubscriptions`
  para congelar `autopay` (ver a memória `rule-de-papel-precisa-congelar-campos`).
- [ ] **Step 3:** Commit: `git commit -m "test(planos): rules do cartão salvo e do débito"`

---

## App (Flutter, `nexago_app/lib/`)

Feature nova `features/payment_card/` (cartão salvo, genérico) e mudanças em `features/schedule_plans/` e
`features/athlete_billing/`. Testes: `cd nexago_app && flutter test <arquivos>`, só os novos/afetados.

### Task 7: Cartão salvo no app (`features/payment_card/`)

**Files:**
- Create: `features/payment_card/domain/saved_payment_card.dart`, `features/payment_card/domain/card_input_validation.dart`,
  `features/payment_card/infrastructure/payment_card_repository.dart`, `features/payment_card/application/payment_card_providers.dart`,
  `features/payment_card/presentation/payment_card_form_page.dart`, `features/payment_card/presentation/saved_payment_card_page.dart`,
  `features/payment_card/presentation/payment_card_routes.dart`
- Modify: `core/router/routes.dart` (constantes e `AppRouteNames`), `core/router/app_router.dart:~3484`
  (`...paymentCardRoutes()`), `features/athlete_billing/presentation/athlete_billing_page.dart` (tile "Cartão salvo")
- Test: `nexago_app/test/features/payment_card/card_input_validation_test.dart`, `.../payment_card_form_page_test.dart`,
  `.../saved_payment_card_page_test.dart`

**Interfaces:**
- Consumes: callables `saveMyPaymentCard`, `getMyPaymentCard`, `removeMyPaymentCard` (Tasks 1 e 5).
- Produces:
  - `class SavedPaymentCard {final String brand; final String last4; final int expiryMonth; final int expiryYear;
    factory SavedPaymentCard.fromMap(Map<String, dynamic>); String get label` → `"Visa final 4242"` (bandeira em
    título: `VISA→Visa`, `MASTERCARD→Mastercard`, `ELO→Elo`, `AMEX→Amex`, `HIPERCARD→Hipercard`, outra → como veio)`}`
  - `class PaymentCardRepository {Future<SavedPaymentCard> save(PaymentCardInput input); Future<SavedPaymentCard?> mine();
    Future<int> remove()}`, que lança `SchedulePlanException`-like `PaymentCardException(message)`. Usar `callableErrorMessage`
    como `SchedulePlansRepository._call`.
  - `class PaymentCardInput {number, holderName, expiryMonth, expiryYear, ccv, postalCode, addressNumber}`, com
    `toMap()` só com dígitos.
  - `paymentCardRepositoryProvider`; `myPaymentCardProvider` (`FutureProvider.autoDispose<SavedPaymentCard?>`);
    `scheduleCardAutopayEnabledProvider` (`StreamProvider<bool>` em `appConfig/payments`, `scheduleCardAutopay == true`,
    no padrão do `sandRankEnabledProvider` em `features/athlete/domain/sand_rank/sand_rank_providers.dart:12`; carregando
    ou com erro = `false` para quem consome via `.valueOrNull ?? false`).
  - Validação pura (`card_input_validation.dart`), espelho da do servidor: `bool luhnValid(String digits)`,
    `String? validateCardNumber(String)`, `String? validateExpiry(String mmYy, DateTime now)`, `String? validateCcv(String)`,
    `String? validateCep(String)`; erros "Número do cartão inválido.", "Validade inválida.", "CVV inválido.", "CEP inválido.".
    Formatters `CardNumberInputFormatter` (grupos de 4, até 19 dígitos) e `CardExpiryInputFormatter` (`MM/AA`).
  - Rotas: `AppRoutes.paymentCardNew = '/cartao/novo'` (devolve `SavedPaymentCard` no `pop`) e
    `AppRoutes.savedPaymentCard = '/cartao'`.

- [ ] **Step 1: Write the failing tests**
  - validação: `luhnValid('4111111111111111')` true, `'4111111111111112'` false; `validateExpiry('12/26', DateTime(2026,11,10))`
    null, `'10/26'` → "Validade inválida."; formatters: `'4111111111111111'` → `'4111 1111 1111 1111'`, `'1226'` → `'12/26'`.
  - form page: preencher com dados válidos e tocar "Salvar cartão" chama `repo.save` com `number: '4111111111111111'`,
    `expiryMonth: 12`, `expiryYear: 2026`, e faz `pop` com o cartão. Com erro do servidor, mostra
    `friendlyErrorMessage(e, action: 'Não foi possível salvar o cartão')`. Os campos de número e CVV têm
    `enableSuggestions: false`, `autocorrect: false` e `autofillHints: [AutofillHints.creditCardNumber]` /
    `[AutofillHints.creditCardSecurityCode]`.
  - saved card page: mostra "Visa final 4242 · validade 12/26" e "Remover"; a confirmação diz
    "O débito automático de todos os seus planos será desligado."; confirmar chama `repo.remove`. Sem cartão:
    "Nenhum cartão salvo." + "Adicionar cartão".
- [ ] **Step 2: Run to verify fail**: `cd nexago_app && flutter test test/features/payment_card/`
- [ ] **Step 3: Implement.** A tela de cartão segue o layout das telas de pagamento (`schedule_plan_payment_page.dart`).
  CPF: se o servidor devolver "Informe seu CPF para pagar online.", a tela mostra `BookingPixCpfField`
  (`features/arenas/presentation/widgets/booking_pix/booking_pix_cpf_field.dart`) e manda de novo com `cpfCnpj`
  (contrato da Task 1). `dispose` limpa os controllers.
  Tile "Cartão salvo" em `AthleteBillingPage` só com `scheduleCardAutopayEnabledProvider` ligado.
- [ ] **Step 4: Run to verify pass** (mesmo comando) + `flutter analyze lib/features/payment_card`.
- [ ] **Step 5: Commit** `git commit -m "feat(app): cartão salvo (formulário, tela e rotas)"`

### Task 8: Débito automático em "Meu plano" e na tela de pagar (`features/schedule_plans/`)

**Files:**
- Modify: `domain/schedule_plan_models.dart` (`ScheduleCharge` 598–678, `ScheduleSubscription` 680+),
  `domain/schedule_plan_logic.dart`, `infrastructure/schedule_plans_repository.dart`,
  `presentation/my_schedule_plans_page.dart` (perto do `ScheduleChargeCard` nas linhas 439–444 e 1008–1147),
  `presentation/schedule_plan_payment_page.dart` (`_openBody` 253–405)
- Create: `presentation/widgets/schedule_autopay_card.dart`, `presentation/widgets/schedule_autopay_consent_sheet.dart`
- Test: `test/features/schedule_plans/domain/schedule_plan_autopay_test.dart`,
  `test/features/schedule_plans/presentation/my_schedule_plans_autopay_test.dart`,
  `test/features/schedule_plans/presentation/schedule_plan_payment_page_test.dart` (casos novos)

**Interfaces:**
- Consumes: Task 7 (`myPaymentCardProvider`, `scheduleCardAutopayEnabledProvider`, `AppRoutes.paymentCardNew`); callables
  `setScheduleAutopay`, `getScheduleAutopayPreview`, `payScheduleChargeWithSavedCard`.
- Produces:
  - `class ScheduleChargeAutopay {state, scheduledFor (String?), attempts, brand, last4, chargedReais (double?)}`;
    `ScheduleCharge.autopay` (null quando o mapa falta). Parse em `fromMap` com os `sp*` de hoje.
  - `class ScheduleAutopayConsent {enabled, brand, last4}`; `ScheduleSubscription.autopayFor(String uid)` →
    `ScheduleAutopayConsent?`.
  - `class ScheduleAutopayPreview {brand, last4, cardFeePercent, cardProcessingPercent, cardFixedReais, next: ({chargeId, dueDate, amountReais, cardFeeReais, chargedReais})?}`.
  - Repository: `Future<ScheduleAutopayConsent> setAutopay(String subscriptionId, {required bool enabled, String? consentText})`,
    `Future<ScheduleAutopayPreview> autopayPreview(String subscriptionId)`, `Future<void> payWithSavedCard(String chargeId)`.
  - Lógica:
    - `String? scheduleAutopayChargeLabel(ScheduleCharge c)`: `scheduled`/`retry` →
      `"Será debitada em DD/MM no cartão final 1234"`; `charging` → `"Debitando no cartão final 1234…"`; `failed` →
      `"Não conseguimos debitar. Pague por Pix ou cartão."`; `paid` → `"Paga no cartão final 1234"`; senão null.
    - `String scheduleAutopayConsentText({planName, arenaName, cardLabel, preview})` (texto exato, mandado como `consentText`):
      `"Autorizo a nexaGO a debitar no cartão {cardLabel}, no dia do vencimento, cada mensalidade do plano {planName} ({arenaName}), mais a taxa do cartão ({P}% + R$ {F}). Posso desligar quando quiser em Meu plano."`,
      com `P = cardFeePercent + cardProcessingPercent` (vírgula decimal, até 2 casas) e `F = cardFixedReais` (`0,49`).

- [ ] **Step 1: Write the failing tests**
  - modelos: `fromMap` com `autopay: {state: 'retry', scheduledFor: '2026-12-06', attempts: 1, brand: 'VISA', last4: '4242'}` →
    campos lidos; sem `autopay` → null. `autopayFor('u1')` lê `autopay.u1`.
  - lógica: rótulos acima com `scheduledFor: '2026-12-05'` → `"Será debitada em 05/12 no cartão final 4242"`; consent
    text com `{1.5, 3.99, 0.49}` → `"…mais a taxa do cartão (5,49% + R$ 0,49)…"`.
  - Meu plano, com a flag ligada e o atleta no plano: card "Débito automático".
    - Desligado: "Pague todo mês sem abrir o app" e "Ativar" (`schedule-autopay-enable`).
    - Ativar sem cartão: `push(AppRoutes.paymentCardNew)` e, voltando com o cartão, abre a folha de autorização.
    - Na folha, "Autorizar" chama `setAutopay(..., enabled: true, consentText: <texto exato>)`.
    - Ligado: "Visa final 4242 · próxima: 05/12, R$ 312,46", "Trocar cartão" (abre o formulário) e "Desligar" (confirma e
      chama `setAutopay(enabled: false)`).
    - Com a flag desligada, o card não aparece.
    - Com a mensalidade em `scheduled`, o `ScheduleChargeCard` mostra o rótulo e segue com "Pagar".
  - tela de pagar: com cartão salvo e a flag ligada, aparece "Pagar com cartão salvo (Visa final 4242)"
    (`schedule-pay-saved-card`). Tocar chama `payWithSavedCard(chargeId)`, e a tela fecha no sucesso pelo
    `ref.listen` de hoje (mensalidade vira paga). Erro → `friendlyErrorMessage(e, action: 'Não foi possível pagar')`.
- [ ] **Step 2: Run to verify fail**: `cd nexago_app && flutter test test/features/schedule_plans/domain/schedule_plan_autopay_test.dart test/features/schedule_plans/presentation/my_schedule_plans_autopay_test.dart test/features/schedule_plans/presentation/schedule_plan_payment_page_test.dart`
- [ ] **Step 3: Implement.** O card fica entre o `ScheduleChargeCard` e o botão de cancelar, só quando
  `scheduleCardAutopayEnabledProvider` está ligado, o atleta está em `memberAthleteIds`, a assinatura não está
  `canceled` e `availability.onlineBilling`/a forma ≠ `onsite`. Depois de ligar, desligar ou pagar, invalidar
  `myScheduleSubscriptionsProvider`.
- [ ] **Step 4: Run to verify pass** (mesmo comando + os testes antigos da pasta `test/features/schedule_plans/`).
- [ ] **Step 5: Commit** `git commit -m "feat(app): débito automático em Meu plano e pagar com cartão salvo"`

### Task 9: Assinar com débito, Cobranças e push

**Files:**
- Modify: `features/schedule_plans/presentation/schedule_plan_signup_page.dart` (`_methodChips` 590, `_submit` 229–319,
  `_bottomBar` 755), `features/athlete_billing/domain/athlete_billing.dart` (`_fromScheduleCharge` 371–399),
  `core/notifications/notification_navigation.dart` (só se o teste mostrar que falta algo)
- Test: `test/features/schedule_plans/presentation/schedule_plan_signup_page_test.dart`,
  `test/features/athlete_billing/athlete_billing_test.dart`,
  `test/core/notifications/notification_navigation_schedule_charge_test.dart`

- [ ] **Step 1: Write the failing tests**
  - assinar: com a flag ligada, `_paysOnline` e o chip `card`, aparece o checkbox `schedule-autopay-optin`
    "Debitar todo mês neste cartão", marcado. "Assinar e pagar" com ele marcado:
    1. sem cartão, abre `paymentCardNew`;
    2. `subscribe`;
    3. `payWithSavedCard(firstChargeId)`;
    4. `setAutopay(subscriptionId, enabled: true, consentText: <texto exato>)`;
    5. vai para Meu plano (sem a tela de pagar).

    Se o passo 3 falhar, cai no fluxo de hoje: `push(schedulePlanPaymentLocation(firstChargeId))` com a mensagem de
    erro num SnackBar. Desmarcado: o fluxo de hoje inteiro.
  - Cobranças: mensalidade `scheduled` → a nota da linha é `"Débito automático em 05/12"`; `failed` → a de hoje.
  - push: `schedule_plan_autopay_upcoming`, `_paid` e `_failed` com `url: '/meus-planos-horario'` resolvem para
    `AppRoutes.mySchedulePlans` (o prefixo `schedule_plan_` já cobre; o teste trava isso).
- [ ] **Step 2: Run to verify fail** (os três arquivos).
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass.** Depois, `cd nexago_app && flutter analyze lib/features/schedule_plans lib/features/athlete_billing lib/features/payment_card`.
- [ ] **Step 5: Commit** `git commit -m "feat(app): assinar com débito automático e selo em Cobranças"`

## Portal da arena (`frontend/projects/arena/src/app/painel/planos-horario/`)

### Task 10: Selos do débito no portal

**Files:**
- Modify: `schedule-plan.model.ts` (`ScheduleCharge` 128–152, `chargeFromRaw` 417, assinatura), `schedule-plan.logic.ts`
  (`onlineChargeBadge` 337–356, `chargeVoidsOnlineLink` 363), `ph-subscriber-detail.component.ts` (template 103–140,
  modais 226–262)
- Test: `schedule-plan.logic.spec.ts`, `schedule-plan.model.spec.ts`

**Interfaces:**
- Produces: `interface ScheduleChargeAutopay {state: string; scheduledFor: string | null; brand: string | null; last4: string | null}`;
  `ScheduleCharge.autopay: ScheduleChargeAutopay | null`; assinatura com `autopayPayers: string[]` (uids com `enabled`).

- [ ] **Step 1: Write the failing specs**
  - `onlineChargeBadge`:
    - `autopay.state` `scheduled`/`retry` com `scheduledFor: '2026-12-05'` → `{label: 'Débito automático · agendado 05/12', tone: 'blue'}`;
    - `charging` → `'Débito automático · debitando'` (`dim`);
    - `failed` com link vivo → `'Débito recusado · link enviado'` (`red`);
    - paga com `autopay.state == 'paid'` → `'Pago no débito automático'` (`green`);
    - as regras de hoje continuam para mensalidade sem `autopay`.
  - `chargeVoidsOnlineLink` (o aviso do "Registrar pagamento") vale também para `scheduled`/`retry`, com o texto
    "O débito automático desta mensalidade será cancelado.".
  - Detalhe do assinante: "Débito automático ligado" ao lado do nome de cada pagador em `autopayPayers`.
- [ ] **Step 2: Run to verify fail**: `cd frontend && npx ng test arena --watch=false --browsers=ChromeHeadless --include='projects/arena/src/app/painel/planos-horario/*.spec.ts'`
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run to verify pass** (mesmo comando) e `npx ng build arena` (o `ng test` não pega budget; ver a memória
  `build-producao-do-portal-nao-tem-rede`).
- [ ] **Step 5: Commit** `git commit -m "feat(arena-web): selos do débito automático nas mensalidades"`

---

### Task 11: Fechamento

- [ ] **Step 1:** Rodar de novo todos os testes tocados (functions, app, portal) e `cd functions && npm run lint`.
- [ ] **Step 2:** Atualizar a spec em "Desvios do backend" com o que mudou na implementação (inclusive `cpfCnpj?` em
  `saveMyPaymentCard`, `autopayAthleteIds`, `externalReference` com `:t{attemptId}`, a prévia
  `getScheduleAutopayPreview`).
- [ ] **Step 3:** PR contra a `main` (atualizar o #1146 se ainda estiver aberto; se já tiver sido mergeado, abrir outro).
  Na descrição, a ordem de deploy da spec. Deixar claro que a chave `appConfig/payments.scheduleCardAutopay` NÃO deve
  ser ligada antes de o Asaas habilitar a tokenização e de um teste com cartão real. Deploy, zip do portal e build
  da loja ficam com o dono.
