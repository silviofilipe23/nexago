# Multiesporte fase 2c1: base da exibição e desempate por tipo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Os helpers de exibição que todas as telas usam (sets fechados, sets vencidos, set em andamento) passam a decidir pelo perfil da partida e a expor o game em andamento; o desempate dos grupos passa a usar o critério do tipo — nas functions, no painel, no portal do atleta e no app.

**Architecture:** Três pontos de troca carregam quase toda a exibição (inventário de 04/10): `live-set-display.ts` (organizer: telão, overlay, página pública, LED), `matches-repository.ts` do atleta (Focus, chave, lista, detalhe, share) e `tournament_match_display.dart` (Focus, chave, pôster e cards do app). Cada um troca a régua de 21 pontos por `effectiveScoringProfile(scoringProfile, bestOf)` + `setWinnerSide`, e `matchLiveCurrentSet` ganha `game` (rótulos 0/15/30/40/AD ou pontos do tie-break, via `gamesPointLabels`). Um formatador de set no núcleo (`setScoreText`) dá "7-6 (7-4)" e "10-8" ao super tie-break, com vetores nas três linguagens. Standings: `sets_points` mantém vitórias → saldo de pontos → confronto direto; `sets_games` usa vitórias → saldo de sets → saldo de games → confronto direto.

**Tech Stack:** TypeScript (functions, Angular), Dart/Flutter, vetores em `sports/scoring-vectors.json`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 2 "Standings de grupo"; emenda de 04/10 da fase 2 — 2c, e a emenda 2c1/2c2/2c3 deste PR).

## Global Constraints

- Partida de pontos (sem carimbo ou `sets_points`): ZERO mudança de comportamento — o perfil efetivo é o legado e as funções devolvem o mesmo que hoje. Os testes existentes não mudam.
- Partida sem perfil carimbado usa a regra histórica (21, decisivo 15 só no 3º de MD3, +2).
- Nº de sets vem de `match.bestOf`; o resto, do carimbo (`effectiveScoringProfile`).
- Ao vivo, set em andamento nunca conta como vencido; encerrada, todo set vale (como hoje).
- `setsWonCountForMatch` (app) mantém o comportamento de hoje em pontos; em games conta só sets fechados.
- Strings PT na UI, inglês no código. `dart format` só em arquivo novo, com o dart do Flutter.

## Review Focus

1. Set de games 6-4 ao vivo conta como fechado; 5-4 não; 6-6 em tie-break não; super tie-break `{1,0,tb}` fechado conta para o vencedor.
2. Game em andamento aparece (40-15, AD-40, pontos do tie-break) só em partida de games ao vivo; partida de pontos devolve `game: null`.
3. Partida de pontos com o mesmo placar devolve exatamente o mesmo de hoje nos três helpers (testes existentes intactos).
4. Desempate em games: duas duplas com mesmas vitórias e mesmo saldo de games, saldos de sets diferentes → saldo de sets decide antes do confronto direto.
5. Grupo misto (sem carimbo) segue o critério de pontos.

---

### Task 1: `setScoreText` no núcleo, com vetores

**Files:** `sports/scoring-vectors.json` (`textVectors`), `sports/codegen.mjs` (emite `textVectors` nos três gerados, como `labelVectors`), `functions/src/sports/scoring.ts`, `frontend/shared/sports/scoring.ts` (mesma transformação de sempre do arquivo das functions), `nexago_app/lib/core/sports/scoring_rules.dart`; testes `functions/src/sports/scoring.test.ts`, `frontend/projects/organizer/src/app/painel/data/scoring-vectors.spec.ts`, `nexago_app/test/core/sports/scoring_rules_test.dart`.

- [ ] Vetores: legacy3 `{21,18}` idx0 → `"21-18"`; bt3 `{6,4}` → `"6-4"`; bt3 `{7,6,tb{7,4}}` → `"7-6 (7-4)"`; bt3 idx2 `{1,0,tb{10,8}}` → `"10-8"`; bt3 idx2 `{0,1,tb{6,10}}` → `"6-10"`; bt3 `{7,6}` sem tb → `"7-6"`; legacy3 `{21,19,tb{7,5}}` → `"21-19"` (tb ignorado em pontos).
- [ ] RED nas três; implementar `setScoreText(profile, index, set)`; GREEN; commit `feat(sports): setScoreText com tie-break e super tie-break`.

### Task 2: functions — standings por tipo

**Files:** `functions/src/group-standings.ts`, teste em `functions/src/group-standings.test.ts` (novo) ou junto de `category-bracket-builders.test.ts`.

- [ ] `GroupMatchData` ganha `scoringProfile?: unknown; bestOf?: unknown`. Tipo do grupo = `sets_games` se alguma partida do pool tem `effectiveScoringProfile(...).kind === 'sets_games'`; senão `sets_points`.
- [ ] Em `sets_games`: ordenar vitórias → saldo de sets → saldo de games → confronto direto (confronto só entre empatadas nos três primeiros). `sets_points` idêntico a hoje.
- [ ] Teste RED: 3 duplas, games, A e B com 1 vitória e mesmo saldo de games, A com saldo de sets maior, B venceu A no confronto → A antes de B. Teste de pontos com o mesmo placar → ordem de hoje (B antes de A pelo confronto direto).
- [ ] GREEN; `npm test`; commit `feat(standings): desempate por saldo de sets em partidas de games`.

### Task 3: organizer web — modelo e `live-set-display`

**Files:** `frontend/projects/organizer/src/app/painel/data/matches-repository.ts` (`currentGame`), `live-set-display.ts`, `live-set-display.spec.ts`, `buildGroupStandings` (mesmo arquivo do repositório) + spec novo, `chaveamento/grupos.component.ts` (títulos "games" em partida de games).

- [ ] `TournamentMatch.currentGame: {a,b} | null` lido do doc.
- [ ] `LiveScoreFields` inclui `scoringProfile` e `currentGame`; `setClosed` usa `setWinnerSide(m.sets, i, effectiveScoringProfile(m.scoringProfile, m.bestOf)) !== null`.
- [ ] `LiveSetScore` ganha `game: {a: string; b: string} | null` (via `gamesPointLabels` quando o perfil é de games e a fonte é a mesa); `tiebreak: boolean`.
- [ ] Testes RED (spec): games 6-4 + 2-1 ao vivo → wins 1-0, corrente `{setNumber 2, a 2, b 1, game {'40','15'}}` com currentGame {3,1}; 6-6 com currentGame {4,2} → corrente 6-6, game {'4','2'}, tiebreak true; pontos idênticos ao spec existente (`game: null`).
- [ ] `buildGroupStandings` por tipo, como na Task 2; spec novo.
- [ ] GREEN; `ng test organizer`; commit.

### Task 4: portal do atleta — modelo e helpers

**Files:** `frontend/projects/athlete/src/app/data/matches-repository.ts` (modelo: `scoringProfile`, `tb` em `setsFromRaw`, `currentGame`; `setIsWon`, `matchSetWins`, `matchClosedSets`, `matchLiveCurrentSet`, `buildGroupStandings`), specs `data/*.spec.ts`, `category/category-groups.component.*` (rótulo "games").

- [ ] Mesmo contrato da Task 3 (`MatchLiveSetScore.game`, `tiebreak`).
- [ ] `setTargetPointsOf`/`MIN_ADVANTAGE` ficam (cenários do Focus — 2c2).
- [ ] Testes RED/GREEN espelhando a Task 3; `ng test athlete`; commit.

### Task 5: app — `tournament_match_display.dart` e standings

**Files:** `nexago_app/lib/features/tournaments/domain/tournament_match_display.dart`, `tournament_group_standings_logic.dart`, testes `test/features/tournaments/tournament_match_display_test.dart`, `tournament_group_standings_logic_test.dart`, widget de standings (rótulos PF/PT/SP → games quando o grupo é de games).

- [ ] `matchSetIsWonForMatch(match, index)` usando `ScoringRules.effectiveProfile`; `matchClosedSets`/`matchLiveCurrentSet` usam o perfil; `matchLiveCurrentSet` ganha `game` (`({String a, String b})?`) e `tiebreak`.
- [ ] `matchSetIsWon(set, index, bestOf)` e `matchSetTargetPoints` continuam (Focus cenários/formato — 2c2).
- [ ] `setsWonCountForMatch`: games → `ScoringRules.setsWon` (só sets fechados); pontos inalterado.
- [ ] Standings por tipo (Task 2 em Dart).
- [ ] Testes RED/GREEN; `flutter test test/features/tournaments`; commit.

### Task 6: Verificação final e PR empilhado

- [ ] Suítes completas (functions + rules; flutter analyze + test; `ng test` nos cinco portais; codegen `--check`).
- [ ] Revisão final independente; `rm -f functions/node_modules`; push; PR contra `claude/multiesporte-fase-2b2-mesa`.
