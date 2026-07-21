# 5 novas funcionalidades — pesquisa de concorrência (meta autônoma)

## Contexto

Executado via `/goal`: buscar funcionalidades que agreguem valor ao nexaGO,
verificando concorrentes, e implementar até 5 delas em branches separadas.
Diretiva autônoma (sem checkpoint de aprovação humana antes de implementar) —
este spec documenta a decisão tomada, não pede aprovação prévia.

**Pesquisa de concorrentes** (relatório completo no histórico da sessão):
Brasil — LetzPlay, Ranking Beach Tennis, BT Match, JumpAE, LiveBT (placar ao
vivo por quadra), Sua Praia/BeachTime, Minha Quadra. Internacionais —
Playtomic (lista de espera premium, split de pagamento), Matchi, DUPR
(reliability score, win probability), UTR (H2H, mídia no perfil), LeagueApps
(check-in, microsite de liga), Challonge (bracket predictions do público),
TeamSnap Live (placar ao vivo por qualquer torcedor).

**O que o nexaGO já tem** (não redundante com o roadmap abaixo): chaveamento
automático + bracket view, torneios/ligas com pontuação, rating Glicko-2
(`athleteRatings/{uid}_{sport}`), "Sand Rank" (elo de gamificação via XP,
sistema distinto do Glicko-2), match finder "Bora Jogar", feed de comunidade
sistêmico, gamificação via CF, PIX/CPF-CNPJ na inscrição, planos de arena,
taxas de plataforma + carteiras, equipe de torneio, perfis públicos, portal
web completo (atleta/organizador/arena).

**5 funcionalidades escolhidas** (não redundantes com o que já existe,
implementáveis como fatia vertical sem nova credencial/API externa):

1. Placar ao vivo
2. Lista de espera de quadra
3. Head-to-head (confronto direto)
4. Probabilidade de vitória pré-partida
5. Palpites da torcida no chaveamento

Descartado desta rodada: split de pagamento (depende de detalhes do PSP não
mapeados), previsão do tempo (exigiria API key externa — fora do que posso
provisionar sozinho), ticketing (monetização nova, escopo grande demais),
streaming (infra de vídeo, fora de escopo).

Cada feature abaixo é implementada em sua própria branch/worktree
(`feat/<nome>`), isolada, seguindo o padrão real do repo: Cloud Functions
`flat` em `functions/src/<dominio>.ts` + teste colocalizado `node:test`,
Flutter feature-first com 3 camadas `data/domain/presentation` (não 4 —
diverge do `.claude/CLAUDE.md`, mas é o padrão real de todas as features
existentes, ex. `features/ranking/`).

---

## 1. Placar ao vivo

**Problema:** hoje só existe o resultado final da partida
(`submitMatchResult`, `functions/src/organizer-match-ops.ts:656`, grava sets
completos + vencedor). Enquanto a partida está em andamento, o app não mostra
nada — diferente do LiveBT/TeamSnap Live, onde qualquer torcedor acompanha o
placar quadra a quadra em tempo real.

**Escopo (MVP):** placar ao vivo dentro do app (autenticado), não página
pública sem login — reduz escopo mantendo o valor principal (torcida remota
acompanha pelo celular).

**Modelo de dados:** novo campo `liveScore` no doc de
`artifacts/{projectId}/public/data/matches/{matchId}`:
```
liveScore: {
  setsA: number, setsB: number,       // sets fechados
  currentGamesA: number, currentGamesB: number, // game do set em andamento
  updatedAt: Timestamp,
}
```
Só existe enquanto `status == 'In Progress'`; removido (ou ignorado) quando
`submitMatchResult` grava o resultado final.

**Cloud Function:** `updateLiveMatchScore` (callable, mesmo padrão de
`submitMatchResult`) em `functions/src/organizer-match-ops.ts` — autorização:
mesmo guard de staff/organizador já usado por `submitMatchResult`
(reaproveitar, não duplicar). Atualiza `liveScore` + garante `status =
'In Progress'` na primeira chamada.

**App Flutter:**
- `features/tournaments/domain/tournament_match.dart`: adicionar `liveScore`
  opcional ao modelo + mapper.
- Tela do mesário/staff (onde hoje se chama o fluxo de `submitMatchResult`):
  novo controle de placar incremental (+/- games) que chama
  `updateLiveMatchScore` a cada ponto/game fechado.
- `presentation/widgets/tournament_match_card.dart` e telas de bracket:
  quando `status == 'In Progress'` e `liveScore != null`, mostrar badge "AO
  VIVO" + placar atual (stream Firestore já existente, sem polling).

**Fora de escopo:** página pública sem login, placar ponto a ponto (só
game/set), notificação push a cada ponto.

---

## 2. Lista de espera de quadra

**Problema:** quando um horário de quadra está lotado, o atleta simplesmente
não consegue reservar — sem alternativa. Playtomic Premium resolve isso com
lista de espera + alerta automático quando vaga abre.

**Modelo de dados:** nova coleção `arenaBookingWaitlist/{id}`:
```
{ arenaId, courtId, date, startTime, endTime, athleteId,
  status: 'waiting' | 'notified' | 'expired' | 'converted',
  createdAt, notifiedAt?, expiresAt? }
```
Reaproveita a granularidade de slot já usada por `arenaSlots`
(`functions/src/arena-booking-create.ts`).

**Cloud Functions** (novo arquivo `functions/src/arena-booking-waitlist.ts`,
seguindo a convenção flat do domínio):
- `joinArenaBookingWaitlist` (callable) — cria entrada `waiting`; rejeita se
  o slot não estiver de fato lotado (reconsulta `arenaSlots`).
- `notifyArenaWaitlistOnSlotFreed` (trigger `onDocumentUpdated` em
  `arenaBookings`, dispara quando `status` vira `canceled`) — busca a
  entrada `waiting` mais antiga (FIFO) pro slot, marca `notified` +
  `expiresAt` (janela de 15 min) e dispara push FCM (reaproveitar utilitário
  de push já usado por outros triggers, ex. `tournament-match-gamification.ts`
  ou equivalente).
- Job leve para expirar entradas `notified` vencidas (reaproveitar padrão de
  schedule já existente em `arena-recurring-materializer.ts` se fizer
  sentido, ou trigger simples on-read).

**App Flutter (`features/arenas/`):**
- Tela de reserva: quando slot lotado, botão "Entrar na lista de espera" em
  vez de "Reservar" desabilitado.
- Nova seção "Minha lista de espera" (repositório novo
  `data/waitlist_repository.dart`, provider em `domain/`).
- Notificação push → deep link de volta pro fluxo de reserva do mesmo slot.

**Fora de escopo:** priorização paga (ex. "furar a fila"), lista de espera
para mensalista/recorrência (só reserva avulsa no MVP).

---

## 3. Head-to-head (confronto direto)

**Problema:** o perfil/histórico do atleta (`features/athlete/domain/match_history/`,
`data/match_history/`) mostra estatísticas agregadas, mas não "como você se
saiu contra ESTE adversário especificamente" — UTR e LetzPlay destacam isso
como prova social forte.

**Onde aparece:** tela de detalhe da partida (`match_detail_play_by_play_logic.dart`
e a tela que a usa) já sabe quem são os dois adversários — é o lugar mais
barato de mostrar H2H sem precisar de busca de oponente.

**Cloud Function:** callable `getHeadToHeadRecord(athleteIdA, athleteIdB,
sportCode?)` em novo arquivo `functions/src/head-to-head.ts` — consulta
`artifacts/{projectId}/public/data/matches` com `status == 'Completed'` e os
dois IDs entre os participantes (checar campos reais de participante no
modelo antes de escrever a query — implementador deve inspecionar
`tournament_match.dart`/`match-scoring.ts` para os nomes exatos, ex.
`teamAAthleteIds`/`teamBAthleteIds` ou equivalente). Agrega vitórias/derrotas
+ até 5 partidas mais recentes. Se o volume justificar índice composto,
adicionar em `firestore.indexes.json`.

**App Flutter:**
- `features/athlete/data/head_to_head_repository.dart` (novo, chama a
  callable).
- Widget "Vocês já se enfrentaram" na tela de detalhe da partida — registro
  (ex. "3 vitórias a 1") + mini-lista das últimas partidas entre os dois.

**Fora de escopo:** busca livre de H2H entre dois atletas quaisquer fora do
contexto de uma partida (fica pro perfil público, se fizer sentido depois);
H2H em duplas (só perfil de atleta 1:1 no MVP, mesmo em jogos de dupla conta
por atleta).

---

## 4. Probabilidade de vitória pré-partida

**Problema:** o rating técnico Glicko-2 já existe e é lido pelo app
(`athleteRatings/{uid}_{sportCode}`, campos `rating`/`rd` já expostos em
`features/athlete/domain/athlete_rating.dart`), mas não é usado para nada
além de mostrar o nível/zona do atleta. DUPR usa a mesma informação para
mostrar "win probability" pré-jogo — engajamento sem nenhum dado novo.

**Decisão de escopo:** cálculo **100% client-side em Dart**, sem nova Cloud
Function — os dois documentos `athleteRatings` das partes já são legíveis
pelo app (regra pública de leitura, escrita exclusiva do backend). Fórmula
logística padrão na escala pública (400): 
`p(A vence) = 1 / (1 + 10^((ratingB - ratingA) / 400))`.
Para dupla, compor os dois ratings do time (ex. média) antes de aplicar a
fórmula — mesma convenção de "jogador composto" já documentada em
`functions/src/glicko.ts` (`compositeTeamRating`), só que o app não tem essa
função: replicar a mesma regra em Dart (não reimplementar o Glicko inteiro,
só a composição de rating de dupla + a fórmula de probabilidade).

**App Flutter:**
- Novo arquivo puro `features/tournaments/domain/win_probability.dart`
  (função pura, testável sem Firestore).
- Exibição: card "Probabilidade de vitória" na tela de detalhe da partida
  (quando `status == 'Scheduled'`) e badge discreto no
  `tournament_match_card.dart`. Se algum atleta ainda não tem rating
  (partida não avaliada / provisional), não mostrar nada — nunca mostrar
  probabilidade com dado insuficiente.

**Fora de escopo:** persistir a previsão para conferência posterior (isso é
o que a feature #5 faz, propositalmente separada porque tem audiência e
mecânica diferentes — #4 é só para os dois competidores, #5 é pra torcida).

---

## 5. Palpites da torcida no chaveamento

**Problema:** o chaveamento hoje é só leitura passiva. Challonge tem
"bracket predictions" do público como mecânica de engajamento — relevante
para a Liga nexaGO (lançamento 24/10), que quer torcida ativa, não só
participantes.

**Modelo de dados:** nova coleção
`tournamentPredictions/{tournamentId}/entries/{userId}`:
```
{ userId, picks: { [matchId]: predictedWinnerAthleteId }, championPick?,
  submittedAt, updatedAt }
```
Regra de negrócio: um pick só é aceito enquanto o match correspondente ainda
está `Scheduled` — trava automaticamente quando a partida começa (mesmo
padrão de "não pode editar depois que já rolou" usado em
`validateMatchResult`).

**Cloud Functions** (novo arquivo `functions/src/tournament-predictions.ts`):
- `submitBracketPrediction` (callable) — grava/atualiza picks, valida que
  cada `matchId` pertence ao torneio e ainda está `Scheduled`.
- `scoreBracketPredictionsOnMatchResult` (trigger `onDocumentUpdated` nos
  matches, dispara quando `status` vira `Completed` — mesmo gatilho que já
  existe para avançar bracket e gamificação, então **anexar nesse mesmo
  trigger existente ao invés de criar um novo listener** para não duplicar
  leitura do doc): para cada entrada em `tournamentPredictions/{tid}/entries`
  que tinha pick nesse match, soma pontos (ex. +1 acerto de vencedor, +3 se
  acertar o campeão da chave inteira ao final). Grava pontuação agregada em
  `tournamentPredictions/{tournamentId}/entries/{userId}.score`.
- Reaproveitar o padrão de gamificação existente
  (`tournament-match-gamification.ts`) para conceder XP por acerto, em vez
  de inventar uma pontuação paralela.

**App Flutter:**
- Nova aba/tela "Palpites" a partir da tela de bracket
  (`tournament_bracket_page.dart`) — lista de partidas `Scheduled` com
  seleção do vencedor previsto; trava visualmente quando a partida começa.
- Leaderboard de palpiteiros por torneio (reaproveitar padrão visual do
  `features/ranking/`).

**Fora de escopo:** palpite em partidas de dupla eliminação com reset de
bracket (LB/GF) na v1 — só chave simples e grupos-com-mata-mata padrão;
apostas com dinheiro real (proibido, é só pontuação/gamificação).

---

## Ordem e paralelismo de implementação

As 5 features são independentes entre si (não compartilham arquivo além de
`functions/src/index.ts` para export, que cada agente deve editar de forma
aditiva). Implementação em worktrees isolados, uma branch `feat/<nome>` por
feature, em paralelo. Cada branch: implementa, roda testes/lint relevantes,
commita — sem merge automático em `main` (fica para revisão humana via PR).
