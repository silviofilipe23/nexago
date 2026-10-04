# Multiesporte fase 2c2b: Focus, chave, listas, detalhe e compartilhamento (portal do atleta) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O portal do atleta mostra partida de games como beach tennis em todas as telas que leem placar: linha ao vivo com o ponto do game, parciais com tie-break por extenso, super tie-break com os pontos dele, números da campanha em games e cenários de classificação com placares legais de games.

**Architecture:** A 2c1 deixou `data/matches-repository.ts` decidindo pelo perfil e expondo `game`/`tiebreak` no set ao vivo. Aqui: (1) helpers de texto em `tournament-format.ts` (`partialsLabelOf` com perfil, `liveScoreLineOf` com o ponto do game) e `displaySetsOf` (super tie-break em pontos, `game` no set em andamento) — eles alimentam Focus, detalhe, lista de jogos, chave, mesa e share; (2) `mesaScoreLabel` com o ponto do game; (3) share card e campanha usam os sets de exibição; (4) números da campanha (`tournamentNumbersOf`) ganham a unidade (pontos × games); (5) `winBoundsOf` gera limites legais de games (6-0 / 0-6 + 7-6 + super tie-break 1-0).

**Tech Stack:** Angular (athlete), `@nexago/sports`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emendas 2c; 2c2b = portal do atleta).

## Global Constraints

- Partida de pontos: ZERO mudança de texto ou valor; specs existentes intactos.
- Super tie-break encerrado aparece como os pontos dele ("10-8"), nunca "1-0".
- Ao vivo em games, o ponto do game aparece depois dos games ("5-4 · 40-15").
- Cenários do Focus em grupo de games só simulam placares legais pelo perfil.

## Review Focus

1. `liveScoreLineOf` de pontos idêntico ("1–0 · 2º set 14-11"); de games "1–0 · 2º set 5-4 · 40-15"; tie-break "6-6 · 4-2".
2. `displaySetsOf` em games 0-0 no set novo com game 15-0: mostra o set em andamento.
3. Share card de games encerrada com super tie-break: parciais "6-4 · 3-6 · 10-8".
4. Focus "Pontos"/"Pontos por set" viram "Games"/"Games por set" em campanha de games; pontos igual.
5. `winBoundsOf` de games: limites são placares que `validateScoreSets` aceita.

---

### Task 1: textos e sets de exibição

**Files:** `data/matches-repository.ts` (exportar `matchScoringProfile`), `tournaments/tournament-format.ts`, `tournaments/tournament-live.selectors.ts` (`displaySetsOf`), `mesa/mesa-matches.selectors.ts`, specs (`tournament-format.spec.ts`, `tournament-live.selectors.spec.ts`, `mesa/mesa-matches.selectors.spec.ts`).

- [ ] RED/GREEN: `closedPartialsLabelOf` com `setScoreText`; `liveScoreLineOf` com ` · 40-15` em games; `DisplaySet.game?` e super tie-break em pontos; `mesaScoreLabel` "1×0 · 5-4 · 40-15".
- [ ] Commit.

### Task 2: share e campanha

**Files:** `tournaments/match/match-share-dialog.component.ts`, `match-share-card.ts`, `campaign/campaign-share.ts`, specs.

- [ ] Sets do card com super tie-break em pontos; parciais com tie-break por extenso (onde o card desenha texto).
- [ ] RED/GREEN; commit.

### Task 3: números da campanha e cenários do Focus

**Files:** `tournaments/focus/focus-journey.ts` (`tournamentNumbersOf.unit`), `focus/journey/focus-journey.component.html` (rótulos), `focus/focus-scenarios.ts` (`winBoundsOf(bestOf, profile?)`), specs.

- [ ] `unit: 'pontos' | 'games'` (games se alguma partida da campanha é de games); rótulos "Games"/"Games por set".
- [ ] `winBoundsOf` de games: widest = `setsToWin` × {gamesPerSet, 0}; narrowest = perdidos {0, gamesPerSet}, vencidos com a margem mínima ({tbAt+1, tbAt} com `tb` quando há tie-break; senão {gamesPerSet, gamesPerSet − winByGames}), decisivo em super tie-break = {1, 0, tb {superTiebreakTo, superTiebreakTo − 2}}. Teste: `validateScoreSets` aceita os dois limites.
- [ ] RED/GREEN; commit.

### Task 4: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c2a-painel`.
