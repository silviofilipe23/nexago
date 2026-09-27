# Remoção de equipe machucada no KOTC

Data: 2026-09-27

## Problema

No King of the Court (KOTC), quando uma equipe se machuca durante o torneio,
hoje não há nenhum jeito de tirá-la da rotação. A única remoção que existe no
painel (`organizerRemoveFromCategory`) apaga a **inscrição**, roda antes/fora
da sessão ao vivo, e não sabe nada sobre `kocState` (Rei, Desafiante, fila).
Uma equipe machucada no meio de uma rodada não tem por onde saltar dessa
fila hoje.

## Decisões de comportamento (confirmadas com o organizador)

1. A remoção pode acontecer **em qualquer momento** — inclusive com a equipe
   ocupando o trono (Rei) ou desafiando no momento, não só quando está
   esperando na fila.
2. Pontos e coroas que a equipe machucada já tinha conquistado **ficam
   congelados** e aparecem no ranking final da rodada — ela só para de
   competir a partir daquele ponto, sem apagar o que já fez.
3. A remoção exige **motivo obrigatório** e fica registrada em auditoria,
   no mesmo espírito de `organizerRemoveFromCategory`.
4. Se a equipe removida for o Rei ou a Desafiante da vez, **a próxima da fila
   assume o lugar na hora** e o jogo continua sem interromper a rodada
   (relógio, contagem de rallies, bola de ouro pendente etc. seguem intactos).
5. A remoção vale **para tudo dali em diante**: a equipe some da rotação
   atual e não é convocada para nenhuma fase futura ainda não resolvida
   daquela categoria.

## Por que isso é uma mudança de motor, não um botão isolado

Toda mutação do KOTC (`kocRegisterRally`, `kocGoldenPoint`, `kocUndoRally`)
funciona com **replay determinístico**: o estado nunca é ajustado de forma
incremental — ele é sempre recalculado do zero a partir de
`kocTeamIds` + `kocRallies` via `kocReplay()`
(`functions/src/koc-match-ops.ts:420,467,506,543`). Se a remoção fosse só um
patch em `kocState` sem entrar nesse log, o próximo rally ou undo recalcularia
o estado do zero, ignoraria a remoção e a equipe machucada voltaria à fila
como se nada tivesse acontecido. A remoção **precisa** ser um evento de
primeira classe dentro do log replayável.

O próprio motor já tem precedente para isso: a **bola de ouro**
(`winner: "golden_point"`) já é um evento no log de rallies que não é um rally
comum — aponta uma dupla específica, não "rei" ou "desafiante", e tem sua
própria trava de negócio. A remoção por lesão segue exatamente esse padrão.

## Design

### 1. Motor (`functions/src/koc-engine.ts`)

- `KocRallyOutcome` ganha um quarto+um valor: `"team_removed"` (ao lado de
  `"king"`, `"challenger"`, `"serve_fault"`, `"golden_point"`), exigindo
  `teamId`.
- `KocState` ganha `removedTeamIds: string[]` (default `[]` em
  `kocInitialState`).
- `kocApplyRally` ganha um branch para `"team_removed"`:
  - Valida que `teamId` está em `state.points` (faz parte do elenco da
    rodada) e que ainda não está em `removedTeamIds` (evita remoção
    duplicada).
  - Tira o `teamId` de `queue`.
  - Se `teamId === challengerTeamId`: o próximo da fila (`queue.shift()`)
    assume Desafiante e a saca; Rei não muda.
  - Se `teamId === kingTeamId`: o Desafiante atual assume o trono (sem
    crédito de coroa/`crowns`, já que não foi vitória em quadra — mas
    entra em `crownOrder` para o desempate "rei mais recente" continuar
    coerente) e o próximo da fila assume Desafiante.
  - `points`/`crowns` da equipe removida **não são tocados** — ficam
    congelados para `kocStandings`.
  - `state.rallies` (contador de rallies JOGADOS) **não incrementa** —
    não foi um rally. `seq`/posição no log incrementam normalmente, então
    `kocUndoRallyCore` continua funcionando de graça (desfazer = replay com
    um item a menos no log, igual a qualquer outro).
  - Trava nova: se, depois de tirar essa equipe, restarem menos de 2 duplas
    ativas (`roster.length - removedTeamIds.length - 1 < 2`), rejeita com
    `KocEngineError("...", "koc_round_too_small_after_removal")` — a rodada
    não tem como continuar só com uma dupla.
- `kocQualifyingTies` (bola de ouro): grupos de empate não podem incluir uma
  `teamId` presente em `removedTeamIds` — uma equipe machucada não pode ser
  convocada para decidir vaga em quadra.

### 2. Cloud Functions

**`functions/src/koc-match-ops.ts`** — nova callable `kocRemoveTeam`
(mesma região/padrão de auth de `kocRegisterRally`/`kocGoldenPoint`:
`assertCanScoreTournament` via `loadRoundOrThrow`).

`kocRemoveTeamCore(db, uid, {matchId, teamId, description})`:
1. `loadRoundOrThrow` — rejeita rodada cancelada/concluída; rejeita se
   `teamId` não está em `round.teamIds`.
2. `parseRemovalDescription(description)` (reaproveitado de
   `organizer-removal-description.ts`, mesmo mínimo/máximo de 10–500
   caracteres) — motivo obrigatório, erro claro se ausente/curto/longo.
3. Anexa `{seq: round.rallies.length + 1, winner: "team_removed", teamId}`
   ao log; `kocReplay(round.teamIds, rallies)`; `KocEngineError` →
   `HttpsError` via `engineErrorToHttps` (padrão já existente).
4. Persiste com um write mais leve que `kocStateFields` (não exige
   `kocClock`, porque a remoção deve funcionar mesmo numa rodada ainda não
   iniciada): grava só `kocState` (incluindo `removedTeamIds`),
   `kocRallies` (via `serializeKocRallies`), `kocRallySeq`, `updatedAt`.
5. Auditoria: cria doc em nova coleção `tournamentKocTeamRemovals` —
   `{tournamentId, categoryId, matchId, teamId, description, removedBy: uid,
   removedAt: serverTimestamp()}`. Coleção nova (não reaproveita
   `tournamentRegistrationCancellations`) porque ali a inscrição é
   **deletada**; aqui a equipe continua inscrita, só sai da rotação.
6. `arrayUnion(teamId)` no campo `kocRemovedTeamIds` da categoria — lista
   que qualquer fase futura ainda não resolvida vai consultar.

**`kocUndoRallyCore`** (mesmo arquivo): ao desfazer, se o rally removido do
final do log for `winner === "team_removed"`, também aplica
`arrayRemove(teamId)` em `kocRemovedTeamIds` da categoria — senão desfazer a
remoção no motor não desfaz o efeito colateral sobre fases futuras.

**`functions/src/koc-phase-advance.ts`**: na seleção de quem qualifica para
a próxima rodada (a partir de `kocStandings`, ~L131-217), filtra qualquer
`teamId` presente em `kocRemovedTeamIds` da categoria antes de escrever
`kocTeamIds` no próximo round doc — mesmo que essa equipe estivesse
classificada pela pontuação.

### 3. Alcance sobre fases futuras

Fases além da atual só existem como *placeholders* de qualificação
(`kocQualifiers`) até a fase anterior terminar — não há roster concreto para
editar. O único ponto de controle é `kocRemovedTeamIds` na categoria (item
2.6), consultado no momento em que o avanço de fase resolve `kocTeamIds`
(item 2, `koc-phase-advance.ts`). Não há patch retroativo em rounds já
resolvidos além do atual: se a equipe já havia sido escrita num
`kocTeamIds` futuro antes de se machucar, a exclusão vale a partir da
resolução SEGUINTE a essa (edge case raro, tratado como aceitável — a
equipe não volta a qualificar de novo dali em diante).

### 4. UI (painel do organizador)

- `frontend/projects/organizer/src/app/painel/chaveamento/mesa-koc.component.ts`:
  botão/ícone de "remover por lesão" junto de cada equipe exibida (Rei,
  Desafiante, fila), visível só para quem tem permissão de pontuar a
  rodada.
- Confirmação via `og-confirm-dialog` com `prompt` obrigatório (mesmo padrão
  de `inscricoes.component.ts:768-796`), texto pedindo o motivo.
- Novo wrapper em
  `frontend/projects/organizer/src/app/painel/data/organizer-ops.service.ts`:
  `removeKocTeam({matchId, teamId, description})` → `call('kocRemoveTeam',
  {...})`, espelhando `revertMatchToScheduled`.
- Após sucesso: a equipe some da fila/trono imediatamente (o doc já reflete
  o novo `kocState` via listener existente). No histórico de rallies exibido
  na mesa/telão, o evento `team_removed` recebe rótulo próprio ("fora —
  lesão") em vez de tentar renderizar como um rally comum.

## Testes

Seguindo o padrão já usado no diretório (`koc-engine.test.ts`,
`koc-match-ops.test.ts`, `koc-phase-advance.test.ts`):

- Motor: `kocApplyRally` com `team_removed` — remoção da Desafiante, do Rei,
  de alguém só na fila; trava de "menos de 2 duplas restantes"; pontos/coroas
  congelados; `removedTeamIds` acumulando; bola de ouro não convoca equipe
  removida.
- `koc-match-ops`: `kocRemoveTeamCore` — motivo obrigatório/curto/longo
  rejeitado; equipe fora do elenco rejeitada; rodada concluída/cancelada
  rejeitada; escrita final de `kocState`/`kocRallies`; `arrayUnion` na
  categoria; `kocUndoRallyCore` desfazendo remoção e revertendo
  `kocRemovedTeamIds`.
- `koc-phase-advance`: equipe em `kocRemovedTeamIds` nunca é escrita como
  qualificada na próxima fase, mesmo estando na frente pela classificação.

## Fora de escopo

- Reembolso/estorno de inscrição da equipe machucada (fluxo já existente e
  independente, não acionado por esta feature).
- Qualquer UI no app do atleta ou no telão além do rótulo do evento no
  histórico — notificação ao atleta não faz parte desta entrega.
- Editar retroativamente `kocTeamIds` de rounds futuros já resolvidos (ver
  seção 3).
