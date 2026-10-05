# Multiesporte fase 2c3a: ponto a ponto de partida de games (portal do atleta e app) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A timeline ponto a ponto do detalhe da partida (portal do atleta e app) lê partidas de games: cada ponto mostra games do set e o ponto do game ("4-3 · 30-15"), o ponto que fecha o game mostra só os games, o super tie-break mostra os pontos corridos, o selo "fecha o set" segue a regra de games e as pendências são contadas em games.

**Architecture:** O evento de ponto de games (2b2) grava `scoreA/scoreB` (games do set depois do lance) e `gameA/gameB` (ponto do game depois do lance). Um texto canônico do lance (`gamesEventText`) entra no núcleo nas duas linguagens com vetores compartilhados; a timeline web (`match-point-by-point.ts`) e a do app (`match_detail_play_by_play_logic.dart`) usam esse texto, deduplicam pelo par (set, game) e, em games, não anotam empate/virada (a contagem de games não é a de pontos) e contam pendência em games.

**Tech Stack:** TS (`@nexago/sports`), Angular (athlete), Dart.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda 2c: 2c3 = ponto a ponto + notificação; esta é a 2c3a, ponto a ponto; a notificação é a 2c3b).

## Global Constraints

- Partida de pontos: ZERO mudança na timeline (mesmos pontos, anotações, selos, pendências).
- Nunca inventar ponto: o app não completa timeline de games com pontos estimados.
- Texto na ótica das colunas (lado do atleta à esquerda).

## Review Focus

1. Dois eventos com os mesmos games mas game diferente (15-0 → 30-0) são dois pontos, não escrita repetida.
2. Ponto que fecha o game: texto só com os games ("5-4"); que fecha o set: selo "fecha o set".
3. Super tie-break: texto só com os pontos ("7-5"); fecha o set em 10-8.
4. Pendência em games conta games sem registro, com a unidade certa na tela.
5. Partida de pontos: timeline idêntica.

---

### Task 1: `gamesEventText` no núcleo, com vetores

**Files:** `sports/scoring-vectors.json` (`eventTextVectors`), `sports/codegen.mjs`, `frontend/shared/sports/live-games.ts`, `nexago_app/lib/core/sports/live_games.dart`, testes de vetores (`frontend/projects/organizer/src/app/painel/data/live-games.spec.ts`, `nexago_app/test/core/sports/live_games_test.dart`).

- [ ] `gamesEventText(profile, setIndex, set, game)`: game 0-0 → `"${a}-${b}"`; super tie-break → `"${game.a}-${game.b}"`; demais → `"${a}-${b} · ${labels}"` (labels por `gamesPointLabels` com o estado do set).
- [ ] Vetores: 0-0 com game 15-0 → "0-0 · 15-0"; 3-2 com 40-40 sem no-ad → "3-2 · 40-40"; 4-3 com AD → "4-3 · AD-40"; 5-4 com 0-0 → "5-4"; 6-6 com 4-2 → "6-6 · 4-2"; super tie-break 0-0 com 7-5 → "7-5"; super tie-break fechado 1-0 com 0-0 → "1-0".
- [ ] RED/GREEN nas duas; commit.

### Task 2: timeline web

**Files:** `frontend/projects/athlete/src/app/tournaments/match/match-point-by-point.ts` (+ spec), template do detalhe se o texto/unidade aparecerem.

- [ ] `PointRow.text?: string` em games; dedup por (left, right, gameLeft, gameRight); `closesSet` por `setWinnerSide` do perfil; anotações só em pontos; `missingCount` em games = games do placar − games fechados gravados; `PointByPointSet.missingUnit`.
- [ ] RED/GREEN; commit.

### Task 3: timeline do app

**Files:** `nexago_app/lib/features/athlete/domain/match_history/match_detail_play_by_play_logic.dart`, modelos e widget que desenham o placar do ponto, testes.

- [ ] Mesmo contrato: texto do lance em games, sem completar com pontos estimados.
- [ ] RED/GREEN; commit.

### Task 4: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c2c-app`.
