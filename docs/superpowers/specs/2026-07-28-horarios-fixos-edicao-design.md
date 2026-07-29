# Horários fixos — editar, pausar, valor mensal, calendário de datas e busca de mensalista

Data: 2026-07-28

## Contexto

A tela "Horários fixos" do portal da arena (`/painel/horarios-fixos`,
`frontend/projects/arena/src/app/painel/recurring/panel-recurring.component.ts`) permite hoje
apenas **criar** e **encerrar** (cancelar, terminal) uma série de mensalista. Não existe edição,
pausa, forma de pagamento, nem UI para as datas de início/término — mesmo o backend já aceitando
`startDate`/`endDate` na criação (`functions/src/arena-recurring-booking.ts:462-473`), o formulário
nunca os envia. O nome do mensalista é sempre texto livre (`customerName`); vínculo por
`athleteId` já é suportado ponta a ponta, mas não há busca de atleta em lugar nenhum do portal.

O app Flutter tem uma tela equivalente para o gestor
(`nexago_app/lib/features/arena/presentation/arena_recurring_list_page.dart` +
`recurring_booking_service.dart`), com as mesmas limitações (só criar/encerrar).

Este documento cobre as 6 capacidades pedidas: editar série, exibir valor diário e mensal,
calendário de data início/fim, busca de atleta com opção de avulso, pausar/retomar, e forma de
pagamento (mensal vs. por ocorrência).

## Decisões já validadas com o dono

- **Edição completa**: dia, horário, quadra, datas, valor, mensalista e pagamento são todos
  editáveis. Mudar dia/horário/quadra/valor/datas cancela as ocorrências futuras já materializadas
  sob a config antiga e rematerializa sob a config nova (mesmo mecanismo do cancelamento).
- **Valor mensal é sempre calculado** (`valor por ocorrência × ~4,33`), nunca um campo à parte —
  evita dois valores que podem divergir.
- **Pausar libera a agenda**: as ocorrências futuras são canceladas (como um "encerrar"
  reversível); a série fica pausada até o gestor retomar manualmente (sem data de retomada
  automática).
- **Busca de atleta** usa a base de clientes já vinculados à arena (seguidores), não uma busca
  global no app.

## Não-escopo

- Cobrança automática mensal — `paymentType` é só um rótulo informativo nesta fase. O pagamento
  onsite manual (`paymentChannel: "onsite"`) continua igual, sem mudança na materialização de
  ocorrências.
- Série com mais de um dia da semana (ex.: seg+qua na mesma série) — continua uma série por dia.
- Busca global de atletas fora da base de clientes da arena.
- Mudanças em `firestore.rules` — a coleção já é 100% escrita via Admin SDK
  (`allow create, update, delete: if false`, `firestore.rules:1133`); nenhuma das novas operações
  muda isso.
- Novo índice do Firestore — a query `where('arenaId','==',id).where('status','in',[...])`
  reaproveita o índice composto `arenaId+status` que já existe (`firestore.indexes.json:660-672`).
- UI de editar/pausar/retomar no app Flutter — fica só no portal web nesta rodada (ver §5 pro
  ajuste mínimo de consistência que o Flutter precisa mesmo assim).

## 1. Modelo de dados

Três espelhos (sem pacote compartilhado, já é assim hoje):
`frontend/projects/arena/src/app/painel/recurring/arena-recurring-booking.model.ts`,
`functions/src/arena-recurring-booking.ts`, `nexago_app/lib/features/arena/domain/arena_recurring_booking.dart`.

Mudanças, iguais nos três:

- `status`: `'active' | 'canceled'` → **`'active' | 'paused' | 'canceled'`**.
- **`paymentType: 'per_occurrence' | 'monthly'`** (novo). Docs antigos sem o campo são lidos como
  `'per_occurrence'` (retrocompatibilidade — mesmo padrão de fallback já usado pros outros campos
  opcionais).
- **`pausedAt: Date | null`** (novo) — só para exibir "Pausado desde DD/MM" na lista.
- **Sem campo de valor mensal** — é sempre derivado, nunca persistido (ver §3.2).

No client Angular (`arena-recurring-booking.model.ts:20,74`), `ArenaRecurringStatus` ganha
`'paused'` e `arenaRecurringBookingFromDoc` (linha 74) troca o parse binário
(`=== 'canceled' ? 'canceled' : 'active'`) por uma função `parseStatus` que reconhece as 3
opções e cai em `'active'` só quando o valor não é nenhuma das três — hoje qualquer coisa
diferente de `'canceled'` vira `'active'`, o que interpretaria uma série pausada como ativa.

No Flutter (`arena_recurring_booking.dart:19,50,63`), `status` continua `String` livre (já é
tolerante); adiciona `paymentType`, `pausedAt` com os mesmos defaults, e um getter `isPaused`
ao lado do `isActive` (linha 63) existente.

Em `functions/src/arena-recurring-booking.ts`, `RecurringSeriesData` (linhas 28-44, usada só
pela materialização) **não muda** — `paymentType`/`pausedAt`/`pauseReason` são bookkeeping do
doc da série, escritos diretamente nos callables, no mesmo padrão que `canceledAt`/`cancelReason`
já usam hoje (linhas 606-614) e não entram na materialização de ocorrências.

## 2. Backend — Cloud Functions (`functions/src/arena-recurring-booking.ts`)

Extrai a validação hoje só dentro de `createArenaRecurringBookingHandler` (linhas 509-541) para
um helper `validateRecurringInput(input, todayKey)` reaproveitado por create e pela nova update —
evita duplicar as ~10 checagens (dia da semana, `HH:mm`, fim>início, valor>0, datas, nome-ou-atleta).

### `updateArenaRecurringBooking` (nova, onCall)

Payload: mesmo shape do create (`courtId, weekday, startTime, endTime, athleteId?, customerName?,
amountReais, startDate, endDate?, paymentType`) + `seriesId`.

1. `requireArenaManager` (linha 413) na arena da série.
2. Busca a série; se não existir ou `status === 'canceled'`, `failed-precondition` ("série
   encerrada não pode ser editada").
3. `validateRecurringInput` (mesmas regras do create) + confirma quadra e, se `athleteId`,
   confirma que o usuário existe (linhas 546-559) — **sem** reverificar a cota do Essencial
   (isso só vale pra criação de série nova).
4. Se `status === 'active'`: `cancelFutureOccurrences(db, seriesId, "recurring_series_updated")`
   (linha 355) sob a config antiga, depois `materializeSeriesOccurrences` (linha 239) com a
   config nova, de `hoje-1` até o horizonte de 35 dias — igual ao fluxo de criação
   (linhas 616-622). `skippedDates` é resetado (`[]`) antes de mesclar os novos pulos, porque os
   antigos referem-se a datas da config anterior.
5. Se `status === 'paused'`: só atualiza os campos da série — a rematerialização acontece no
   `resumeArenaRecurringBooking`.
6. Retorna `{ seriesId, canceledDates, createdDates, skippedDates }`.

### `pauseArenaRecurringBooking` (nova, onCall)

`{ seriesId, reason? }`. Exige `status === 'active'` (senão `failed-precondition`). Chama
`cancelFutureOccurrences(db, seriesId, "recurring_series_paused")` — mesmo mecanismo do
cancelamento, mas o doc da série vira `status: 'paused'`, `pausedAt: serverTimestamp()`,
`pauseReason` em vez de `canceled`/`canceledAt`/`cancelReason`. Notifica o atleta vinculado (se
houver). Retorna `{ seriesId, releasedDates }`.

### `resumeArenaRecurringBooking` (nova, onCall)

`{ seriesId }`. Exige `status === 'paused'`. Seta `status: 'active'`, `pausedAt: null`, e chama
`materializeSeriesOccurrences` com a config **atual** da série (que pode ter sido editada
enquanto pausada) de `hoje-1` até o horizonte. Notifica o atleta vinculado (se houver), mesmo
padrão de `notifyLinkedAthleteSafe` já usado nas outras três callables. Retorna
`{ seriesId, createdDates, skippedDates }`.

### Alterações no `cancelArenaRecurringBooking` (linha 659)

Pré-condição da linha 680 relaxa de `status !== 'active'` pra
`!['active', 'paused'].includes(status)` — dá pra encerrar direto de uma série pausada.
`cancelFutureOccurrences` já é idempotente (só mexe em ocorrências `active`/`confirmed`, linha
376), então chamá-la de novo numa série já pausada não tem efeito colateral.

### Cota do Essencial (linhas 561-576)

A contagem de séries do gate passa de `.where("status", "==", "active")` pra
`.where("status", "in", ["active", "paused"])` — senão dá pra "furar" o limite de 3 pausando uma
série sem liberar de fato o slot do plano.

### Materializador diário (`functions/src/arena-recurring-materializer.ts:70`)

Nenhuma mudança — já filtra `where("status", "==", "active")`, então séries pausadas já ficam de
fora do horizonte rolante automaticamente.

### `functions/src/index.ts`

`updateArenaRecurringBooking`, `pauseArenaRecurringBooking`, `resumeArenaRecurringBooking` entram
no mesmo bloco de import (linhas 75-79) e export (linhas 190-194) das outras funções de
horário fixo.

## 3. Frontend — Angular arena (portal web)

### 3.1 Repositório (`recurring-bookings-repository.ts`)

- `watchActiveSeries` (linha 11) vira **`watchVisibleSeries`**: query troca
  `where('status', '==', 'active')` por `where('status', 'in', ['active', 'paused'])` — a lista
  passa a mostrar as duas, escondendo só as encerradas.
- `CreateRecurringSeriesInput` (linha 24) ganha `paymentType: 'per_occurrence' | 'monthly'`.
- Novas funções espelhando o padrão de `createRecurringSeries`/`cancelRecurringSeries` (linhas
  48-65): `updateRecurringSeries(functions, seriesId, input)`, `pauseRecurringSeries(functions,
  seriesId, reason?)`, `resumeRecurringSeries(functions, seriesId)`.

### 3.2 Modelo (`arena-recurring-booking.model.ts`)

- `ArenaRecurringStatus` ganha `'paused'`; `ArenaRecurringBooking` ganha `paymentType` e
  `pausedAt: Date | null`.
- `parseStatus`/`parsePaymentType` com fallback (`'active'`/`'per_occurrence'`) — ver §1.
- Novo helper `estimateMonthlyReais(amountReais: number): number` →
  `amountReais * (52 / 12)` (~4,33 ocorrências/mês, média pra recorrência semanal de 1 dia).
  Usado tanto na lista quanto no modal (preview em tempo real).

### 3.3 Lista (`panel-recurring.component.ts:56-77`)

- Coluna **Valor** (linha 69) passa a mostrar duas linhas: a que corresponde ao `paymentType` da
  série em destaque (mono, 14px, como hoje) e a outra menor/atenuada logo abaixo (ex.: pagamento
  mensal → "R$ 800/mês" em destaque + "R$ 200/ocorrência" em `--nx-text-dim` embaixo; pagamento
  por ocorrência → o inverso).
- Nova coluna **Pagamento**: chip (`.ar-chip`, não-interativo) "Mensal" ou "Por ocorrência".
- Cabeçalho da tabela (linhas 56-62) e `grid-template-columns` (linha 206) ganham a coluna nova.
- Status visual: bolinha reaproveitando o padrão de `status-dot.component.ts` — verde
  (`--nx-win`) pra `active`, âmbar (`--nx-pending`) pra `paused` com texto "Pausado desde DD/MM"
  ao lado (de `pausedAt`).
- Ações (linha 70-72): em vez do único link "Encerrar", três ícones com `aria-label`
  (`ar-icon`, já importado) — lápis "Editar" (abre o modal em modo edição, §3.4), pausa/play
  contextual ao `status` ("Pausar" quando `active`, "Retomar" quando `paused`), e "Encerrar"
  (mantém o link de texto vermelho que já existe). Pausar e Encerrar continuam pedindo
  confirmação (mesmo modal de hoje, linhas 144-161, com o texto ajustado pro caso de pausa);
  Retomar dispara direto (botão fica desabilitado/`ar-icon` de loading durante a chamada) — sem
  modal de confirmação, já que não derruba nada da agenda por conta própria. Não há componente de
  toast em nenhum lugar do portal hoje, então o feedback é a própria linha da tabela atualizando
  em tempo real (o `onSnapshot` de `watchVisibleSeries` já reflete a mudança de status assim que
  o callable termina) — mesmo padrão que já vale pra criar/encerrar hoje.

### 3.4 Modal criar/editar (unificado)

O modal de criação (linhas 81-142) vira compartilhado entre criar e editar — título e texto do
botão mudam conforme o modo (`'Novo horário fixo'`/`'Criar horário fixo'` vs. `'Editar horário
fixo'`/`'Salvar alterações'`), e no modo edição os signals são pré-preenchidos com os valores da
série (`openEdit(series)` espelha `openCreate()`, linha 445, mas parte dos valores existentes em
vez dos defaults).

Novos campos, na ordem em que entram no formulário (depois de Quadra/Dia/Início-Fim, que não
mudam):

- **Data de início / Data de término** — botão que abre o novo `ar-date-range-picker` (§3.5) no
  lugar de dois `<input type="date">` soltos. Checkbox "Sem data de término" (série em aberto,
  comportamento padrão de hoje) desmarca e desabilita o segundo calendário.
- **Mensalista** — toggle de dois estados (`.ar-chip`, mesmo padrão do seletor de dia da semana)
  "Atleta cadastrado" / "Avulso". Em "Avulso", mantém o `<input>` de texto livre que já existe
  (linhas 116-123, ligado a `customerName`). Em "Atleta cadastrado", troca pelo novo
  `ar-athlete-search-field` (§3.6), que seta `athleteId` e limpa `customerName` (e vice-versa).
- **Valor por ocorrência (R$)** — mesmo campo (linhas 125-133), com uma linha de texto abaixo
  mostrando `≈ {{ formatBRL(estimateMonthlyReais(parsedAmount())) }}/mês` em tempo real
  (`--nx-text-dim`, 11.5px) conforme o gestor digita.
- **Forma de pagamento** — toggle "Mensal" / "Por ocorrência" (`.ar-chip`, mesmo componente visual
  do dia da semana), liga a `paymentType`.

`canCreate()` (linha 409) vira `canSubmit()`, reaproveitado nos dois modos, com a validação de
mensalista ajustada: nome preenchido (modo avulso) **ou** `athleteId` setado (modo atleta) — hoje
só aceita `customerName`.

### 3.5 Calendário de datas — novo `ar-date-range-picker`

Não existe nenhum componente de calendário no projeto hoje (o padrão em outras telas —
`panel-promotion-form.component.ts:103,107`, `panel-coupon-form.component.ts:71,75`,
`panel-occupancy-report.component.ts:78,82` — é sempre dois `<input type="date">` nativos lado a
lado). Como o pedido é explicitamente por um calendário visual, cria-se um componente novo em
`frontend/projects/arena/src/app/painel/ui/date-range-picker.component.ts`, reutilizável fora
desta tela também:

- Botão-gatilho mostrando `"DD/MM/AAAA – DD/MM/AAAA"` (ou `"DD/MM/AAAA – sem término"`), estilo
  `.input-box`.
- Popover com grade de um mês (7 colunas), navegação mês a mês (setas `‹ ›` + label
  "Mês/Ano"), primeiro clique define a data de início e destaca, segundo clique define o fim e
  preenche o intervalo com `--nx-orange-tint`; dias antes do início ficam desabilitados até o
  reset. Rodapé "Cancelar"/"Aplicar".
- Navegação por teclado (setas movem o foco, Enter seleciona, Escape fecha o popover) e
  `aria-label` em cada dia — segue os requisitos de acessibilidade do resto do portal.
- Inputs: `[startDate]`, `[endDate]`, `[allowOpenEnd]` (mostra o checkbox "sem término"); Outputs:
  `(rangeChange)`.

### 3.6 Busca de atleta / avulso — novo `ar-athlete-search-field`

`frontend/projects/arena/src/app/painel/recurring/athlete-search-field.component.ts`
(feature-local — não é genérico o bastante pra `painel/ui/`).

Fonte de dados: `arenas/{arenaId}/followers` (já existe,
`frontend/projects/arena/src/app/painel/followers/followers-repository.ts`, até 300, sem query
nova) + `resolveAthleteLabel` (`bookings-repository.ts:177`, já tem cache em memória via
`athleteLabelCache`, lê de `public_profiles`). `followers-repository.ts` ganha uma variante
one-shot `fetchFollowersOnce(db, arenaId)` (hoje só existe `watchFollowers`, que é
`onSnapshot`/streaming — o campo de busca só precisa de uma foto do momento em que abre).

Fluxo: ao focar o campo, busca os seguidores uma vez, resolve os nomes em paralelo
(`Promise.all`, já cacheado por `resolveAthleteLabel` depois da primeira vez) e filtra
client-side por substring normalizada (sem acento, case-insensitive) conforme o gestor digita
(mínimo 2 caracteres, debounce ~200ms). Lista de resultados em dropdown (mesmo `.table-row`/hover
visual do resto do portal); selecionar emite `{ athleteId, name }`. Sem paginação/busca
server-side nesta versão — se a base de seguidores da arena crescer muito, isso pode evoluir
depois, não faz sentido resolver agora.

## 4. Flutter (app mobile) — ajuste mínimo de consistência

Sem UI de editar/pausar/retomar no app nesta rodada (fica só web, como pedido). Mas sem ajuste
nenhum, uma série pausada pelo portal web **desaparece silenciosamente** da lista do gestor no
app, porque `watchActiveSeries`
(`nexago_app/lib/features/arena/data/recurring_booking_service.dart:34-49`) filtra
`where('status', isEqualTo: 'active')`. Ajuste mínimo, só de leitura:

- `watchActiveSeries` → filtro vira `whereIn(['active', 'paused'])` (mesma mudança do lado web).
- `ArenaRecurringBooking` (dart) ganha `paymentType`/`pausedAt` (ver §1) e `isPaused`.
- `_SeriesCard` (em `arena_recurring_list_page.dart`) ganha um badge "Pausado" (reaproveitando o
  padrão visual de badge que já existe na tela) quando `isPaused` — sem botão de ação novo.

## Erros e casos de borda

- Editar uma série `canceled`: bloqueado no backend (`failed-precondition`) — o botão de editar
  nem aparece pra séries encerradas na lista, já que só `active`/`paused` são exibidas.
- Editar dia/horário/quadra/valor de uma série `active` que já teve ocorrências de hoje
  materializadas: `cancelFutureOccurrences` preserva o que já começou/passou (linha 380), só
  ocorrências futuras são recriadas — histórico não é afetado, mesma garantia do cancelamento
  atual.
- Pausar uma série que já está pausada, ou retomar uma que já está ativa: `failed-precondition`
  com mensagem clara — a UI não deveria permitir (botão contextual ao status), mas o backend
  valida de qualquer forma.
- Trocar de "Atleta cadastrado" pra "Avulso" (ou vice-versa) no modal: limpa o campo do modo
  anterior antes de validar, pra nunca mandar `athleteId` e `customerName` juntos com valor
  divergente do que está visível.
- Doc de série antigo sem `paymentType`: lido como `'per_occurrence'` nos 3 lados — nenhuma série
  existente muda de comportamento visual até ser editada.
- Arena Essencial no limite de 3 (`active`+`paused`) tentando editar uma série já existente: edição
  não é bloqueada pelo gate (só criação é), então não há regressão aqui.

## Ordem de deploy

Segue o padrão já usado nesta feature (ver memória do projeto): **1)** nenhum índice novo
necessário (§Não-escopo) → **2)** `functions` (3 callables novas + ajuste no
`cancelArenaRecurringBooking` e no gate de cota) → **3)** `firestore.rules`: nenhuma mudança →
**4)** app (Angular arena + o ajuste mínimo do Flutter).

## Testes

- **Cloud Functions** (`functions/src`): `validateRecurringInput` extraído (casos de borda de
  dia/horário/datas/nome-ou-atleta reaproveitados de create), `updateArenaRecurringBooking`
  (edição com/sem mudança de dia-horário-quadra, série `paused` vs. `active`, série `canceled`
  rejeitada), `pauseArenaRecurringBooking`/`resumeArenaRecurringBooking` (transições válidas e
  inválidas), gate do Essencial contando `active+paused`, `cancelArenaRecurringBooking` a partir
  de `paused`.
- **Angular** (`frontend/projects/arena`): parse de `status`/`paymentType` com doc antigo (sem os
  campos) e novo; `estimateMonthlyReais`; `ar-date-range-picker` (seleção de intervalo, teclado,
  checkbox sem término); `ar-athlete-search-field` (filtro por substring, debounce, seleção limpa
  o avulso).
- **Flutter**: `flutter-test-engineer` cobre o parse novo de `ArenaRecurringBooking.fromFirestore`
  (paymentType/pausedAt/isPaused) e o filtro `whereIn` de `watchActiveSeries`.
- **QA manual em navegador** (obrigatório antes de fechar): criar série com data de término
  definida pelo calendário, vincular mensalista via busca de atleta e via avulso, editar
  dia/horário de uma série ativa e conferir que a agenda reflete a mudança, pausar e retomar,
  encerrar uma série pausada, conferir os dois valores (diário/mensal) e o chip de pagamento na
  lista.
- **QA manual no app** (mínimo): abrir a lista de horários fixos do gestor depois de pausar uma
  série pelo web e confirmar que ela aparece com o badge "Pausado" em vez de sumir.
