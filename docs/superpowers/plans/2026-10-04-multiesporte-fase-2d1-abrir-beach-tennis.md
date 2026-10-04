# Multiesporte fase 2d1: abrir beach tennis com segurança — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador consegue criar torneio e liga de beach tennis no app e no portal; as partidas nascem com o perfil de games; nada que já existe muda; e o que ainda não está pronto para outro esporte fica travado (ranking geral, KOTC).

**Architecture:** `beachTennis` sobe para `competition` no catálogo e entra por último nos dois enums de esporte de torneio (os testes de paridade comparam com a ordem do catálogo). Os dois wizards regravam o array de categorias inteiro, então o `scoringProfile` da categoria passa a ser lido e regravado cru (ida e volta). O servidor já carimba o padrão do catálogo quando a categoria não tem perfil. O ranking geral só aceita esportes que já pontuavam (vôlei de praia, de quadra, futevôlei, ou sem esporte reconhecido); o KOTC só aparece/publica em vôlei de praia.

**Tech Stack:** catálogo + codegen, Cloud Functions, Angular (organizer), Flutter.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda 2d1/2d2 deste PR).

## Global Constraints

- Torneios existentes (vôlei de praia, quadra, futevôlei) sem nenhuma mudança: mesmo carimbo, mesmo ranking, mesmo wizard.
- Grafia crua desconhecida (`sportRaw`) continua travando o seletor e nunca é regravada.
- `scoringProfile` de categoria: lido e regravado cru; categoria sem perfil continua sem perfil.
- Strings PT na UI; `dart format` só em arquivo novo.

## Review Focus

1. Reeditar no app ou no portal um torneio cuja categoria tem `scoringProfile` mantém o perfil.
2. Torneio de beach tennis: a chave carimba `sets_games` com o `bestOf` da categoria.
3. Ranking geral: beach tennis (avulso ou etapa de liga) não pontua; vôlei de praia/quadra/futevôlei e torneio sem esporte reconhecido pontuam como hoje.
4. KOTC: some das opções e bloqueia a publicação fora do vôlei de praia; rascunho antigo de KOTC em vôlei de praia segue publicável.
5. Testes que usavam `beachTennis` como esporte desconhecido passam a usar `padel`.

---

### Task 1: catálogo e servidor

**Files:** `sports/catalog.json`, gerados (`node sports/codegen.mjs`), `functions/src/tournament-ranking.ts` (+ teste), `functions/src/organizer-category-ops.bracket-best-of.test.ts` (caso de beach tennis já existe — conferir).

- [ ] `beachTennis.support = "competition"`; codegen.
- [ ] `isGlobalRankingEligible({..., sportCode})`: falso quando `sportCode` não é `null` nem um de `VOLEI_PRAIA`, `VOLEI_QUADRA`, `FUTEVOLEI` (constante `GLOBAL_RANKING_SPORT_CODES`, até a fase 3); vale também para etapa de liga. Chamada passa `tournamentSportToLevelSportCode(tournament.sport)`.
- [ ] RED/GREEN; `npm test`; commit.

### Task 2: portal do organizador

**Files:** `painel/data/tournament-create.model.ts`, `tournament-create-mapper.ts`, `league-create.model.ts`, `eventos/wizard/criar-torneio.component.ts`, specs (`tournament-create.sport-raw.spec.ts`, `league-create.spec.ts`, `tournament-create.sports-catalog.spec.ts`, novo spec de ida e volta do perfil e de KOTC).

- [ ] `TournamentSport` + `KNOWN_TOURNAMENT_SPORTS` com `beachTennis` por último; rótulo "Beach Tennis".
- [ ] `TournamentCategoryDraft.scoringProfile?: Record<string, unknown> | null` lido em `categoryFromMap` e regravado em `categoryToMap`/`leagueCategoryToMap` quando presente.
- [ ] KOTC: `bracketOptions` sem `kingOfCourt` fora do vôlei de praia; `publishBlockReason…` bloqueia categoria KOTC em outro esporte com mensagem "KOTC só em vôlei de praia por enquanto".
- [ ] Specs que usavam `beachTennis` como desconhecido → `padel`.
- [ ] RED/GREEN; `ng test organizer`; commit.

### Task 3: app

**Files:** `domain/tournament_create/tournament_create_draft.dart` (enum, `TournamentCategoryDraft.scoringProfileRaw`), `domain/tournament_create/tournament_create_logic.dart` (rótulo, bloqueio KOTC), `data/tournament_create_mapper.dart`, `data/league_create_mapper.dart`, `data/league_stage_tournament_factory.dart`, sessões locais, telas de identidade (seletor), testes.

- [ ] Enum com `beachTennis` por último; `sportLabel` "Beach Tennis".
- [ ] `scoringProfileRaw` lido/regravado nos mappers e sessões.
- [ ] KOTC só em vôlei de praia (opção e bloqueio de publicação).
- [ ] Testes que usavam `beachTennis` como desconhecido → `padel`.
- [ ] RED/GREEN; `flutter test`; commit.

### Task 4: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c3b-notificacao`.
