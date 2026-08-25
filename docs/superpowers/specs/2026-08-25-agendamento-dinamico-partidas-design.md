# Agendamento dinâmico de partidas — Design

## Contexto

O gestor agenda todas as partidas de um dia de torneio de uma vez, via
`autoScheduleTournamentDay` (`functions/src/organizer-match-ops.ts:1033-1229`) ou
manualmente por `scheduleMatch`/`rescheduleMatch` (linha 391-453). Esse cálculo é
**estático**: aloca cada partida numa quadra a partir de `matchOps.defaultMatchDurationMin`
(padrão 30min) e `minRestBetweenMatchesMin` (padrão 30min), grava `scheduleTime`/
`scheduleEndTime` uma única vez e nunca mais toca nesses campos.

Quando a realidade diverge do previsto — um W.O. encerra a partida em segundos, uma
partida termina 20 minutos antes do previsto, ou uma partida começa atrasada — nada
recalcula os horários das partidas seguintes na mesma quadra. O trigger que já reage à
conclusão de uma partida, `onTournamentMatchCompletedAdvance`
(`functions/src/organizer-match-ops.ts:1336-1380`), só avança a chave, atualiza ranking
de liga e recalcula o contador `liveMatchesNow` — não mexe em `scheduleTime`. O
atleta fica sem saber quando de fato vai jogar.

A infraestrutura de exibição em tempo real e fila já existe: `queueStatus`/`queueOrder`
no doc da partida, listeners Firestore (`TournamentMatchesRepository.watchByTournament`)
e a lógica de "próxima partida" do Modo Focus
(`nexago_app/lib/features/.../athlete_tournament_day_logic.dart`). A infra de push
também já existe e é usada em dezenas de fluxos via `deliverNotificationToUser`
(`functions/src/notification-delivery.ts:323`), incluindo um caso quase idêntico ao que
precisamos — a chamada de partida para quadra (`callMatchToCourt`,
`functions/src/organizer-match-ops.ts:603`, tipo `match_call`).

Base de código: `main` no commit atual da branch `claude/agendamento-dinamico-partidas-bf7113`
(branch criada para este trabalho, sem código prévio).

## Decisões

### D1. Recálculo em cascata por quadra, ancorado no horário real

Nova função pura `recalculateCourtSchedule` que reaproveita o algoritmo guloso da
`autoScheduleTournamentDay` (linhas 1116-1173: ordena por `compareByMatchNumber`,
aloca sequencialmente respeitando `minRestBetweenMatchesMin` por dupla), mas:

- Só considera as partidas de **uma quadra e um dia** que ainda não começaram
  (`queueStatus` não é `on_court` nem `completed`) — de qualquer categoria que
  compartilhe a quadra naquele dia, já que a quadra é um recurso único
  independente de categoria (mesmo escopo que `autoScheduleTournamentDay` cobre
  quando chamado sem `categoryId`).
- Começa a alocar a partir de um **horário-âncora** (quando a quadra ficou
  realmente livre), em vez de `matchOps.dayStart`.
- Preserva a ordem relativa das partidas (por `matchNumber`) — não reordena, só
  desloca os horários para frente ou para trás a partir da âncora.
- Continua usando `defaultMatchDurationMin` fixo para estimar a duração das
  partidas seguintes (sem média adaptativa nesta v1 — mais simples e previsível
  para o organizador).

Escopo é **só a mesma quadra**: não rebalanceia partidas para quadras livres.
Resolve o caso comum (fila da própria quadra atrasando/adiantando) sem o risco de
confundir o organizador com partidas "pulando" de quadra sozinhas.

### D2. Três gatilhos, uma função de recálculo

Todos chamam `recalculateCourtSchedule(tournamentId, dayKey, courtId, anchorTime)`:

| Gatilho | Onde | Âncora |
|---|---|---|
| Partida concluída (vitória normal) | extensão de `onTournamentMatchCompletedAdvance` | `matchEndedAt` real |
| W.O. declarado | `declareMatchWalkover` (linha 657-721) | `matchEndedAt` real (quase imediato) |
| Partida entra `on_court` com atraso | novo trigger (mesmo `onDocumentUpdated` de matches) | `matchStartedAt` + `defaultMatchDurationMin` (estimativa antecipada, mesmo com a partida ainda em andamento) |
| Reagendamento manual do organizador | `scheduleMatch`/`rescheduleMatch` (linha 391) | novo `scheduleTime` definido manualmente |

Não existe hoje nenhum conceito de "horário fixado" pelo organizador — `rescheduleMatch`
é literal alias de `scheduleMatch` (linha 454), grava do mesmo jeito que o
auto-agendamento. Decisão: **nenhuma trava nesta v1** — toda partida ainda não
iniciada na quadra participa do recálculo igual, incluindo as que foram reagendadas
manualmente antes dela. Adicionar um campo de "pin" fica para uma iteração futura se
o comportamento incomodar organizadores na prática.

### D3. Guarda contra loop infinito no trigger

O trigger de matches (`onDocumentUpdated`) dispara em qualquer update do doc,
inclusive o próprio batch write da cascata (que grava `scheduleTime`/
`scheduleEndTime`). Sem guarda, isso reprocessa infinitamente.

Regra: o disparo do recálculo depende só de **mudança de estado que não veio da
própria cascata** — `status` virando `completed`, `queueStatus` virando `on_court`,
ou `courtId`/`scheduleTime` alterado por uma escrita externa. O batch da cascata
grava um campo adicional `scheduleRecalcAt` (timestamp do próprio recálculo); o
handler ignora reprocessar quando a mudança relevante do evento é exatamente essa
marca batendo com o timestamp do próprio write (i.e., a escrita foi gerada pela
cascata, não por uma ação do organizador/atleta/mesa).

Função de guarda análoga à `shouldPropagateMatchAdvance` já existente (linha 1255),
nomeada `shouldTriggerScheduleRecalc(before, after)`.

### D4. Flag opt-in por torneio

Novo campo `matchOps.dynamicRescheduleEnabled` (boolean, default `false` —
comportamento atual preservado por padrão). Todos os três gatilhos verificam essa
flag antes de chamar `recalculateCourtSchedule`; torneio sem a flag não sofre
nenhuma mudança de comportamento.

Toggle exposto onde `matchOps` já é editado hoje:
- App organizador: tela/provider de `organizer_auto_schedule_page.dart` /
  `match_ops_providers.dart` (mesmo lugar de `defaultMatchDurationMin`).
- Painel web: `agendamento.component.ts` (espelha a mesma configuração).

### D5. Notificação ao atleta

UI em tempo real já resolve o caso do atleta com o app aberto (listener Firestore
existente, sem mudança). Para quem não está olhando o app: reaproveitar
`deliverNotificationToUser` com um tipo novo, `match_schedule_updated`, seguindo o
mesmo padrão de `callMatchToCourt` (busca times → jogadores → dispara por atleta).

Regra de disparo: só notifica quando o novo `scheduleTime` da partida difere do
anterior em **10 minutos ou mais** (limiar escolhido para evitar notificar por
ajustes de ruído de 1-2min). Corpo da notificação inclui o novo horário estimado e a
quadra.

### D6. Sem mudança estrutural na exibição ao atleta

Modo Focus e lista de partidas do dia já escutam `scheduleTime` via
`watchByTournament` — o novo horário aparece automaticamente assim que a cascata
grava. Não há trabalho de UI de exibição nesta v1 além do toggle (D4).

## Não-objetivos (fora de escopo nesta v1)

- Rebalancear partidas entre quadras diferentes.
- Duração adaptativa/observada por categoria (fica fixa em `defaultMatchDurationMin`).
- Travar/"pinar" horários reagendados manualmente contra a cascata.
- Notificação push dedicada de lembrete pré-partida (item distinto já listado em
  `goals.md`, não faz parte deste trabalho).

## Testes

- `recalculateCourtSchedule`: ordem preservada, âncora aplicada corretamente,
  respeita `minRestBetweenMatchesMin`, não mexe em partidas já `on_court`/`completed`.
- `shouldTriggerScheduleRecalc`: não dispara para a própria escrita da cascata;
  dispara para conclusão normal, W.O., início atrasado e reagendamento manual.
- Limiar de notificação: diff <10min não notifica; diff ≥10min notifica ambos os
  times.
- Flag opt-in: torneio sem `dynamicRescheduleEnabled` não aciona nenhum recálculo
  (regressão do comportamento atual).
