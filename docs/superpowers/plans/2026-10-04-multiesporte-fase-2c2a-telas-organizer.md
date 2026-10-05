# Multiesporte fase 2c2a: telão, overlay, página pública e chave (painel web) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** As telas de exibição do portal do organizador mostram partida de games como beach tennis: games do set, ponto do game (0/15/30/40/AD, tie-break), alerta de set/match point pela regra de games e sets com tie-break por extenso.

**Architecture:** A 2c1 já deixou `live-set-display.ts` decidindo pelo perfil e expondo `game`/`tiebreak`. Aqui as telas consomem: (1) `pointAlertOf` usa `gamesFlag` quando a partida é de games; (2) `overlayViewOf` ganha `gameA/gameB` e `statusLabel`, e a coluna do set ao vivo passa a ter os games; (3) o card do telão e o card público mostram os games do set corrente como coluna e o ponto do game no lugar dos pontos; (4) `scoreOf` (placar em texto da chave, jogos, grupos, agenda e página pública) e os rótulos de campeões/final usam `setScoreText`.

**Tech Stack:** Angular (organizer), `@nexago/sports`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda 2c1/2c2/2c3; esta é a 2c2 do painel — a emenda deste PR divide a 2c2 por plataforma: 2c2a painel, 2c2b portal do atleta, 2c2c app).

## Global Constraints

- Partida de pontos: ZERO mudança visual ou de valor. Specs existentes intactos.
- Partida de games: número grande = ponto do game; os games do set em andamento aparecem como coluna/célula de set ao vivo.
- Alerta de set/match point em games só quando o PRÓXIMO ponto fecha o set/partida (`gamesFlag`).
- Strings PT na UI.

## Review Focus

1. Partida de pontos no telão/overlay/público: mesmos números, mesmo alerta, mesmo rótulo de status ("Set N · até 21", "Tie-break").
2. Games em 5-4, 40-15 sacando: "SET POINT" só para quem está em 40; em 6-5/AD no 3º set de MD3 sem super tie-break, MATCH POINT.
3. Super tie-break: rótulo "Super tie-break", pontos corridos, coluna do set mostra "10-8" encerrado.
4. Placar textual (`scoreOf`) de games encerrada: "6-4, 6-7 (5-7), 10-8".
5. Overlay final (`overlay-final.ts`) e campeões do telão sem `tb` perdido.

---

### Task 1: alerta de set/match point por perfil

**Files:** `painel/telao/telao-final-mode.ts` (`pointAlertOf`), `telao-final-mode.spec.ts`.

- [ ] RED: games 5-4 em 40-15 (currentGame {3,1}) → `{side:'A', kind:'set'}`; 5-4 em 15-40 → null (o ponto de B fecha só o game); 6-6 em tie-break 6-5 → `{side:'A', kind:'set'}`; MD3 com 1-0 em sets e 5-4/40-0 → `{side:'A', kind:'match'}`. Pontos: casos existentes intactos.
- [ ] GREEN: se `effectiveScoringProfile(m.scoringProfile, m.bestOf).kind === 'sets_games'`, monta o estado (`sets`, `currentSetIndex`, `currentGame`, `servingTeamId`) e usa `gamesFlag` dos dois lados; desempate igual ao de hoje (quem lidera o game).
- [ ] Commit.

### Task 2: overlay

**Files:** `publico/overlay/overlay-selectors.ts` (+ spec), `overlay-scoreboard.component.ts` (+ spec), `overlay-final.ts` (+ spec).

- [ ] `OverlayDuelView` ganha `gameA/gameB: string | null` e `statusLabel: string`; em games `pointsA/B` = ponto do game (string) — decisão: manter `pointsA/B` numérico (games do set) e o template mostra `gameA ?? pointsA` no número grande; a coluna do set ao vivo recebe os games.
- [ ] `statusLabel`: pontos = texto de hoje (`Set N · até T` / `Tie-break`); games = `Set N · até 6 games`, `Tie-break`, `Super tie-break`.
- [ ] `overlay-final.ts` `duelo`: parciais com `setScoreText`.
- [ ] RED/GREEN nos specs; commit.

### Task 3: telão e página pública

**Files:** `painel/telao/telao-court-card.component.ts`, `telao-champions.component.ts` (setsLabel), `telao-final-mode.component.ts`, `publico/public-court-card.component.ts`, specs.

- [ ] Em games: coluna do set ao vivo com os games; número grande com o ponto do game.
- [ ] Campeões/final: parciais com `setScoreText`.
- [ ] RED/GREEN; commit.

### Task 4: placar textual da chave e listas

**Files:** `painel/data/matches-repository.ts` (`scoreOf`), `chaveamento/chaveamento.component.ts` (`setsWonOf`/`sideScore` por perfil), specs.

- [ ] `scoreOf(sets, resultA, resultB, profile)` usa `setScoreText` por set; pontos idêntico.
- [ ] `setsWonOf` do card da chave conta pelo perfil (super tie-break `{1,0}` já conta; ao vivo não conta o set em curso em games).
- [ ] RED/GREEN; commit.

### Task 5: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c1-exibicao`.
