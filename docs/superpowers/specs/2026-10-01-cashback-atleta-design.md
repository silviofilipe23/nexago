# Cashback do atleta — saldo que volta para ser jogado

**Data:** 01/10/2026
**Decisões do dono:** tomadas nesta sessão (01/10/2026)
**Status:** desenho aprovado em seções; spec aguardando revisão do dono

## Por que

O objetivo é **fidelizar**: fazer o atleta voltar a reservar quadra, a se inscrever
em torneio e a entrar no clubinho pelo nexaGO. O cashback devolve uma fração do que
ele pagou como saldo que só serve dentro do app, liberado depois que o jogo
acontece — o "liberou" chega logo depois da partida e já empurra o próximo pagamento.

Hoje não existe carteira de atleta (`athlete-referral.ts` e a spec
`2026-07-21-mais-5-features-rodada-3-design.md` §4 usaram XP justamente por isso).
Existe uma promessa sem lastro: a comanda fechada mostra "cashback 3%"
(`computeCashbackCents` em `arena_comanda_logic.dart`) e a tela do cliente pede
CPF/WhatsApp "para cashback NexaGO" — nada é creditado.

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| Objetivo | Fidelização / frequência |
| Quem banca | **nexaGO, de dentro da própria taxa**; arena e organizador recebem o mesmo líquido de hoje |
| Regra de ganho | **% fixo do valor pago em dinheiro pela plataforma** (2%), com trava pela taxa |
| Onde usa | **Desconto em qualquer pagamento pelo app** (inscrição, reserva, clubinho); **sem saque** |
| Validade | **6 meses** por crédito, contados da liberação; aviso 15 dias antes |
| Comanda | O "cashback 3%" **sai da tela** na v1 |
| Superfícies | **App Flutter e portal do atleta na mesma entrega** |
| Modelo de saldo | **Carteira com lotes** (um lote por crédito, consumo pelo que vence primeiro) |
| Split de reserva | O defeito de cobrança dupla **entra no escopo, como fase 0** |

## Premissas aprovadas

- **Taxa de 2%**, travada em **no máximo 50% da taxa da nexaGO** naquela transação.
  Organizador com comissão negociada muito baixa gera pouco ou nenhum cashback. Por
  isso a copy é **"Ganhe até 2% de volta"**, sem valor exato antes do pagamento.
- **Só dinheiro que passou pela plataforma conta.** Não geram cashback: pagamento
  direto ao organizador (`directWithOrganizer` / `organizer_direct`), pagamento no
  local, comanda, inscrição gratuita e a parte paga com saldo.
- **O cashback nasce pendente** e só libera depois que o evento acontece, se o
  vínculo continuar de pé. Isso cobre o estorno manual "por fora" sem precisar
  detectá-lo.
- **Sempre sobra um mínimo em dinheiro** (`minCashReais`, padrão R$ 5) ao usar
  saldo: sempre existe cobrança no Asaas e o webhook continua sendo a única porta de
  confirmação. Pagar 100% com saldo exigiria três fluxos novos de confirmação.
  O mínimo exato de cobrança do Asaas precisa ser conferido na documentação dele
  durante a fase 1; o valor fica na config e muda sem deploy.
- **Na dupla, cada atleta ganha sobre o próprio pagamento.** Quem pagou o integral
  ganha sobre o integral; o parceiro que entra sem pagar não ganha.
- **Valores em centavos inteiros** na carteira do atleta (as carteiras de arena e
  torneio usam reais com `roundMoney`; aqui o consumo de vários lotes acumularia erro).

## 1. Ciclo de vida do crédito

```
pago pelo app ──► PENDENTE ──(evento aconteceu)──► DISPONÍVEL ──► consumido (usado no checkout)
                     │                                  └──────► VENCIDO (6 meses após liberar)
                     └──(cancelou/removido/estornado)──► CANCELADO
```

### Ganho

- **Gatilho:** o pagamento confirmado no webhook — PIX no `RECEIVED`, cartão no
  `CONFIRMED` (não espera a liquidação de ~30 dias, porque a liberação já espera o
  evento).
- **Valor:** `earnCents = min(floor(cashCents × ratePercent / 100), floor(feeCents × maxShareOfFee))`.
  `cashCents` é o que o Asaas recebeu (`payment.value`); `feeCents` é a taxa da
  nexaGO calculada sobre o **bruto** (dinheiro + saldo aplicado), pelas mesmas
  funções de hoje. `earnCents == 0` não cria lote.
- Exemplo: reserva de R$ 120 em arena com taxa de 8% → taxa R$ 9,60, teto R$ 4,80,
  2% = R$ 2,40 pendente.
- Com o recurso desligado no momento do webhook, `earnCents = 0` (mas a reserva de
  saldo, se houver, é capturada normalmente).

### Liberação (pendente → disponível)

Varredura diária confere a origem real de cada lote pendente com `eventAt <= agora`:

| Origem | "Aconteceu" | "Vínculo caiu" → CANCELADO |
|---|---|---|
| Reserva (`booking`) | `date` + `startTime` em -03:00 (`eventDateFromDayKeyAndTime`) | `status` em `canceled` / `cancelled` |
| Inscrição (`registration`) | `tournaments.startAt` (fallback `startDate`) | doc da inscrição apagado, ou torneio com `listingStatus: cancelled` |
| Clubinho (`club`) | `arenaClubSessions.startAt` | participante `canceled_refunded` / `canceled_by_arena_refunded`, ou sessão `canceled` |

- Inscrição com `cancellationRequest.status == 'pending'` **espera**: fica pendente e
  é conferida de novo no dia seguinte.
- Evento adiado: a varredura lê o horário **atual** da origem; se ainda não chegou,
  só atualiza o `eventAt` do lote.
- No-show em reserva paga **libera** normalmente — o atleta pagou.
- Ao liberar: `expiresAt = releasedAt + expiryMonths`.

### Uso no checkout

- Toggle "Usar meu cashback" nos três checkouts.
- `redeemableCents = max(0, min(availableCents, priceCents − minCashCents))`.
- O valor usado fica **reservado** (hold) enquanto a cobrança está aberta: pagou →
  vira consumo; expirou/cancelou → volta. Isso impede gastar o mesmo saldo em dois
  checkouts ao mesmo tempo.
- Consome primeiro os lotes que vencem primeiro (FIFO por `expiresAt`).
- A parte paga com saldo **não gera cashback**.
- O recebedor recebe **exatamente o mesmo líquido** que receberia sem saldo; a nexaGO
  absorve a diferença.

### Vencimento

- Cada lote vence 6 meses após liberado.
- Push 15 dias antes, **um por atleta por dia**: "R$ 3,20 do seu cashback vencem em 15 dias".
- Na data, o que sobrou do lote vira VENCIDO e sai do saldo.

### Estorno

- **Antes de liberar:** o lote é cancelado na conferência de liberação (vínculo caiu)
  ou pelo evento de estorno (abaixo).
- **Depois de liberar** (chargeback ou `PAYMENT_REFUNDED`): debita o que ainda resta
  daquele lote. Se o atleta já usou, a nexaGO absorve. **O saldo nunca fica negativo.**
- **Reembolso automático do clubinho:** o saldo usado naquele pagamento **volta para
  os mesmos lotes**, com a validade original (um lote que já venceu nesse meio-tempo
  é vencido de novo na próxima varredura).
- Inscrição e reserva não têm estorno pela plataforma: o organizador ou a arena
  devolve por fora o que combinar, e o saldo usado não volta sozinho.

### Fora da v1

Saque, transferência entre atletas, níveis/multiplicadores (entram depois como um
multiplicador em `computeEarnCents`, sem mudar o modelo), cashback em comanda, uso de
saldo em cota dividida de reserva, tela de backoffice.

### Configuração ao vivo — `appConfig/cashback`

| Campo | Padrão | Efeito |
|---|---|---|
| `enabled` | `false` | Desligado: não gera e não oferece uso; o saldo existente segue visível |
| `ratePercent` | `2` | % sobre o dinheiro pago |
| `maxShareOfFee` | `0.5` | Teto do ganho como fração da taxa da nexaGO |
| `minCashReais` | `5` | Mínimo em dinheiro quando o atleta usa saldo |
| `expiryMonths` | `6` | Validade após liberar |
| `expiryWarningDays` | `15` | Antecedência do aviso de vencimento |

Doc ausente ou campo inválido cai no padrão — e o padrão de `enabled` é desligado.
A leitura cai na regra existente de `appConfig/{docId}`.

## 2. Dados, regras e módulos

### `athleteWallets/{uid}` — escrita só pelo servidor

```
athleteWallets/{uid}
  availableCents, pendingCents, heldCents
  lifetimeEarnedCents, lifetimeRedeemedCents
  nextExpiryAt, nextExpiryCents        ← recalculados em toda transação que mexe em lote
  updatedAt

  /lots/{paymentId}                    ← um por pagamento; id do Asaas = ganho idempotente
     uid, sourceType: registration | booking | club
     sourceId, tournamentId? , arenaId?, sessionId?
     label                             ← "Reserva · Arena Sol · 12/10", pronto para o extrato
     earnedCents, remainingCents
     status: pending | available | consumed | expired | cancelled
     eventAt, releasedAt?, expiresAt?, expiryWarnedAt?, createdAt

  /holds/{holdId}                      ← saldo reservado por uma cobrança
     amountCents, allocations: [{lotId, cents}]
     status: open | captured | released | refunded
     sourceType, sourceId, asaasPaymentId?   ← gravado depois que a cobrança existe
     createdAt, capturedAt?, releasedAt?

  /ledger/{autoId}                     ← extrato imutável
     type: earn | release | cancel | redeem | expire | reverse | refund
     amountCents, lotId?, holdId?, label, createdAt
```

- A **reserva já abate** o `remainingCents` dos lotes escolhidos; a devolução soma de
  volta nos mesmos lotes; a captura só muda o status. Assim o vencimento nunca vence
  dinheiro preso num checkout aberto.
- O extrato registra só o que o atleta entende (`earn`, `release`, `cancel`,
  `redeem` na captura, `expire`, `reverse`, `refund`). Reserva aberta aparece nos
  totais como "reservado", não como linha.

### Rules

- `athleteWallets/{uid}` e subcoleções: `read` se `request.auth.uid == uid` ou
  `isAdmin()`; `create, update, delete: if false` — mesmo padrão de `arenaWallets` e
  `tournamentWallets`.
- Testes de rules: dono lê; outro atleta é negado; toda escrita do cliente é negada.

### Índices novos (`firestore.indexes.json`)

- collectionGroup `holds`: `status` + `createdAt` (varredura de reservas).
- collectionGroup `lots`: `status` + `eventAt` (liberação).
- collectionGroup `lots`: `status` + `expiresAt` (vencimento e aviso).
- `asaas_processed_payments`: `cashback.status` + `processedAt` (retentativa).

### Cloud Functions — `functions/src/`

| Módulo | Responsabilidade |
|---|---|
| `cashback-config.ts` | Lê `appConfig/cashback` com padrões seguros |
| `cashback-rules.ts` | **Puro:** `computeEarnCents`, `computeRedeemableCents`, `allocateFifo`, `releaseDecision`, `computeExpiresAt` |
| `athlete-wallet.ts` | Transações: `holdCashback`, `attachHoldPayment`, `captureHold`, `releaseHold`, `refundCapturedHold`, `earnPendingLot`, `releaseLot`, `cancelLot`, `reverseLot`, `expireLots` — cada uma mexe em carteira + lotes + extrato juntos |
| `cashback-intent.ts` | `buildCashbackIntent` (puro) e `applyCashbackIntent` (captura + ganho), usada pelo webhook e pela retentativa |
| `cashback-hold-sweeper.ts` | `onSchedule` a cada 5 min: reservas abertas e intenções pendentes |
| `cashback-daily-sweeper.ts` | `onSchedule` diário 10h (`EVENT_TIME_ZONE`): liberar/cancelar, vencer, avisar |
| `cashback-reversal.ts` | `reverseCashbackForPayment` — chamado pelo roteador no estorno |

Scheduled functions herdam `southamerica-east1`; as que mandam push declaram os
segredos de web push (padrão de `tournament-registration-hold-sweeper.ts`). Push por
`deliverNotificationToUser` (`notification-delivery.ts`).

## 3. Encaixe nas cobranças e nos webhooks

### O problema central

Os três webhooks usam `payment.value` como base de tudo — taxa, repasse,
`amountPaidOnlineReais` da reserva, `paidAmount` de equipe, `amountReais` do
participante do clubinho. Nenhum confere o valor contra um esperado. Se a cobrança
sair R$ 10 menor, o recebedor perde R$ 10 e a reserva vira "parcial" com R$ 10 "a
pagar no local".

### A regra

O registro de cada cobrança guarda `cashbackAppliedCents`, e todo webhook usa
**`bruto = payment.value + cashbackAppliedCents / 100`** como base para taxa,
repasse e status.

- `amountPaidOnlineReais` da reserva passa a **incluir** o saldo (para a arena, é
  dinheiro recebido online). Tudo que lê o campo segue certo sem mudar.
- Campo à parte `cashbackAppliedReais` nos registros e nas linhas de extrato das
  carteiras de arena e torneio, só para auditoria. Arena e organizador não ganham
  tela nova.

### Criação da cobrança

As callables aceitam `useCashback?: boolean`; cliente antigo não manda e segue igual.

| Fluxo | Onde | Registro da cobrança |
|---|---|---|
| Inscrição PIX e cartão | `prepareRegistrationCharge` (alimenta `createTournamentRegistrationPixPayment` e `createTournamentRegistrationCardPayment`) | `inscriptions/{id}/pixPending/{uid}` |
| Reserva | `createArenaBookingPixPayment` | `arenaBookings/{id}` |
| Clubinho | `joinArenaClubSession` | `arenaClubSessions/{sid}/clubParticipants/{uid}` |

Sequência:

1. Calcula o preço como hoje (inscrição: parcela, integral ou cota de equipe;
   reserva: `amountToPayNowReais`, já com o cupom da arena; clubinho: `priceReais`).
2. Se `useCashback` e recurso ligado: `holdCashback` numa transação → `holdId` +
   `appliedCents` (pode ser 0, e aí não cria reserva).
3. Cria a cobrança no Asaas por `preço − aplicado`.
4. `attachHoldPayment(holdId, asaasPaymentId)` e grava no registro:
   `cashbackAppliedCents`, `cashbackHoldId`.
5. Falha no Asaas → `releaseHold` na hora e propaga o erro de hoje.

Quando a callable cancela e recria a cobrança (o fluxo de "gerar novo PIX" que já
existe), ela libera a reserva antiga antes de criar a nova.

**Cota dividida de reserva:** ganha cashback (no webhook da cota, sobre o
`payment.value` dela), mas **não aceita saldo** na v1 — as cotas dos outros atletas
são criadas pelo dono da reserva, sem que o pagador escolha.

### Webhook (pagamento confirmado)

- No **mesmo batch** que hoje marca `asaas_processed_payments/{paymentId}` entra o
  campo `cashback`:
  ```
  cashback: { uid, sourceType, sourceId, label, eventAt,
              cashCents, appliedCents, feeCents, earnCents, holdId?,
              status: 'pending' | 'done', attempts, lastError? }
  ```
- Logo em seguida, `applyCashbackIntent`: captura a reserva (se houver) e cria o lote
  pendente (`lots/{paymentId}`, idempotente). Sucesso → `cashback.status = 'done'`.
- **Falha de cashback nunca derruba o webhook.** O roteador `asaasWebhook` já sempre
  responde 200 e só loga; a intenção fica `pending` e a varredura de 5 minutos tenta
  de novo. Isso também cobre a ordem do webhook de reserva, que hoje grava o
  "processado" antes do crédito, sem retentativa.
- **Cartão (inscrição):** a intenção é gravada e aplicada na fase `confirm`
  (`CONFIRMED`, ou `RECEIVED` se o `CONFIRMED` se perdeu). O crédito do organizador
  continua no `RECEIVED`, sobre o bruto. A taxa do gateway (`value − netValue`)
  segue repassada como hoje.
- **Taxa para a trava:** calculada no momento com `resolveOrganizerTournamentFeePercent`,
  `resolveArenaBookingFeePercent` e `CLUB_FEE_PERCENT` (sem piso no clubinho), sempre
  sobre o bruto.
- **Ajustes pontuais:**
  - Inscrição: `paidAmount` de categoria de equipe e o aviso de "parcela diferente
    do esperado" passam a usar o bruto.
  - Reserva: `paidOnline`, `dueOnsite` e `isPartial` passam a usar o bruto.
  - Clubinho: o `amountReais` do participante, `platformFeeReais` e `netReais`
    passam a usar o bruto.
- **Pagamento tardio sobre reserva de saldo já devolvida** (PIX pago depois de
  expirar): `applyCashbackIntent` tenta debitar de novo do disponível (FIFO); se o
  atleta já gastou, a nexaGO absorve e registra `logger.error`.

### Varredura de 5 minutos — `cashback-hold-sweeper.ts`

Uma porta só para todas as formas de uma cobrança morrer (varreduras de expiração de
inscrição, reserva e clubinho; `cancelPendingTournamentRegistrationPix`;
`releaseRegistration`; `organizerRemoveFromCategory`; status negativo do Asaas;
saída do clubinho; cancelamento de sessão). Ligar código em cada porta é o que deixou
passar a porta do organizador no caso do PIX duplicado.

**A. Reservas abertas** (`holds` com `status == open` e `createdAt` há mais de 2 min):

| Registro da cobrança | Ação |
|---|---|
| Não existe, ou `asaasPaymentId` diferente do da reserva (cobrança substituída) | `releaseHold` |
| Cancelado / expirado / rejeitado | `releaseHold` |
| Pago com o mesmo `asaasPaymentId` | `captureHold` (webhook perdido) |
| Ainda aguardando pagamento | nada |
| Reserva sem `asaasPaymentId` há mais de 15 min (callable caiu no meio) | `releaseHold` |

**B. Intenções pendentes** (`asaas_processed_payments` com `cashback.status == 'pending'`
há mais de 2 min): `applyCashbackIntent` de novo. Depois de 10 tentativas,
`logger.error` com o `paymentId` e para de tentar.

### Varredura diária — `cashback-daily-sweeper.ts` (10h, horário do evento)

1. **Liberar/cancelar** lotes pendentes com `eventAt <= agora`, pela tabela da seção 1.
   Push agrupado por atleta: "R$ 2,40 de cashback liberado — use na próxima reserva".
2. **Vencer** lotes disponíveis com `expiresAt <= agora` e `remainingCents > 0`.
3. **Avisar** lotes disponíveis com `expiresAt` nos próximos `expiryWarningDays` e
   sem `expiryWarnedAt`: um push por atleta, marca `expiryWarnedAt`.

Push com `url: '/cashback'` (app) e `webUrl: '/cashback'` (portal), seguindo a regra
de `url` do app e `webUrl` do portal.

### Estorno — `cashback-reversal.ts`

O roteador `asaasWebhook` já recebe `PAYMENT_REFUNDED`. Para esse evento, **além** do
handler de hoje, chama `reverseCashbackForPayment(paymentId)`:

- Lê `asaas_processed_payments/{paymentId}.cashback` (sem intenção → nada a fazer).
- Lote do pagamento: pendente → `cancelLot`; disponível → `reverseLot` (debita o que
  resta, nunca negativo).
- Reserva capturada daquele pagamento → `refundCapturedHold` (devolve aos lotes
  originais, extrato `refund`).
- Idempotente: marca `cashback.reversedAt`.

Isso cobre o reembolso automático do clubinho (`leaveArenaClubSession`,
`cancelClubSessionCore`) e qualquer estorno feito à mão no painel do Asaas, sem
ligar código nesses fluxos. Chargeback (`PAYMENT_CHARGEBACK_REQUESTED`) fica fora
da v1: exigiria habilitar o evento no painel do Asaas.

### Fase 0 — correção do split de reserva (independente do cashback)

**Defeito confirmado** (só no portal web; o app não tem divisão de pagamento):

1. O atleta gera o PIX da reserva: `pending_payment` com cobrança viva no Asaas pelo
   valor inteiro.
2. Antes de pagar, escolhe "Dividir com amigos". `submitSplit`
   (`reservar/arena-payment.component.ts`) reaproveita a mesma reserva por
   `findResumablePixBooking`, e `splitArenaBookingPaymentCore`
   (`arena-booking-split.ts`) cria as cotas e passa a reserva para `confirmed` +
   `split_pending` **sem cancelar nem limpar o `asaasPaymentId` original**.
3. `expirePendingArenaBookingPayments` só procura `status == pending_payment`, então
   nunca mais toca nessa cobrança.
4. Se o QR antigo for pago, `processArenaBookingAsaasNotification` marca `paid`,
   sobrescreve o `split_pending` e credita o valor cheio na arena; as cotas pagas
   creditam de novo. **Cobrança e crédito em dobro.**

Defeito menor no mesmo fluxo: quando a divisão cria a reserva do zero, `submitSplit`
não repassa o `couponCode`, e o cupom se perde.

**Correção:**

- `splitArenaBookingPaymentCore`, antes de criar qualquer cota, se a reserva tem
  `asaasPaymentId`:
  - consulta `getAsaasPayment`: pago/confirmado → recusa com "O PIX desta reserva já
    foi pago" (`failed-precondition`), nenhuma cota criada;
  - aberto → `deleteAsaasPaymentOrThrow` (a variante que propaga a falha; a
    `deleteAsaasPaymentIfOpen` engole o erro). Falha → divisão recusada, nada gravado.
- Consulta e cancelamento entram **injetados**, como o `createCharge` já é, para
  testar sem Asaas. A callable já declara os segredos do Asaas
  (`splitPaymentSecrets`).
- Na escrita final da reserva: remove `asaasPaymentId` e `pixCopyPaste`, grava
  `supersededAsaasPaymentIds` (arrayUnion) e — quando o cashback existir — libera a
  reserva de saldo daquela cobrança.
- `processArenaBookingAsaasNotification`, defesa em profundidade para a corrida (pago
  entre a consulta e o cancelamento): se `hasSplitShares` e `paymentId` diferente do
  `asaasPaymentId` atual → não marca `paid`, não credita, grava
  `outcome: "stale_charge_after_split"`, `refundRequired: true`, `paidValue`, e
  `logger.error` — mesmo tratamento do `duplicate_payer` da inscrição.
- Portal: `submitSplit` repassa `couponCode`; depois da divisão, a tela descarta o QR
  antigo e o contador.

**Testes** (`FakeFirestore`, com consulta e cancelamento injetados): cobrança aberta é
cancelada e sai da reserva; cobrança paga recusa a divisão sem cotas; falha no
cancelamento recusa sem gravar nada; webhook de cobrança substituída não credita e
marca `refundRequired`; cupom preservado na divisão (spec do portal).

## 4. Telas, implantação e testes

### Telas do atleta (app e portal iguais)

1. **Pílula na home** (app, no `AthleteHomeHero`, ao lado do XP) e **card no painel**
   (portal, `athlete-painel.component`): "R$ 12,40 de cashback" → Meu cashback. Só
   aparece com o recurso ligado e `available + pending > 0`.
2. **Tela "Meu cashback"** — app: tile próprio em `athlete_settings_page.dart` (o tile
   "Pagamentos" continua sendo o de métodos salvos); portal: rota `/cashback` no shell.
   - **Disponível** em destaque; **Pendente** ("libera depois do jogo");
     **Próximo vencimento** ("R$ 3,20 vencem em 12/03").
   - Bloco "Como funciona", 5 linhas: até 2% de volta; libera depois do evento; vale
     6 meses; usa em reserva, inscrição e clubinho; sem saque.
   - Extrato por mês, ícone por tipo (ganhou, liberou, usou, venceu, cancelado,
     estornado, devolvido).
3. **Toggle nos checkouts** — app: `arena_booking_confirm_page.dart`,
   `tournament_registration_payment_step.dart`, `club_session_detail_page.dart` (o toggle
   fica antes de abrir `club_session_pix_page.dart`, que chama `joinArenaClubSession` ao
   abrir e já gera a cobrança); portal:
   `reservar/arena-payment.component`, `tournaments/registration/tournament-payment.component`,
   `clubinho/club-session-payment.component`.
   - "Usar meu cashback · R$ X disponível"; ligado, o resumo ganha "Cashback −R$ X" e
     o total cai.
   - Trava do mínimo: "Usando R$ 18,00 (o mínimo de R$ 5 vai no PIX)".
   - Sem saldo usável: o toggle some; aparece só "Ganhe até 2% de volta neste pagamento".
   - O cliente calcula a prévia (`redeemablePreview`, espelho de
     `computeRedeemableCents`); o servidor recalcula e devolve o valor aplicado, e a
     tela mostra o que voltou.
   - Cota dividida de reserva: sem toggle.
4. **Tela de sucesso do pagamento:** "+R$ 2,40 de cashback pendente" quando o lote
   `lots/{asaasPaymentId}` já existe; senão, copy genérica com link para Meu cashback.

**Comanda:** sai o "cashback 3%" de `arena_comanda_closed_page.dart`, sai a menção a
cashback em `arena_comanda_customer_page.dart`, e `computeCashbackCents` é apagada.

**Exclusão de conta:** o saldo é perdido; `athleteWallets/{uid}` (com subcoleções)
entra na limpeza de `account-deletion.ts`.

### Estrutura de código

- **App:** `nexago_app/lib/features/cashback/`
  - `domain/`: `CashbackWallet`, `CashbackLot`, `CashbackLedgerEntry`, `redeemablePreview()`.
  - `infrastructure/`: repositório que observa `athleteWallets/{uid}` e o extrato.
  - `application/`: providers `autoDispose`.
  - `presentation/`: `CashbackPage`, `CashbackBalancePill`, `CheckoutCashbackToggle`.
- **Portal:** `frontend/projects/athlete/src/app/`
  - `data/cashback.service.ts` (listener) e `data/cashback-preview.ts` (puro).
  - `cashback/` (página), card do painel, `checkout-cashback-toggle` reaproveitado
    nos três checkouts.

### Fases

| Fase | Conteúdo | Sai como |
|---|---|---|
| **0** | Correção do split de reserva | PR próprio, imediatamente |
| **1** | Backend: rules, índices, config, regras puras, `athlete-wallet`, intenção, ganchos nos 3 webhooks e nas 3 callables, as 2 varreduras, estorno, limpeza na exclusão, script de relatório | PR, recurso **desligado** |
| **2** | Portal do atleta: página, card, toggles, sucesso | PR |
| **3** | App Flutter: feature `cashback/`, pílula, tela, toggles, sucesso, remoção da comanda | PR + build de loja |

### Ordem de deploy

rules → índices → functions → portal → build de loja aprovada → **liga
`appConfig/cashback.enabled` no DEV** → QA → PROD (mesma ordem).

- Ligar só depois do app aprovado evita o atleta ganhar saldo que não consegue ver.
- **Retrocompatibilidade:** app antigo não manda `useCashback` e paga igual; com o
  recurso ligado, ele ganha sem ver e vê quando atualizar. Não precisa subir o
  `minBuildNumber`.
- O app da loja aponta para o DEV: o deploy das functions da fase 1 no DEV precisa
  ser neutro com o recurso desligado — o único efeito visível é o bruto nos webhooks,
  que com `cashbackAppliedCents` ausente é igual a `payment.value`.

### Testes

- **Regras puras (TDD):** trava de 50% da taxa, arredondamento para baixo, ganho 0
  sem lote; mínimo em dinheiro (inclusive preço abaixo do mínimo → 0); FIFO
  atravessando vários lotes e empate de vencimento; `releaseDecision` linha a linha
  para as três origens, pedido de cancelamento pendente e adiamento; `computeExpiresAt`.
- **Carteira (`FakeFirestore`):** duas reservas concorrentes não gastam o mesmo
  saldo; ganho idempotente pelo id do pagamento; captura idempotente; devolução aos
  lotes originais; estorno depois de usar não deixa saldo negativo;
  `nextExpiryAt/Cents` recalculados.
- **Fiação nos webhooks** (pelos `process*Notification` reais, não só pelas funções
  puras): repasse sobre o bruto nos três fluxos; `amountPaidOnlineReais` e
  `isPartial` da reserva; `paidAmount` de equipe; intenção gravada no mesmo batch da
  confirmação; falha no `applyCashbackIntent` não impede a confirmação nem o crédito;
  cartão aplica a intenção no `CONFIRMED` e credita no `RECEIVED`.
- **Varreduras:** cada linha da tabela de reservas abertas; retentativa e limite de
  tentativas; liberação, cancelamento, vencimento e aviso (sem aviso duplicado).
- **Estorno:** lote pendente cancelado, lote disponível debitado, reserva capturada
  devolvida, segunda entrega do evento sem efeito.
- **Rules:** dono lê, outro atleta negado, escrita do cliente negada.
- **Flutter e Angular:** toggle, tela e pílula, com cada guarda testada nas duas
  direções (aparece quando deve **e** some quando deve); mais o **build de produção**
  do portal (`ng build athlete --configuration production`), porque `ng test` verde já
  conviveu com build quebrado.
- **QA ponta a ponta no DEV:** ciclo completo com pagamento real de valor baixo:
  ganhar, liberar (forçando `eventAt`), usar, expirar a cobrança e ver o saldo voltar,
  reembolso do clubinho.

### Métricas

Script `functions/scripts/cashback-report.js --project <id> [--from --to]`:

- Passivo atual: disponível + pendente + reservado.
- No período: ganho, usado, vencido, cancelado, estornado.
- Custo (ganho e usado) contra receita de taxa no período (extratos de
  `arenaWallets` e `tournamentWallets`).
- Atletas com 2+ pagamentos pela plataforma em 60 dias, antes e depois de ligar.

## Riscos

- **Custo do PIX em ticket pequeno.** Clubinho de R$ 20 com 5%: taxa R$ 1,00,
  cashback R$ 0,40, e o custo do PIX no Asaas pode comer o resto. O `maxShareOfFee`
  ajusta ao vivo, sem deploy.
- **Farm de cashback.** Fechado por construção: o ganho é sempre menor que a taxa,
  então quem paga a si mesmo (organizador inscrito no próprio torneio) sempre perde
  dinheiro.
- **Regulamento.** O texto de "Como funciona" é o regulamento da promoção (validade,
  sem saque). **O dono revisa a copy final antes de ligar.**
- **Saldo absorvido em pagamento tardio e estorno após uso.** Raro e limitado ao
  valor do lote; sempre logado.

## Achados fora do escopo

- `confirmationDeadline` da reserva é montado com `new Date(y, m, d, h, mm)` em
  `arena-booking-create.ts` — hora local do servidor. Se a função roda em UTC, o
  prazo fica 3 horas deslocado. Não verificado em execução; vale investigação própria.
