# Planos de horário da arena (horário fixo vendido como plano)

Protótipo do dono: `~/Downloads/nexago/NexaGO Arena - Planos de Horário.html`
(`screen-arena-planos-hor-a.jsx`, `screen-arena-planos-hor-b.jsx`, `screen-atleta-planos-hor.jsx`, `ph-atoms.jsx`).
Portal: 01 Planos · 02 Editar plano · 03 Grade da semana · 04 Assinantes · 05 Lista de espera.
App do atleta: A1 Planos da arena · A2 Escolher dias/horário/ciclo/dividir · A3 Meu plano.

A arena vende **horário fixo semanal** com mensalidade. Diferente do "Horário fixo/mensalista" que já existe
(o gestor cadastra uma série solta, sem plano nem cobrança), aqui existe um **catálogo de planos** que o atleta
assina sozinho pelo app, com cobrança mensal, reposição, pausa, rateio e lista de espera.

## Decisões

- **Assinatura = séries de horário fixo.** Cada dia escolhido vira um doc em `arenaRecurringBookings` (mesma
  materialização, travas, slots, lembretes e no-show do horário fixo). A série ganha `scheduleSubscriptionId`
  e `schedulePlanId`. As ocorrências (`rec_{série}_{data}`) saem com `scheduleSubscriptionId`,
  `coveredByPlan: true` e `amountDueOnsiteReais: 0` (o atleta já paga pelo plano; `paymentChannel` segue
  `onsite` e `paymentStatus` segue `none`, para não quebrar builds antigos que leem esses campos).
- **Séries de plano não se mexem pela tela antiga.** `update/pause/resume/cancelArenaRecurringBooking`
  recusam série com `scheduleSubscriptionId` (`failed-precondition`, "Gerencie pela tela Planos de horário").
  Cancelar UMA ocorrência pela agenda continua livre (é a arena cancelando: vira reposição se a regra estiver ligada,
  igual feriado).
- **Mesma quadra toda semana.** Ao assinar, o servidor escolhe a primeira quadra do plano livre em TODOS os dias
  escolhidos naquele horário (livre = sem série ativa/pausada/suspensa nem turma de aula que sobreponha).
  Reserva avulsa futura que esbarra vira `skippedDates` da série, como no horário fixo.
- **Vagas = assinaturas.** `capacity` do plano conta assinaturas (um plano 2x usa 1 vaga). O plano guarda
  `occupiedCount` (incrementado/decrementado nas transações), que o app lê para "Últimas N vagas".
- **Limite do horário nobre.** Regra da arena `primeCapPercent` (padrão 75%) sobre `primeWindows` (padrão Seg–Sex
  18:00–23:00): horas-quadra de séries de plano no nobre ÷ horas-quadra do nobre (quadras ativas × horas da janela).
  Assinar/trocar que passe do limite é recusado (`resource-exhausted`, "O horário nobre já está no limite de planos").
  Séries soltas da tela antiga não contam (não são plano).
- **Plano só para arena Pro/Elite** (`isArenaEntitledPro`), como as Aulas. Criar/publicar plano e assinar exigem.
- **Cobrança manual nesta etapa.** O sistema gera as mensalidades (`arenaScheduleCharges`) e o gestor dá baixa
  (PIX, dinheiro, maquininha, transferência). A forma escolhida pelo atleta (`pix_auto | card | onsite`) fica
  gravada e é mostrada, mas Pix automático/cartão recorrente pelo Asaas é a **próxima etapa** (em cima das mesmas
  mensalidades, como foi nas Aulas — `docs/superpowers/specs/2026-10-19-arena-aulas-cobranca-online-design.md`).
  O editor mostra as formas com a nota "cobrança online chega em breve; por enquanto a baixa é manual".
- **Preço por ciclo.** `monthlyPriceReais` é o mensal; trimestral e anual são desconto % sobre ele, pago mês a
  mês. A assinatura grava o mensal já com desconto (`monthlyPriceReais`) e `commitmentEndsOn` (+3/+12 meses).
  A multa de saída antecipada é só informativa nesta etapa (texto no ciclo).
- **1ª mensalidade proporcional** (ocorrências restantes do mês ÷ ocorrências do mês nos dias escolhidos × mensal);
  se der 0, a 1ª é a do mês seguinte. As seguintes nascem no agendador 10 dias antes do vencimento, id
  `{assinatura}_{AAAA-MM}_{k}` (k = índice do pagador), idempotente. `dueDay` do plano (1–28, ou 0 = dia da
  assinatura, limitado a 28).
- **Rateio** (`rules.split`): o titular adiciona até `maxPlayers − 1` atletas com conta NexaGO; o mensal é dividido
  em centavos (resto no titular) e cada um tem a sua mensalidade. "Se alguém não pagar, o titular cobre" é texto.
  Membros recebem push e veem o plano em "Meu plano". Sem fluxo de aceite nesta etapa.
- **Atraso.** Mensalidade aberta depois do vencimento = "Atrasado N dias" (calculado). Passados
  `billing.overdueReleaseDays` (1/3/7) com alguma mensalidade aberta, o agendador suspende: `status: suspended`,
  ocorrências futuras liberadas (`cancelFutureOccurrences`), push ao titular. Dar baixa que zera as atrasadas
  reativa sozinho (rematerializa). Lembretes do atraso por **push** (WhatsApp não existe na plataforma): no
  vencimento, +1 e +3 dias.
- **Reposição** (`rules.makeup`): "Não vou nesta semana" com antecedência ≥ `noticeHours` (padrão 24h) cancela a
  ocorrência e gera crédito (`arenaScheduleCredits/{bookingId}`), até `perMonth` por mês, validade `validityDays`.
  Aviso em cima da hora cancela sem crédito (o app avisa antes). Usar = escolher data + horário livre numa quadra
  do plano dentro da janela → reserva `mk_{creditId}` (travas em transação, `amountReais: 0`,
  `scheduleSubscriptionId`, `scheduleMakeupCreditId`). Cancelar a reposição não devolve o crédito nesta etapa.
  "Dar reposição" do gestor cria crédito `manual`.
- **Feriado** (`rules.holiday`: `makeup | play`): o gestor marca a data em "Revisar" (alerta de feriado nacional,
  lista fixa de feriados nacionais 2026–2027 no backend). `applyArenaScheduleHoliday` cancela as ocorrências de
  plano na data; em plano `makeup` gera crédito `holiday` (fora do limite mensal). Plano `play` não é afetado.
- **Pausa** (`rules.pause`): até `maxDaysPerYear` por ano civil. Pausar libera a agenda (séries `paused`) e o
  agendador não gera mensalidade de mês inteiro pausado; o mês da volta sai proporcional a partir da volta (mesma
  regra das Aulas). Volta automática em `pausedUntil` (agendador) ou antes, pelo botão.
- **Trocar horário**: novo dia/horário dentro da janela, com quadra livre e limite do nobre. Cancela as séries
  antigas (futuro) e cria as novas na mesma chamada.
- **Encerrar** (gestor): `endsOn` (hoje = já; data futura = "Sai em dd/mm" e o agendador encerra no dia).
  Encerrar libera as séries, cancela mensalidades abertas de meses depois de `endsOn` e, com `waitlistAutoOffer`,
  oferece a vaga ao 1º da fila daquele dia/horário.
- **Lista de espera** (`arenaScheduleWaitlist`): o atleta entra pelo A2 ("Entrar na fila" no horário lotado) ou o
  gestor adiciona. Oferta = `offer {courtId, courtName, offeredAt, expiresAt}` com `waitlistOfferHours`
  (12/24/48, padrão 24), push ao atleta. Aceitar = assinar aquele horário (A2 já preenchido). Expirou → próximo da
  fila (varredura a cada 30 min); sem ninguém, volta para avulso. Automático ou manual ("Oferecer ao 1º").
- **Chuva**: segue a Política de clima existente (ocorrência de plano é "tratar à parte" lá). Aqui é só o texto.
- **Acesso** (RBAC): escrita na área `agenda` (gestor e recepção, como Aulas e horário fixo); assinaturas e
  mensalidades lidas por quem lê `agenda` ou `financeiro`. O atleta age só na própria assinatura (titular; membro
  pode faltar/usar reposição, só o titular troca/pausa).

Fora desta etapa (anotado para o PR): cobrança online (Asaas Pix automático/cartão), WhatsApp, "Enviar sugestão
para os 9", sugestão baseada na ocupação do avulso (usamos a ocupação de fixos), multa de saída, convite com aceite
para o rateio.

## Modelo (escrita 100% via Cloud Functions)

`arenas/{arenaId}/schedulePlans/{planId}`
```
name (≤60), description|null, status: draft|active|archived,
timesPerWeek: 1..3, durationMinutes: 60|90|120,
windows: [{weekday 1..7, startTime 'HH:MM', endTime 'HH:MM'}],   // início escolhido dentro, fim ≤ endTime
courtIds: string[], courtNames: string[],
capacity: 1..500, occupiedCount, waitingCount,
monthlyPriceReais, referenceHourlyReais|null,                    // avulso/h para "−X% vs avulso"
cycles: {monthly: {enabled}, quarterly: {enabled, discountPercent 0..50}, annual: {enabled, discountPercent 0..50}},
billing: {methods: ('pix_auto'|'card'|'onsite')[], dueDay 0..28, overdueReleaseDays 1|3|7},
rules: {
  makeup: {enabled, perMonth 0..8, validityDays 1..90, noticeHours 0..72},
  holiday: 'makeup'|'play',
  pause: {enabled, maxDaysPerYear 0..90},
  split: {enabled, maxPlayers 2..6},
  weather: boolean
},
createdAt, updatedAt, createdByUid
```
Padrões: 1x, 60 min, mensal ligado, trimestral 5%, anual 10%, `dueDay` 5, atraso 3 dias, reposição 2/mês 30 dias
24h, feriado `makeup`, pausa 30 dias/ano, rateio até 4, clima ligado.

`arenas/{arenaId}/scheduleSettings/rules`
```
primeWindows: [{weekday, startTime, endTime}]  (padrão Seg–Sex 18:00–23:00)
primeCapPercent: 0..100 (75)
waitlistAutoOffer: bool (true), waitlistOfferHours: 12|24|48 (24)
appliedHolidays: ['YYYY-MM-DD']
```

`arenaScheduleSubscriptions/{subId}`
```
arenaId, arenaName, planId, planName,
planSnapshot: {timesPerWeek, durationMinutes, rules, overdueReleaseDays, dueDay},
holderAthleteId|null, holderName, holderPhone|null, holderPhotoUrl|null,
memberAthleteIds: string[]        // todos com conta, titular incluso (rules + array-contains)
members: [{athleteId|null, name, photoUrl|null, shareReais, role: 'holder'|'member'}],
slots: [{weekday, startTime, endTime, courtId, courtName, seriesId}],
cycle: monthly|quarterly|annual, monthlyPriceReais, commitmentEndsOn|null,
paymentMethod: pix_auto|card|onsite, billingMode: 'manual', dueDay,
status: active|paused|suspended|canceled, endsOn|null, pausedUntil|null, pausedAt|null,
pauseDaysUsed: {year: 'YYYY', days}, suspendedAt|null,
billedThrough: 'YYYY-MM', makeupBalance, makeupsGranted: {month: 'YYYY-MM', count},
startDate, source: arena|athlete|waitlist, createdByUid, createdAt, updatedAt, canceledAt|null, cancelReason|null
```

`arenaScheduleCharges/{subId}_{AAAA-MM}_{k}`
```
arenaId, subscriptionId, planName, holderName, period 'AAAA-MM', kind: first|monthly|resume,
payerIndex k, payerName, payerAthleteId|null, visibleTo: string[] (pagador + titular),
amountReais, dueDate, status: open|paid|canceled, paidAt|null, paidOn|null,
paymentMethod: pix|cash|card_machine|transfer|null, registeredByUid|null, createdAt
```

`arenaScheduleCredits/{id}` (id = bookingId de origem, ou `man_{auto}`/`hol_{sub}_{data}`)
```
arenaId, subscriptionId, planId, holderName, athleteIds (= memberAthleteIds),
reason: skip|holiday|arena|manual, sourceBookingId|null, sourceDate|null,
status: available|used|expired, expiresOn, usedBookingId|null, usedDate|null, createdAt
```

`arenaScheduleWaitlist/{entryId}`
```
arenaId, planId, planName, weekdays: number[], startTime,
athleteId|null, name, phone|null, photoUrl|null, playersCount 1..6, note|null,
status: waiting|offered|accepted|expired|removed,
offer: {courtId, courtName, offeredAt, expiresAt}|null, createdAt, updatedAt
```

`arenaRecurringBookings/{série}` ganha `scheduleSubscriptionId`, `schedulePlanId`;
`arenaBookings` de plano ganham `scheduleSubscriptionId`, `coveredByPlan: true` (e `scheduleMakeupCreditId` na
reposição).

## Callables (região `CLIENT_FACING_REGIONS`, erros `HttpsError` em português)

Gestor (área `agenda` write):

| Callable | Entrada → saída |
|---|---|
| `upsertArenaSchedulePlan` | `{arenaId, planId?, ...plano}` → `{planId}` (status `draft|active|archived`) |
| `saveArenaScheduleRules` | `{arenaId, primeWindows?, primeCapPercent?, waitlistAutoOffer?, waitlistOfferHours?}` → regras (campo ausente = mantém) |
| `createArenaScheduleSubscription` | `{arenaId, planId, holderAthleteId? \| holderName, holderPhone?, memberAthleteIds?, weekdays, startTime, courtId?, cycle, paymentMethod, startDate?}` → `{subscriptionId, courtName, skippedDates}` |
| `endArenaScheduleSubscription` | `{subscriptionId, endsOn, reason?}` → `{status, endsOn}` |
| `grantArenaScheduleMakeup` | `{subscriptionId, note?}` → `{creditId}` |
| `registerArenaSchedulePayment` | `{chargeId, paymentMethod, paidOn?}` → `{status, reactivated}` |
| `cancelArenaScheduleCharge` | `{chargeId}` → `{status}` |
| `offerArenaScheduleWaitlist` | `{entryId}` → `{courtName, expiresAt}` |
| `applyArenaScheduleHoliday` | `{arenaId, date}` → `{canceled, credits}` |

Gestor **ou** titular (o servidor decide pelo `uid`):

| Callable | Entrada → saída |
|---|---|
| `changeArenaScheduleSubscriptionSlots` | `{subscriptionId, weekdays, startTime}` → `{courtName, skippedDates}` |
| `pauseArenaScheduleSubscription` | `{subscriptionId, until}` → `{pausedUntil, daysLeft}` |
| `resumeArenaScheduleSubscription` | `{subscriptionId}` → `{status}` |
| `addArenaScheduleWaitlist` | `{arenaId, planId, weekdays, startTime, playersCount?, note?, name?, phone?}` (atleta: ele mesmo) → `{entryId, position}` |
| `removeArenaScheduleWaitlist` | `{entryId}` → `{}` |

Atleta (membro da assinatura):

| Callable | Entrada → saída |
|---|---|
| `getArenaSchedulePlanAvailability` | `{arenaId, planId}` → `{plan, primeCapReached, days: [{weekday, times: [{startTime, endTime, freeCourts, waitlistCount, prime}]}]}` |
| `subscribeArenaSchedulePlan` | `{arenaId, planId, weekdays, startTime, cycle, paymentMethod, memberAthleteIds?}` → `{subscriptionId, courtName, firstCharge}` |
| `acceptArenaScheduleWaitlistOffer` | `{entryId, cycle, paymentMethod, memberAthleteIds?}` → `{subscriptionId}` |
| `skipArenaScheduleOccurrence` | `{bookingId}` → `{creditId \| null, reason: 'granted'\|'late_notice'\|'monthly_limit'\|'disabled'}` |
| `getArenaScheduleMakeupOptions` | `{creditId, date}` → `{options: [{courtId, courtName, startTime, endTime}]}` |
| `useArenaScheduleMakeup` | `{creditId, date, courtId, startTime}` → `{bookingId}` |
| `getMyArenaScheduleSubscriptions` | `{}` → `{subscriptions: [{...assinatura, occurrences: [{bookingId, date, startTime, endTime, courtName, status: done\|today\|next\|skipped\|makeup}], credits: [...], charges: [...meu pagador...]}], offers: [...entradas oferecidas a mim]}` (mês corrente + próximo) |

Agendadores:
- `runArenaScheduleSubscriptionsDaily` (04:10 America/Sao_Paulo): gera mensalidades, lembretes de atraso,
  suspende por atraso, volta da pausa, encerra `endsOn`, expira créditos.
- `expireArenaScheduleWaitlistOffers` (a cada 30 min): oferta vencida → `expired` + próximo da fila.

## Rules
- `schedulePlans`: lê qualquer logado se `status == 'active'`; equipe (`agenda`) lê todos. Escrita `false`.
- `scheduleSettings`: equipe `agenda`. Escrita `false`.
- `arenaScheduleSubscriptions`: `uid in memberAthleteIds` ou equipe (`agenda`|`financeiro`).
- `arenaScheduleCharges`: `uid in visibleTo` ou equipe (`agenda`|`financeiro`).
- `arenaScheduleCredits`: `uid in athleteIds` ou equipe `agenda`.
- `arenaScheduleWaitlist`: o próprio `athleteId` ou equipe `agenda`.

## Índices
`arenaScheduleSubscriptions (arenaId, status)`, `(status, …)` para o agendador,
`arenaScheduleCharges (arenaId, status)`, `(subscriptionId, period)`, `(status, dueDate)`,
`arenaScheduleWaitlist (arenaId, status)`, `(planId, status, createdAt)`, `(status, offer.expiresAt)`,
`arenaScheduleCredits (subscriptionId, status)`, `(status, expiresOn)`,
`arenaRecurringBookings (scheduleSubscriptionId)` se precisar.

## Ordem de deploy
índices → functions (novas + `createArenaRecurringBooking`/`update`/`pause`/`resume`/`cancel` e o materializador)
→ rules → portal da arena → app.

## Desvios do backend

Nomes de callables, coleções e campos seguem o contrato. O que o backend acrescentou ou fixou:

- **Callable extra `getArenaScheduleOverview`** `{arenaId}` → `{settings, primeUsagePercent, holidays: [{date, name, applied}]}`
  (gestor, `agenda` write): o "Revisar" do portal lê daqui os feriados nacionais (lista fixa 2026–2027) dos próximos 60
  dias e o uso do nobre.
- **Saídas com campos a mais** (os do contrato estão todos lá): `getArenaSchedulePlanAvailability` devolve também
  `primeUsagePercent` e `seatsLeft` (vagas − ocupadas − ofertas vivas); `plan` vem como `{planId, ...plano}`.
  `subscribeArenaSchedulePlan.firstCharge` = `{chargeId, period, kind: 'first', amountReais (parte do titular),
  totalReais, dueDate}`. `acceptArenaScheduleWaitlistOffer` devolve também `courtName`.
  `getMyArenaScheduleSubscriptions` devolve também `waitlist` (minhas entradas `waiting`); `credits` sem os vencidos,
  `charges` sem as canceladas; Timestamps saem como ISO; cada item tem `subscriptionId`/`creditId`/`chargeId`/`entryId`.
  Ocorrência liberada pelo sistema (troca de horário, pausa, atraso, saída) não aparece; desmarcada/feriado = `skipped`.
- **Campos a mais**: mensalidade `remindersSent: number[]` (idempotência dos lembretes 0/+1/+3) e `cancelReason`;
  assinatura `waitlistEntryId`; entrada da fila `endTime`, `addedByUid`, `subscriptionId` (ao aceitar).
- **Contadores** (`occupiedCount`, `waitingCount`, `makeupBalance`) são lidos e regravados dentro da mesma transação
  (não `FieldValue.increment`): mesmo efeito, e a escrita no doc do plano serializa duas assinaturas simultâneas.
- **1ª mensalidade vence no 1º jogo** (primeira data do dia escolhido a partir do início), não no dia da assinatura —
  senão o atraso de 1 dia suspendia antes do atleta pisar na arena. Sem ocorrência no mês: mês seguinte cheio no `dueDay`.
- **`endsOn` = primeiro dia sem o plano.** Data futura corta as séries na véspera (`endDate`) e cancela as ocorrências
  depois dela; o agendador encerra quando `endsOn <= hoje`. Vaga (`occupiedCount`) só volta no encerramento de fato.
- **Pausa**: `until` é a data de volta; dias = `until − hoje`. Voltar antes devolve os dias não usados. Mensalidade
  aberta de mês inteiro dentro da pausa é cancelada e `billedThrough` recua (a volta gera o proporcional).
- **Suspensa continua faturando** (segura a vaga; a dívida é dela). Pausada não fatura. `cancelArenaScheduleCharge`
  também reativa a suspensa se não sobrar atrasada.
- **Limite mensal da reposição** conta pelo mês do aviso (`makeupsGranted.month` = mês de hoje). Reposição não pode ser
  desmarcada pelo "Não vou" (fala com a arena).
- **Cancelar uma ocorrência pela agenda** (`cancelArenaRecurringOccurrence`) gera crédito `arena` (id = bookingId) se o
  plano tem reposição ligada, fora do limite mensal.
- **Feriado**: crédito só para assinatura `active`; data além do horizonte de materialização entra em `skippedDates`
  da série. Reaplicar a mesma data é idempotente.
- **Oferta da fila segura quadra e vaga** até expirar (conta contra `capacity` e entra na escolha de quadra de
  qualquer outra assinatura). "Oferecer ao 1º" manual do gestor não exige vaga sobrando, só quadra livre.
- **Fila**: `addArenaScheduleWaitlist` com `name` vindo do gestor cria entrada sem conta; sem `name`, quem chama entra
  como ele mesmo (um atleta só tem uma entrada aberta por plano). `weekdays` tem de ter `timesPerWeek` dias, como o A2.
- **Gestor assinando por alguém** pode usar qualquer forma (`pix_auto|card|onsite`); o atleta só as ligadas no plano.
  `courtId` do gestor é estrito (ou ela, ou erro). Um atleta não tem duas assinaturas vivas do mesmo plano.
- **Quadra ativa** (denominador do nobre) = toda quadra da arena, menos `active == false` ou `status`
  `inactive|archived|deleted` (manutenção é temporária e conta).
- **Índice a mais**: `arenaClasses (arenaId, status)` (escolha de quadra lê as turmas ativas da arena).
- **Entrada opcional nova em `createArenaScheduleSubscription`: `waitlistEntryId`.** O gestor converte uma entrada
  da fila (`waiting` ou `offered`, inclusive a só com nome) na assinatura: a entrada vira `accepted` com
  `subscriptionId` e `waitingCount` desce. A oferta automática só vai para entrada com `athleteId` (a só com nome não
  tem quem aceite pelo app; o gestor converte). Oferta viva do próprio atleta (inclusive a manual em plano cheio) já
  segura a vaga: aceitar não passa pela checagem de capacidade.
- **Começo real**: assinar/trocar depois do horário de hoje (horário de SP) começa amanhã — sem reserva no passado e o
  proporcional conta a partir do 1º jogo de verdade. A volta da pausa idem (proporcional a partir de amanhã).
- **Trocar horário com saída marcada**: as séries novas também terminam na véspera do `endsOn`.
- **Volta antecipada da pausa**: mensalidade cancelada pela pausa (`cancelReason: 'paused'`) renasce no mesmo id quando
  o mês volta a ser faturado (agendador ou volta da pausa). Cancelada pelo gestor continua cancelada.
- **Reposição**: data até hoje + 35 dias (horizonte da agenda) e, além das travas, não usa quadra/horário de horário
  fixo de outro assinante (plano ou não), turma ativa ou oferta viva da fila naquele dia; série que pulou a data
  (`skippedDates`) não ocupa.
- **Feriado** só credita jogo que ainda ia acontecer (reserva ativa, ou data além do horizonte não tirada da série) e
  sem crédito já gerado para a mesma ocorrência (id = bookingId).
- **Quadra excluída** (materializador diário): série de plano encerra a assinatura na hora (`cancelReason:
  'court_removed'`, mensalidades futuras abertas canceladas, vaga devolvida, sem oferta à fila), com push ao titular
  e ao gestor.
- **Liberação de agenda à prova de queda**: a transação que tira séries de jogo (pausa, suspensão, encerramento, troca)
  grava `releasePending: true`, `pendingReleaseSeriesIds`, `pendingReleaseReason` na assinatura; liberar limpa a marca
  e o agendador diário refaz quem ficou marcado. A liberação nunca mexe em série `active`. `runArenaScheduleSubscriptionsDaily`
  passa a reportar `released`.
- **`cancelArenaScheduleCharge`** confere e grava na mesma transação (paga não cancela; já cancelada é no-op).
