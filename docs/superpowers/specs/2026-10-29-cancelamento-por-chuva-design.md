# Cancelamento por chuva (Modo chuva + créditos de clima)

Design: `~/Downloads/nexago/NexaGO Arena - Cancelamento por Chuva.html` (4 telas do portal da arena
+ 6 do app do atleta). Choveu: o atleta **remarca sem custo** ou **guarda o valor como crédito**
naquela arena. O dinheiro não sai do caixa — nenhuma movimentação em `arenaWallets`.

## Decisões

| Regra | Decisão |
|---|---|
| Quem não escolhe em 24h | Recebe o crédito automaticamente (varredura de hora em hora). |
| Chuva no meio do jogo | Crédito proporcional ao tempo que faltava; sem opção de remarcar. Política pode desligar (`midGame: 'none'`). |
| Reserva não paga (na arena, sem Pix) | Só cancelada, sem crédito, atleta avisado. |
| Pix em andamento (`pending_payment`), divisão em andamento, aula, clubinho, horário fixo, reserva manual | Listados como "tratar à parte", **não processados**: cada módulo já tem o próprio cancelamento/reposição. |
| Crédito expirado | Vira receita da arena: nada a mover (o dinheiro já está na carteira dela); o crédito fica `expired`. |
| Reembolso no Pix | Fora desta versão (opção aparece desligada, "em breve"). |
| Crédito | Sempre ativo: é o destino de quem não escolhe. A política só liga/desliga **remarcar**. |
| Remarcação mais cara | Diferença paga **na arena** (`amountDueOnsiteReais`). Mais barata: a sobra vira crédito. |
| Pedido do atleta (modo "atleta solicita") | O pedido é só "liberar por chuva" + observação. Aprovado, o atleta escolhe como no Modo chuva. Não segura horário durante a análise. |
| Automático pela previsão (Beta) | O atleta pede; o servidor aprova sozinho se a previsão/medição da hora passar de 70% e 2 mm/h (Open-Meteo). Senão, cai na fila da arena. |
| Quadras cobertas | O cadastro não tem esse campo: a política lista as quadras que entram (padrão: todas) e a arena desmarca as cobertas. |
| Aviso | Push + inbox do app (sem WhatsApp). |
| Equipe da reserva | Recebe o aviso de cancelamento que já existe; os convites não migram para a reserva remarcada (v1). |
| Previsão | Open-Meteo (sem chave), pelas coordenadas da arena (`latitude`/`longitude` ou `location`). |

## Dados

### `arenas/{arenaId}.weatherPolicy` (gravado só pela callable)

```ts
{
  enabled: boolean;                                     // padrão false
  allowReschedule: boolean;                             // padrão true
  rescheduleDays: 15 | 30 | 60;                         // padrão 30 (a partir da data original)
  creditValidityDays: 60 | 90 | 180 | null;             // padrão 90; null = sem validade
  trigger: 'arena' | 'request' | 'auto';                // padrão 'arena'
  requestDeadline: 'before_2h' | 'start' | 'after_30m'; // padrão 'start'
  midGame: 'proportional' | 'none';                     // padrão 'proportional'
  courtIds: string[] | null;                            // null = todas as quadras
  updatedAt: Timestamp; updatedBy: string;
}
```

### `arenaBookings/{id}` — campos novos (só o servidor grava)

- `weatherRelease`:
  `{ source: 'rain_mode'|'request'|'auto', eventId: string|null, releasedAt: Timestamp,
     decisionDeadline: Timestamp, creditableReais: number, fraction: number,
     canReschedule: boolean, rescheduleUntil: 'YYYY-MM-DD',
     status: 'pending_choice'|'credited'|'rescheduled'|'kept'|'canceled_unpaid',
     resolvedAt?: Timestamp, autoCredited?: boolean, creditId?: string,
     rescheduledToBookingId?: string, forecast?: {time:'HH:00', probability:number|null, precipitationMm:number|null}[],
     arenaMessage?: string }`
- Cancelada por chuva: `status:'canceled'`, `attendanceStatus:'canceled'`, `cancelReason:'weather'`,
  `canceledByRole:'weather'`, `canceledAt`.
- Pagou com crédito: `weatherCreditReais`, `weatherCreditUses: [{creditId, amountReais}]`,
  `weatherCreditRestoredAt?` (devolvido ao cancelar antes do jogo). Coberta 100%:
  `paymentChannel:'weather_credit'`, `paymentStatus:'paid'`, `status:'active'`.
- Remarcada: `rescheduledFromBookingId` na nova; `amountReais` = preço do horário novo.
- `paid` de uma reserva = `amountPaidOnlineReais + weatherCreditReais` (pagamento na arena não é registrado).
- `arenaBookingPricing/{id}` ganha `weatherCreditReais`; Pix, divisão e webhook cobram `amountReais − weatherCreditReais`,
  sempre integral (sem sinal de 50%), e o crédito deixa no mínimo R$ 5 para o Pix (abaixo disso o Asaas recusa).

### `arenaWeatherCredits/{creditId}` (id `wx_{originBookingId}`, idempotente)

```ts
{ arenaId, arenaName, athleteId, athleteName,
  originBookingId, originCourtName, originDate: 'YYYY-MM-DD', originStartTime: 'HH:mm',
  amountReais, balanceReais, status: 'open'|'used'|'expired',
  source: 'choice'|'auto'|'mid_game'|'reschedule',
  expiresAt: Timestamp|null, createdAt, updatedAt,
  uses: [{bookingId, amountReais, at: Timestamp, kind: 'booking'|'reschedule'}],
  expiredReais?: number, expiredAt?: Timestamp, reminderSentAt?: Timestamp }
```

### `arenaWeatherEvents/{eventId}` — cada ativação do Modo chuva

```ts
{ arenaId, date, startTime, endTime, courtIds, blockNewBookings, message,
  status: 'active'|'ended', createdBy, createdAt, endedAt?,
  counts: {release, partial, cancel, manual}, bookingIds: string[], forecast: Hour[] | null }
```

### `arenaWeatherRequests/{bookingId}` — pedido do atleta

```ts
{ arenaId, bookingId, athleteId, athleteName, courtId, courtName, date, startTime, endTime,
  paidReais, note: string|null, status: 'pending'|'approved'|'rejected'|'withdrawn',
  weather: {probability:number|null, precipitationMm:number|null, fetchedAt: Timestamp}|null,
  autoApproved: boolean, createdAt, decidedAt?, decidedBy?, rejectReason? }
```

### Rules (leitura; escrita só Admin SDK)

- `arenaWeatherEvents`: `arenaCanRead(arenaId, 'agenda')`.
- `arenaWeatherCredits`: dono (`athleteId == uid`) ou `arenaCanRead(arenaId, 'financeiro'|'agenda')`.
- `arenaWeatherRequests`: dono ou `arenaCanRead(arenaId, 'agenda')`.

## Callables (`southamerica-east1`)

| Callable | Quem | Entrada → saída |
|---|---|---|
| `saveArenaWeatherPolicy` | agenda (escrita) | `{arenaId, policy}` → `{policy}` normalizada |
| `getArenaWeatherForecast` | agenda (leitura) | `{arenaId, date}` → `{forecast: {hours: Hour[], fetchedAt} \| null}` |
| `previewArenaRainMode` | agenda (leitura) | `{arenaId, date, startTime, endTime, courtIds}` → `{bookings: Affected[], totals}` |
| `activateArenaRainMode` | agenda (escrita) | `{arenaId, date, startTime, endTime, courtIds, blockNewBookings, message?}` → `{eventId, released, partial, canceled, manual, notified}` |
| `endArenaRainMode` | agenda (escrita) | `{arenaId, eventId}` → `{unblocked}` (tira o bloqueio de novas reservas) |
| `chooseArenaWeatherOption` | dono da reserva | `{bookingId, choice:'credit'\|'keep'\|'reschedule', reschedule?: {courtId, courtName?, date, startTime, endTime, selectedSlotStartTimes?}}` |
| `requestArenaWeatherRelease` | dono da reserva | `{bookingId, note?}` → `{status:'pending'\|'approved', weather}` |
| `withdrawArenaWeatherRequest` | dono da reserva | `{bookingId}` → `{status:'withdrawn'}` |
| `decideArenaWeatherRequest` | agenda (escrita) | `{arenaId, bookingId, approve, reason?}` → `{status}` |
| `quoteArenaBooking` / `createArenaBooking` | atleta | + `useWeatherCredit?: boolean` |

`Hour = {time:'HH:00', probability: number|null, precipitationMm: number|null}`.

`Affected = {bookingId, athleteId|null, athleteName|null, courtId, courtName, startTime, endTime,
paidReais, paymentLabel, treatment: 'release'|'partial'|'cancel'|'manual',
manualReason?: 'class'|'club'|'recurring'|'manual'|'pending_payment'|'split'|'already_released',
creditableReais, fraction}`; `totals = {release, partial, cancel, manual, creditableReais}`.

Classificação de uma reserva ativa (`active`/`confirmed`) na quadra/data do período:
- começa dentro do período → `release` (crédito integral do pago, pode remarcar) ou `cancel` se pago = 0;
- começou antes e termina depois do início do período → chuva no meio do jogo: `partial`
  (crédito = pago × (fim − início do período) / duração), ou fora se `midGame:'none'`; pago = 0 → fora;
- aula/clubinho/horário fixo/manual/Pix pendente/divisão/já liberada → `manual`.

`chooseArenaWeatherOption` devolve:
- `credit` → `{creditId, creditReais, expiresAt: ISO|null}`
- `keep` → `{kept: true}`
- `reschedule` → `{newBookingId, newAmountReais, coveredByCreditReais, dueOnsiteReais, leftoverCreditReais, creditId}`

`quoteArenaBooking` passa a devolver `weatherCreditAvailableReais`, `weatherCreditNextExpiresAt`
(ISO|null) e, com `useWeatherCredit`, `weatherCreditAppliedReais` e `amountAfterCreditReais`.
`createArenaBooking` devolve `weatherCreditAppliedReais`; crédito cobrindo tudo →
`paymentMode:'weather_credit'`, `amountToPayNowReais:0`, reserva já `active`/`paid`.

Prazo do pedido (relativo ao início): `before_2h`, `start`, `after_30m`. A janela abre 24h antes.
Pedido depois do início = chuva no meio do jogo (crédito proporcional ao que faltava).

## Agendamentos e gatilhos

- `sweepArenaWeatherCredits` (de hora em hora): libera crédito de quem não escolheu em 24h, expira
  créditos vencidos e avisa 7 dias antes de vencer.
- No gatilho de cancelamento de reserva que já existe: reserva paga com crédito e cancelada antes
  do jogo (ou ainda no Pix) devolve o crédito às origens. Cancelamento por chuva não devolve
  (o crédito novo já inclui essa parte). O alerta de "vaga liberada" não dispara para cancelamento por chuva.

## Avisos (push + inbox)

`url` é rota que existe nos apps da loja (`/my-bookings`); o app novo reconhece o `type` + `bookingId`
e abre a escolha. Tipos: `arena_weather_release`, `arena_weather_canceled`, `arena_weather_credit`,
`arena_weather_request_decided`, `arena_weather_credit_expiring`.

## Telas

Portal da arena: `/painel/agenda/chuva` (Modo chuva), `/painel/agenda/chuva/politica`,
`/painel/agenda/chuva/solicitacoes`, `/painel/financeiro/creditos-clima`.

App do atleta: aviso na reserva → `/booking/:bookingId/rain` (escolha, novo horário, crédito
guardado); pedido em análise na própria reserva; "Usar crédito de chuva" na confirmação da
reserva; lista de créditos em `/weather-credits`.

## Ordem de deploy

índices → functions → rules → portal → app. Function velha + cliente novo: o campo
`useWeatherCredit` é ignorado e as callables novas dão NOT_FOUND (a tela some de vista enquanto a
política não estiver ligada).
