# Multiesporte, fase 2b2: mesa ao vivo ponto a ponto com games

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As três mesas ao vivo (portal do organizador, portal do atleta e app) marcam ponto a ponto partidas `sets_games`: pontos 0/15/30/40/AD (ou sem vantagem), games, tie-break em 6-6, super tie-break no set decisivo e saque alternando por game; o desfazer restaura um snapshot gravado no evento. Partidas `sets_points` seguem exatamente como hoje.

**Architecture:** Um motor puro de games (`applyGamesPoint` + rótulos de pontos, dica e bandeira), em `@nexago/sports` e em `core/sports/`, com vetores compartilhados. O estado do game em andamento vive num campo novo do doc, `currentGame: {a, b}` (pontos do game, ou do tie-break). Cada ponto de games grava no evento um `prev` com o estado anterior; o desfazer de games repõe esse estado. `buildPointWrite`/`buildUndoWrite` (TS e Dart) desviam para o caminho de games quando o perfil efetivo é `sets_games`; o caminho de pontos não muda. As telas só branqueiam a exibição por `isGames`.

**Tech Stack:** Firestore rules (emulador), Cloud Functions TS, Angular 20, Flutter/Dart 3.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` ("Eixo 2", emendas de 04/10, nota da divisão 2b1/2b2).

**Base:** branch `claude/multiesporte-fase-2b2-mesa`, empilhada sobre a 2b1 (`claude/multiesporte-fase-2b1-lancamento`, PR #572).

## Global Constraints

- **Partida `sets_points`: zero mudança.** Mesmo motor (`applyPoint`/`undoPoint`), mesmos campos, mesmo evento (sem `prev`, sem `currentGame`), mesma tela. Toda suíte existente de mesa passa sem alteração.
- Perfil efetivo = `effectiveScoringProfile(match.scoringProfile, match.bestOf)`.
- Games: `sets[i] = {a, b}` em games; set fechado por tie-break leva `tb`; super tie-break grava `{a: 1, b: 0, tb}`. `currentGame` guarda os pontos do game (0..n) ou do tie-break em andamento.
- Saque em games: troca a cada game; no tie-break troca depois do 1º ponto e a cada 2; na virada de set volta a `''` (a mesa pergunta "Quem começa sacando?", como no vôlei); com `servingTeamId` vazio o motor não inventa sacador.
- Desfazer de games: repõe o `prev` do evento desfeito (alvo escolhido por replay da timeline, `lastUndoablePoint`, também no app); evento sem `prev` numa partida de games → o desfazer não faz nada.
- Troca de formato numa partida de games só antes do primeiro ponto (`applyBestOfChange` é regra de pontos).
- `currentGame` entra nas allowlists de mesário e gestor das rules e é apagado em `revertToScheduledFields`.
- Evento de games: `scoreA/scoreB` = games do set depois do ponto; `gameA/gameB` = pontos do game depois do ponto; `prev` = snapshot. Rules já aceitam chaves extras.
- **Nunca `dart format` em arquivo Dart existente.** Arquivo novo: dart do Flutter. Symlinks de `node_modules`; apagar `functions/node_modules` antes do PR. Karma com `--browsers=ChromeHeadless`.
- Commits terminam com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Dois desfazer seguidos numa partida de games voltam dois pontos, não o mesmo duas vezes (também no app, que hoje pega o último evento cru). Teste no Task 3 e no Task 6.
2. Ponto que fecha o game, o set e a partida ao mesmo tempo, e o desfazer dele: volta exatamente ao 40-x do game anterior, com o mesmo sacador. Vetor no Task 1 e teste no Task 3.
3. Sem sacador escolhido (`servingTeamId: ''`): os pontos contam, o saque não é inventado. Vetor no Task 1.
4. Mesário (não gestor) grava `currentGame`; campo novo fora da allowlist continua recusado. Teste no Task 2.
5. Partida revertida para agendada não deixa `currentGame` para trás. Teste no Task 2.

---

### Task 1: Motor de games puro, com vetores

**Files:**
- Modify: `sports/scoring-vectors.json` (`liveVectors`), `sports/codegen.mjs` (emitir e validar)
- Create: `frontend/shared/sports/live-games.ts` (exportado por `frontend/shared/sports/index.ts`), `nexago_app/lib/core/sports/live_games.dart` (exportado por `sport_catalog.dart`)
- Test: `frontend/projects/organizer/src/app/painel/data/live-games.spec.ts`, `nexago_app/test/core/sports/live_games_test.dart`

**Interfaces (TS; Dart em `abstract final class LiveGames` com os mesmos nomes):**

```ts
export interface GamePoints { a: number; b: number; }
export interface GamesLiveState<S extends ScoreSet = ScoreSet> {
  sets: S[];
  currentSetIndex: number;
  currentGame: GamePoints;
  servingTeamId: string;
}
export interface GamesPointResult<S extends ScoreSet = ScoreSet> extends GamesLiveState<S> {
  winnerSide: 'A' | 'B' | null;
  /** O que este ponto fechou: nada, um game, um set ou a partida. */
  closed: 'none' | 'game' | 'set' | 'match';
}
export function applyGamesPoint<S extends ScoreSet>(state: GamesLiveState<S>, side: 'A' | 'B', profile: SetsGamesProfile, teams: { teamAId: string; teamBId: string }): GamesPointResult<S>;
export function gamesPointLabels(state: GamesLiveState, profile: SetsGamesProfile): { a: string; b: string };
export function gamesLiveHint(state: GamesLiveState, profile: SetsGamesProfile, teams: { teamAId: string; teamBId: string }): string | null;
export function gamesFlag(state: GamesLiveState, profile: SetsGamesProfile, teams: { teamAId: string; teamBId: string }, side: 'A' | 'B'): 'set' | 'match' | null;
export function isTiebreakInProgress(state: GamesLiveState, profile: SetsGamesProfile): boolean;
```

**Regras do motor** (`applyGamesPoint`):
1. `idx = clamp(currentSetIndex, 0, bestOf - 1)`; copia os sets; garante `sets[idx]` (`{a: 0, b: 0}`).
2. Soma o ponto em `currentGame`.
3. Set decisivo de super tie-break, ou set em `tiebreakAtGames`×`tiebreakAtGames`: é tie-break. Alvo = `superTiebreakTo` ou `tiebreakTo`, vantagem 2 (`isPointsSetWon`). Não fechou → saque troca se o nº de pontos jogados no tie-break ficou ímpar (e havia sacador); `closed: 'none'`. Fechou → set recebe `tb = currentGame` e games `+1` do vencedor (super tie-break: `a/b` = 1×0 do vencedor).
4. Game normal: fecha quando um lado chega a 4 com vantagem de 2 (sem vantagem: quem chega a 4 primeiro). Não fechou → `closed: 'none'`. Fechou → games `+1` do vencedor, `currentGame` zera, saque troca (se havia sacador).
5. Depois de fechar game ou tie-break: se o set não fechou (`setWinnerSide` do núcleo), `closed: 'game'`. Se fechou e a partida acabou (`matchWinnerSide`), `closed: 'match'`, `winnerSide`, índice fica. Se fechou e a partida segue: `closed: 'set'`, índice `+1`, `currentGame` zera, `servingTeamId = ''`.

`gamesPointLabels`: tie-break → números; senão `0/15/30/40` e, com vantagem, ambos ≥ 3 → iguais `40/40`, à frente `AD/40`. `gamesLiveHint`: simula um ponto de cada lado; algum fecha a partida → `match point`; senão fecha set → `set point`; senão fecha game → `game point`; senão, em tie-break → `super tie-break`/`tie-break`; senão `null`. `gamesFlag`: simula o ponto daquele lado (`match` / `set` / `null`).

- [ ] **Step 1: Vetores (antes do código)**

Acrescentar `liveVectors` ao `scoring-vectors.json` (ids das equipes são `A` e `B`). Cada vetor: `profile`, `start` (estado inicial; omitido = início da partida com `servingTeamId: "A"`), `points` (string de `A`/`B`), `expect` (`sets`, `currentSetIndex`, `currentGame`, `servingTeamId`, `winnerSide`, `closed` do último ponto) e, opcional, `labels` e `hint` no estado final. Gerar as strings longas no script que escreve o JSON (sem digitar 48 letras à mão) e conferir à mão os casos marcados:
- `bt3` "AAAA" → `sets [{1,0}]`, game `{0,0}`, saque `B`, `closed: game`.
- `bt3` "AAABBBA" (sem vantagem) → game de A; saque `B`.
- `tennis3` "AAABBBA" → game `{4,3}`, labels `AD/40`, saque `A`; "AAABBBAB" → `{4,4}`, labels `40/40`; "AAABBBAA" → game de A.
- `bt3` 24×"A" → `sets [{6,0}]`, índice 1, saque `''`, `closed: set`.
- `bt3` 6-6 (games alternados) + "A" → tie-break `{1,0}`, saque trocou; + "AB" → não troca; + "ABA" → troca.
- `bt3` 6-6 + "AAAAABBBBBAA" → `sets [{7,6,tb{7,5}}]`, índice 1, saque `''`.
- `bt3` start `sets [{6,0},{0,6}]`, índice 2, saque `A` + 10×"A" → `sets [.., .., {1,0,tb{10,0}}]`, vencedor `A`, `closed: match`.
- `bt3` 48×"A" → partida de A em 2 sets, `closed: match`.
- `bt3` start com `servingTeamId: ""` + "AAAA" → game de A, saque continua `''`.
- dicas: `bt3` start set `{5,0}`, game `{3,0}`, índice 0 → `set point`; mesmo no índice 1 com `sets [{6,0},{5,0}]` → `match point`; set `{2,1}`, game `{3,1}` → `game point`; set `{6,6}`, game `{0,0}` → `tie-break`; índice 2 de `bt3` → `super tie-break`.

O codegen emite `liveVectors` em `SCORING_VECTORS` (TS, tipo `ScoringLiveVector`) e em `kScoringVectorsJson` (Dart) e valida que o perfil existe.

- [ ] **Step 2: Testes que falham** — `live-games.spec.ts` e `live_games_test.dart` percorrem `liveVectors`: aplicam os pontos a partir de `start`, comparam o estado final, `closed` do último ponto, `labels` e `hint`. Run → FAIL (módulos não existem).
- [ ] **Step 3: Implementar** os dois módulos (TS e Dart, mesma estrutura; Dart formatado com o dart do Flutter).
- [ ] **Step 4: Rodar e commitar** `feat(sports): motor de games da mesa ao vivo (pontos, tie-break, super tie-break, saque) com vetores`.

---

### Task 2: Rules e reversão no servidor aceitam `currentGame`

**Files:**
- Modify: `firestore.rules` (`scorerCanOnlyEditScoreFields`, `managerCanOnlyEditMatchFields`: acrescentar `'currentGame'`)
- Modify: `functions/src/organizer-match-ops.ts` (`revertToScheduledFields`: `currentGame: FieldValue.delete()`)
- Test: `functions/test/mesa-scorer-point.rules.test.mjs` (casos novos), `functions/src/organizer-match-ops.revert-live.test.ts` (caso novo)

- [ ] **Step 1: Testes que falham** — mesário grava `{currentGame: {a: 1, b: 0}, sets: [...]}` → sucesso; gestor idem; um campo inventado (`gameState`) continua recusado; `revertToScheduledFields()` tem `currentGame` como `FieldValue.delete()`. Run rules no emulador e o teste de revert → FAIL nos casos de `currentGame`.
- [ ] **Step 2: Implementar** as duas listas e o revert.
- [ ] **Step 3: Rodar** `npm run test:rules` inteiro e o teste de revert → verde. Commit `feat(rules): mesa grava currentGame; reversão para agendada apaga o game em andamento`.

---

### Task 3: Escrita e desfazer de games no repositório compartilhado dos portais

**Files:**
- Modify: `frontend/shared/live-scoring/live-match-repository.ts` (`LiveMatch.currentGame`, `LivePointEvent.prev`, `liveMatchFromDoc`, leitura do evento com `prev`, `gameA/gameB`; `buildPointWrite` e `buildUndoWrite` desviam para games), `frontend/shared/live-scoring/index.ts` (exportar `liveMatchProfile` se criado)
- Test: `frontend/projects/athlete/src/app/mesa/mesa-games.spec.ts` (novo)

**Interfaces:**
- `LiveMatch.currentGame: GamePoints` (`{0, 0}` quando ausente).
- `LivePointEvent.prev: Record<string, unknown> | null`, `gameA`/`gameB` (0 quando ausentes).
- `buildUndoWrite(m, side, setIndex, prev?: Record<string, unknown> | null): PointWrite | null` — `null` numa partida de games sem `prev`. Caminho de pontos ignora `prev` e devolve o mesmo de hoje.
- Os callers das duas mesas passam `last.prev`.

**Comportamento do caminho de games:**
- `buildPointWrite`: `applyGamesPoint` com `{sets: m.sets, currentSetIndex, currentGame, servingTeamId}`; `matchUpdate` = os campos de hoje + `currentGame`; slots do sacador por `servingPlayerSlotsAfterScore` (anterior → novo sacador); `pointEvent` = `{type: 'point', side, setIndex, scoreA, scoreB, gameA, gameB, prev}`, onde `prev = {sets: m.sets.map(liveSetToMap), currentSetIndex, currentGame, servingTeamId, servingPlayerSlots, servingPlayerSlot}`.
- `buildUndoWrite` com `prev`: repõe `sets`, `currentSetIndex`, `currentGame`, `servingTeamId`, `servingPlayerSlots`, `servingPlayerSlot` do `prev`; `status: 'In Progress'`, `winnerId`/`matchEndedAt` apagados, `resultA/B` recalculados com o perfil; evento `undo-point` com o placar do `prev`.

- [ ] **Step 1: Spec que falha** (`mesa-games.spec.ts`): monta um `LiveMatch` de `bt3` em 40-0 no 5-0 do 1º set (via `liveMatchFromDoc`), aplica `buildPointWrite(m, 'A')` → `currentGame {0,0}`, `sets[0] = {6,0}`, `currentSetIndex 1`, `servingTeamId ''`, `pointEvent.prev.currentGame = {3,0}`; reconstroi o `LiveMatch` a partir do `matchUpdate` e aplica `buildUndoWrite(m2, 'A', 0, event.prev)` → volta a `{5,0}`, game `{3,0}`, sacador original. Segundo caso: partida de pontos — `buildPointWrite` sem `currentGame` nem `prev`, e `buildUndoWrite` com `prev` qualquer devolve o mesmo que sem. Terceiro: `buildUndoWrite` de games sem `prev` → `null`. Quarto (Review Focus 1): replay de dois `point` + um `undo-point` com `lastUndoablePoint` devolve o primeiro `point`. Run → FAIL.
- [ ] **Step 2: Implementar** no repositório (sem mexer no caminho de pontos).
- [ ] **Step 3: Rodar** `ng test athlete` e `ng test organizer` → verde. Commit `feat(mesa): escrita e desfazer de games com snapshot no evento`.

---

### Task 4: Mesa do portal do organizador

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/mesa-ao-vivo.component.ts`

**Comportamento:**
- `profile = computed(() => effectiveScoringProfile(m.scoringProfile, m.bestOf))`; `isGames = profile.kind === 'sets_games'`.
- Games: placar grande = `gamesPointLabels` do estado; abaixo, os games do set corrente (`sets[idx]`); faixa de regras = `setTargetLabel(profile, idx)` + `· tie-break`/`· super tie-break` quando `isTiebreakInProgress`; dica = `gamesLiveHint`; chips de set mostram games (e `(tb)` quando houver).
- Pontos: computeds atuais, intocados.
- `undoLast` passa `last.prev`; chips de formato desabilitados em games quando há ponto marcado (mensagem curta).
- Extrair a montagem da exibição de games numa função pura exportada do arquivo, `mesaGamesView(m: LiveMatch)` → `{mainA, mainB, gamesA, gamesB, rulesLabel, hint, tiebreak}`, e testá-la num spec novo `mesa-ao-vivo.games.spec.ts`.

- [ ] Spec (`mesaGamesView` para 40-AD, tie-break e set novo) → FAIL → implementar → `ng test organizer` verde → commit `feat(organizer-web): mesa ao vivo marca games, tie-break e super tie-break`.

---

### Task 5: Mesa do portal do atleta

**Files:**
- Modify: `frontend/projects/athlete/src/app/mesa/mesa-board.ts` (funções de games ao lado das de pontos: `gamesMainOf`, `gamesFlagOf`, `gamesRuleLineOf`), `frontend/projects/athlete/src/app/mesa/mesa-live.component.ts` (branch de exibição por `isGames`; `undoLast` passa `last.prev`; formato bloqueado em games após o 1º ponto)
- Test: `frontend/projects/athlete/src/app/mesa/mesa-board.games.spec.ts` (novo)

- [ ] Spec das três funções novas → FAIL → implementar → `ng test athlete` verde → commit `feat(atleta-web): mesa ao vivo marca games, tie-break e super tie-break`.

---

### Task 6: Mesa do app

**Files:**
- Create: `nexago_app/lib/features/organizer/domain/match_ops/games_point_write.dart` (caminho de games de ponto e desfazer, espelho do Task 3), `nexago_app/lib/features/organizer/domain/match_ops/live_point_replay.dart` (`lastUndoablePoint` em Dart)
- Modify: `nexago_app/lib/features/tournaments/domain/tournament_match.dart` + mapper (`currentGame`), `nexago_app/lib/features/tournaments/domain/tournament_match_point_event.dart` + mapper (`prev`, `gameA`, `gameB`), `nexago_app/lib/features/organizer/data/match_point_write.dart` (desvio para games), `nexago_app/lib/features/organizer/presentation/match_ops/organizer_match_live_table_page.dart` (`_undoLastPoint` por replay em games, passando `prev`; formato bloqueado em games após o 1º ponto; exibição de games), widgets da mesa (placar grande com rótulos de pontos e linha de games quando `isGames`)
- Test: `nexago_app/test/features/organizer/games_point_write_test.dart`, `nexago_app/test/features/organizer/live_point_replay_test.dart`

**Regra de desfazer no app:** em partida de games, o alvo é o `lastUndoablePoint` (replay); em partida de pontos fica o comportamento de hoje (último `point` cru), sem mudança.

- [ ] Testes (espelhos do Task 3 + replay) → FAIL → implementar (edição mínima nos arquivos existentes, sem `dart format`) → `flutter analyze` nos tocados e `flutter test test/features/organizer test/features/tournaments test/core` verdes → commit `feat(app): mesa ao vivo marca games, tie-break e super tie-break`.

---

### Task 7: Verificação final e PR empilhado

- [ ] Suítes completas (functions + rules; flutter analyze + test; `ng test` nos cinco portais; codegen `--check`).
- [ ] `rm -f functions/node_modules`, push, PR contra `claude/multiesporte-fase-2b1-lancamento`.
