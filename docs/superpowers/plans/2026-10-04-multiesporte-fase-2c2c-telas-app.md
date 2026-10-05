# Multiesporte fase 2c2c: Focus, cards, chave e pôster (app) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O app mostra partida de games como beach tennis nas telas de exibição: card de partida do Focus (e os que o reusam: arena, seguindo, página pública, palpites), linha ao vivo do Focus, pílulas do card da lista e da chave, pôster de partida, card de campanha, números da campanha e cenários de classificação.

**Architecture:** Espelho da 2c2b no app. A 2c1 deixou `tournament_match_display.dart` decidindo pelo perfil e expondo `game`/`tiebreak` em `matchLiveCurrentSet`. Aqui: (1) `superTiebreak` no set ao vivo, `matchClosedSetTexts`, `matchClosedDisplaySets` e `matchDisplaySets` com super tie-break em pontos; (2) `liveScoreLineOf` e `focusMatchCardScoreOf` com o ponto do game; (3) pôster e campanha com sets de exibição e parciais na ótica do atleta; (4) `tournamentNumbersOf.unit` e rótulos; (5) `winBoundsOf(bestOf, profile)` de games.

**Tech Stack:** Flutter/Dart, `core/sports` (`ScoringRules.setScoreText`, `LiveGames`).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emendas 2c; 2c2c = app).

## Global Constraints

- Partida de pontos: ZERO mudança de texto ou valor; testes existentes intactos.
- Super tie-break encerrado aparece como os pontos dele ("10-8"); em andamento, o set 0-0 não aparece como placar.
- Ao vivo em games: o centro do card é o ponto do game ("40-15") e a linha fina traz sets e games ("SETS 1-0 · 5-4").
- `dart format` só em arquivo novo, com o dart do Flutter.

## Review Focus

1. `focusMatchCardScoreOf` de pontos idêntico; de games ao vivo centro "40-15", detalhe "SETS 1-0 · 5-4"; super tie-break centro "7-5", detalhe "SETS 1-1 · SUPER TIE-BREAK".
2. `liveScoreLineOf` (Focus) de games "1–0 · 2º set 5-4 · 40-15".
3. Pílulas (lista e chave) de games encerrada com super tie-break: 6-4 · 3-6 · 10-8.
4. Pôster e campanha sem "1-0" de super tie-break.
5. `winBoundsOf` de games passa em `ScoringRules.validate`.

---

### Task 1: helpers de exibição

**Files:** `lib/features/tournaments/domain/tournament_match_display.dart`, teste `test/features/tournaments/tournament_match_display_games_test.dart`.

- [ ] RED/GREEN: `superTiebreak` no record de `matchLiveCurrentSet`; `matchClosedSetTexts`; `matchClosedDisplaySets`; `matchDisplaySets` com super tie-break em pontos (fechado) e em andamento pelos pontos do `currentGame`.
- [ ] Commit.

### Task 2: Focus — card de partida e linha ao vivo

**Files:** `domain/focus/focus_match_card_view.dart`, `domain/focus/focus_views_logic.dart`, testes `test/features/tournaments/focus/focus_match_card_view_test.dart`, `focus_views_logic_test.dart`.

- [ ] RED/GREEN conforme Review Focus 1–2; parciais encerradas com `matchClosedSetTexts`.
- [ ] Commit.

### Task 3: pôster e campanha

**Files:** `athlete/domain/match_history/match_share_poster_builder.dart`, `tournaments/domain/focus/campaign_share_data.dart`, testes existentes desses builders.

- [ ] Sets do pôster com super tie-break em pontos; parciais da campanha na ótica do atleta com `setScoreText`.
- [ ] RED/GREEN; commit.

### Task 4: números da campanha e cenários

**Files:** `domain/focus/focus_journey_logic.dart` (`TournamentNumbers.unit`), `presentation/focus/widgets/focus_tournament_numbers.dart` (rótulos), `domain/focus/focus_scenarios.dart` (`winBoundsOf(bestOf, [profile])`), testes.

- [ ] Mesma regra da 2c2b (web): unidade games; limites 6-0 / 0-6 + 7-6 (tb) / super tie-break 1-0 (tb 10-8) / sem tie-break `gamesPerSet` × `gamesPerSet − winByGames`.
- [ ] RED/GREEN; commit.

### Task 5: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c2b-atleta`.
