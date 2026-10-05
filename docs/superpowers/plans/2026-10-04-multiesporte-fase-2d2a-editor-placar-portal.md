# Multiesporte fase 2d2a: editor de placar da categoria (portal) e alvos por esporte — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** No portal do organizador, cada categoria mostra e grava o placar do seu tipo: em pontos, "Set até" e "Decisivo até" (sugestões 21/15 vôlei de praia, 25/15 vôlei de quadra, 18/15 futevôlei); em games, "Sem vantagem" e "Set decisivo" (super tie-break ou completo). Categoria existente sem perfil continua sem perfil (regra histórica) até o organizador mexer no placar.

**Architecture:** O catálogo passa a ter os padrões 25/15 (quadra) e 18/15 (futevôlei). O fallback do servidor para categoria SEM perfil continua histórico nos esportes de pontos (`categoryScoringProfile` só usa o padrão do catálogo em games), então nada que já existe muda de alvo. No portal, a categoria NOVA nasce com o perfil sugerido do esporte (o do catálogo com o `bestOf` da categoria); a categoria carregada sem perfil fica sem até o organizador editar o placar; trocar o esporte refaz o perfil das categorias que têm um; o `bestOf` gravado no perfil acompanha o da categoria no save.

**Tech Stack:** catálogo + codegen, Cloud Functions, Angular (organizer).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda 2d1/2d2; a 2d2 sai em duas — portal 2d2a, app 2d2b — emenda neste PR).

## Global Constraints

- Categoria sem `scoringProfile` (qualquer torneio existente) carimba a regra histórica nos esportes de pontos — sem mudança.
- Perfil gravado só quando a categoria é nova ou o organizador edita o placar.
- `bestOf` do perfil = `bestOf` da categoria (1, 3 ou 5) na gravação.
- Strings PT na UI.

## Review Focus

1. Torneio de vôlei de quadra antigo reeditado sem tocar no placar: categoria continua sem perfil (21 histórico).
2. Categoria nova de vôlei de quadra: perfil 25/15; de futevôlei: 18/15; de beach tennis: games com super tie-break.
3. Trocar o esporte depois de criar categoria: o perfil acompanha o novo esporte.
4. Set único: "Decisivo até"/"Set decisivo" escondidos; perfil com `bestOf` 1.
5. Servidor: categoria sem perfil em vôlei de quadra/futevôlei carimba 21/15; com perfil explícito, o explícito.

---

### Task 1: catálogo e fallback do servidor

**Files:** `sports/catalog.json` (indoorVolleyball 25/15, footvolley 18/15), gerados, `functions/src/match-scoring.ts` (`categoryScoringProfile`), `functions/src/organizer-category-ops.bracket-best-of.test.ts` ou `match-scoring` test.

- [ ] RED: categoria sem perfil em vôlei de quadra → `setTarget` 21; em beach tennis → games; explícito prevalece.
- [ ] GREEN: fallback = catálogo só quando o padrão é de games; senão histórico (`legacyScoringProfile(DEFAULT_BEST_OF)` com o `bestOf` da categoria).
- [ ] Commit.

### Task 2: modelo do portal

**Files:** `painel/data/tournament-create.model.ts` (helpers `suggestedScoringProfile(sport, bestOf)`, `categoryScoringView(category, sport)`, `withScoringPatch(...)`), `tournament-create-mapper.ts` (bestOf do perfil sincronizado no save), `organizer-settings.model.ts` (`applyOrganizerCategoryDefaults` dá o perfil sugerido à categoria nova), specs.

- [ ] RED/GREEN: sugestões por esporte; visão efetiva de categoria sem perfil = histórico; patch de pontos/games; troca de esporte refaz o perfil; save sincroniza `bestOf`.
- [ ] Commit.

### Task 3: tela

**Files:** `eventos/wizard/criar-torneio.component.ts` (bloco "Placar" no card da categoria; `setSport` refaz perfis), `eventos/wizard/criar-liga.component.ts` se houver editor de categoria.

- [ ] Steppers "Set até"/"Decisivo até" (pontos) e toggle "Sem vantagem" + chips "Set decisivo" (games); some o decisivo em set único.
- [ ] Spec de componente mínimo ou cobertura pelos helpers; commit.

### Task 4: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2d1-abrir-beach-tennis`.
