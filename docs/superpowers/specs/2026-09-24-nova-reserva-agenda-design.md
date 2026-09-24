# Nova reserva na agenda de quadras — o balcão passa a criar reserva

**Data:** 24/09/2026
**Decisões do dono:** tomadas nesta sessão (24/09/2026)
**Status:** desenho aprovado, implementação não iniciada

## Por que

Hoje o gestor não consegue criar uma reserva em lugar nenhum. O botão **Nova
reserva** existe na agenda (`panel-agenda.component.ts:98`) desabilitado com
"Em breve", e o doc-comment da classe até justifica a ausência: "o Flutter
também não tem criação de reserva pelo gestor — reserva é sempre iniciada pelo
atleta na busca".

Na prática a arena vende no balcão. Cliente liga, chega na quadra, paga em
dinheiro. Sem esse caminho, o horário vendido não aparece na agenda, a grade
mente sobre a ocupação, e o único jeito de "segurar" o horário é **bloquear**,
que some da busca mas não registra cliente, valor nem histórico.

A peça que falta é pequena porque o precedente já existe: `materializeSeriesOccurrences`
(`arena-recurring-booking.ts:264`) já cria, numa transação, `arenaBookings` +
`arenaSlots` + `arenaSlotLocks` com `athleteId` **opcional**, `customerName`
livre e `createdByRole: "arena_manager"`. Uma reserva avulsa de balcão é
literalmente materializar uma ocorrência sem série.

## Decisões tomadas

| Pergunta | Decisão |
|---|---|
| Pra quem o gestor reserva | Atleta da base **ou** nome livre (walk-in sem conta) |
| De onde vem o valor | Sugerido pelo motor de preço, **editável** pelo gestor |
| Regra de pico (mínima de 2h) | **Não bloqueia** o gestor |
| Clique num horário livre da grade | Folha de escolha: **Reservar** ou **Bloquear** |
| Onde mora a escrita | Callable nova (Admin SDK), não escrita direta do client |
| Pagamento | Sempre `onsite`, sem PIX e sem "marcar como pago" |

## Arquitetura

### Backend — `functions/src/arena-manual-booking.ts` (arquivo novo)

Duas callables, região `CLIENT_FACING_REGIONS`, registradas no `index.ts`.

**`quoteArenaManualBooking({ arenaId, courtId, date, startTime, endTime })`**
→ `{ amountReais, lineItems }`

- `assertArenaAreaAccess(db, arenaId, uid, 'agenda', 'write')`.
- `calculateBookingTotal` (`arena-pricing.ts`) com preço da quadra + promoções
  ativas.
- **Não** aplica cupom — cupom é do atleta, com resgate contado por conta.
- **Não** chama `ensurePeakRuleSatisfied` — regra de pico não bloqueia o gestor.
- Preço 0 (quadra sem preço configurado) devolve 0 **sem erro**: o gestor digita.

**`createArenaManualBooking({ arenaId, courtId, date, startTime, endTime, athleteId?, customerName?, amountReais, note? })`**
→ `{ bookingId }`

- Mesma checagem de acesso; resolve `courtName` e `arenaName`.
- Transação: lê o lock de cada hora coberta (`calendarHoursSpanning`); qualquer
  lock existente → `already-exists` com "Esse horário já está reservado.".
- Antes da transação, `hasBlockedSlotOverlap` (reusado do horário fixo): slot
  `blocked` sobrepondo → `failed-precondition` com "Esse horário está
  bloqueado; desbloqueie antes de reservar.". Sem isso, reserva e bloqueio
  coexistiriam no mesmo horário.
- Grava os três docs na mesma forma do horário fixo, com:
  `source: "manual"`, `createdByRole: "arena_manager"`, `createdBy: uid`,
  `paymentChannel: "onsite"`, `paymentStatus: "none"`,
  `amountDueOnsiteReais = amountReais`, `amountToPayNowReais: 0`,
  `attendanceStatus: "pending"`, `isRecurring: false`. A observação opcional do
  gestor vai em `managerNote` (campo novo, só gravado quando não-vazio) — não
  reusa `cancelReason` nem `blockNote`, que têm outro dono.
- Com `athleteId` preenchido, dispara push pro atleta ("Reserva confirmada")
  via `deliverNotificationToUser`, envolvido em try/catch — notificação que
  falha **não** derruba a reserva já criada (mesmo padrão do
  `notifyLinkedAthleteSafe`).

**`validateManualBookingInput` (exportado, puro, testável):** exige `athleteId`
**ou** `customerName` não-vazio; `amountReais` finito e `>= 0`; intervalo com
fim > início; `date` não anterior a **hoje** (`dayKeyFromEventDate`); normaliza
`HH:MM`.

Sobre a data, dois casos que se parecem e não são: **dia passado é recusado** —
registro retroativo não é o problema que esta entrega resolve, e criaria locks e
presença para horário que já passou. Mas **hora passada no dia de hoje é
aceita**: o cliente que chega 19h05 e paga o horário das 19h é o caso comum do
balcão, e recusar isso quebraria o uso principal.

Nada muda em `firestore.rules` nem em `firestore.indexes.json`: a escrita é via
Admin SDK, e as queries de `hasBlockedSlotOverlap` já existem para o horário fixo.

### Front — portal da arena

- **`painel/bookings/manual-booking-repository.ts`** — embrulha as duas
  callables e mapeia erro, no molde do `recurring-bookings-repository.ts`.
- **`painel/bookings/manual-booking-form.ts`** — lógica pura: validação,
  montagem do payload e a decisão de quando re-cotar (mudou quadra/data/horário
  **e** o gestor ainda não digitou valor).
- **`painel/bookings/manual-booking-modal.component.ts`** — `ar-manual-booking-modal`,
  inputs `arenaId`, `courts`, `dateKey`, `courtId?`, `startTime?`, `endTime?`,
  output `created`. Componente próprio porque `panel-agenda.component.ts` já
  está em ~750 linhas, e porque a tela de Reservas pode querer o mesmo botão.
- **`panel-agenda.component.ts`** — ganha só a folha de escolha e a abertura do
  modal.

### Fluxo na tela

Dois pontos de entrada:

1. **Botão do header** — sai o `disabled`/"Em breve". Abre o modal com a data
   selecionada e quadra/horário em branco. Sem escrita em `agenda`
   (`readOnly()`), segue desabilitado com title "Seu cargo não permite criar
   reservas".
2. **Clique num horário livre da grade** — abre uma folha curta (um `ar-modal`
   dentro do próprio panel-agenda) com cabeçalho `18:00–19:00 · Quadra 1` e duas
   ações: **Reservar horário** e **Bloquear horário**. A segunda cai no modal de
   bloqueio que já existe, sem alteração nenhuma nele.

Horário **bloqueado** continua abrindo "Desbloquear" direto; **reservado**
continua indo pro detalhe. Só o clique em *livre* muda de comportamento.

A folha de escolha só aparece com escrita em `agenda`: `onBlockClick` já corta
`readOnly()` antes de tratar horário livre, e esse corte continua sendo a fonte
de verdade.

### Formulário

Na linguagem visual do horário fixo (`field-label` + `input-box`):

Quadra (select) · Data (`type="date"`) · Início e Fim (`type="time"`) ·
Cliente · Valor (R$) · Observação (opcional).

**Cliente** junta os dois caminhos: o `ar-athlete-search-field` que já existe
busca entre os atletas que já reservaram na arena (escolher um preenche o nome e
guarda o `athleteId`), e abaixo um campo "Nome do cliente" livre pro walk-in sem
conta. Limpar o atleta devolve o controle ao nome livre. Um dos dois é
obrigatório.

**Valor** é preenchido pela cotação quando quadra + data + início + fim estão
válidos, mostrando "Calculando…" enquanto isso. A primeira digitação do gestor
levanta a flag `amountTouched` e a cotação para de sobrescrever. Zero é válido
(cortesia).

Erro da callable aparece no mesmo banner vermelho que o modal de bloqueio já usa.
Sucesso fecha o modal — a grade se atualiza sozinha via `onSnapshot`, e o bloco
vira "Reservado". Não há toast no painel da arena hoje, e esta entrega não cria um.

## Testes

- **Functions:** `arena-manual-booking.test.ts` (`node --test`, como os vizinhos)
  sobre `validateManualBookingInput` — exige atleta ou nome, recusa valor
  negativo/NaN, recusa fim ≤ início, recusa data passada, aceita valor 0,
  normaliza `HH:MM`.
- **Front:** spec em Karma sobre `manual-booking-form.ts` — validação, payload e
  a regra de re-cotação.
- **Navegador (obrigatório):** teste de função pura não pega fiação. Subir o dev
  server do portal, abrir a agenda, clicar num horário livre, passar pela folha
  de escolha, criar a reserva e confirmar o bloco virando "Reservado" sozinho;
  mais o caminho do botão do header e o erro de conflito.

## Riscos

1. **Deploy.** A tela passa a depender de duas callables novas, e callable não
   deployada devolve NOT FOUND cru pro usuário. Ordem obrigatória: **functions
   primeiro, portal depois**.
2. **Corrida com o atleta** reservando o mesmo horário: resolvida pelos locks na
   transação — o gestor recebe "Esse horário já está reservado".
3. **Retrocompatibilidade:** nenhum campo existente muda de significado.
   `source: "manual"` é valor novo num campo que já existe, e o app Flutter já
   tem o fallback — `arena_booking_labels.dart:206` manda tudo que não é
   `'platform'` pro ramo "DIRETO · Reserva sem link de pagamento online", que é
   exatamente o rótulo certo pro balcão. Reserva sem `athleteId` já acontece hoje
   pelo horário fixo, e os consumidores já convivem com ela.

## Fora de escopo

PIX para reserva de balcão · marcar reserva como paga · criar série recorrente
pelo mesmo botão (a tela de horários fixos já faz) · editar reserva criada.

## Dívida anotada, não resolvida aqui

O horário fixo grava `source: "platform"` (`arena-recurring-booking.ts:327`), o
que faz uma ocorrência criada pelo gestor aparecer como "APP" no app do atleta —
rótulo enganoso. É um defeito pré-existente e independente desta entrega.
