# Multiesporte fase 2d2b: número de sets e placar da categoria no app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O editor de categoria do app ganha "Melhor de" (set único / MD3) e o bloco "Placar" do tipo do esporte — mesma regra do portal (2d2a): categoria nova nasce com o perfil sugerido do esporte; categoria sem perfil continua sem até o organizador mexer no placar; trocar o esporte refaz o perfil de quem tem; o `bestOf` do perfil acompanha o da categoria no save.

**Architecture:** Helpers puros em `domain/tournament_create/tournament_create_logic.dart` espelhando os do portal (`profileBestOf`, `suggestedScoringProfile`, `categoryScoringView`, `patchCategoryScoring`, `withSportScoring`), sobre `ScoringRules.profileFromRaw` e o catálogo; o perfil fica cru em `scoringProfileRaw` (2d1), agora com `copyWith` capaz de gravá-lo. Editor de categoria (torneio) usa `OrganizerSegmentedControl` para "Melhor de" e "Set decisivo", `OrganizerNumericStepper` para os alvos, `OrganizerSwitchRow` para "Sem vantagem". `setSport` do provider passa as categorias por `withSportScoring` (só refaz perfil de tipo diferente, como na 2d2a). Mapper sincroniza o `bestOf` do perfil.

**Tech Stack:** Flutter/Dart.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emendas 2d).

## Global Constraints

- Torneios existentes sem mudança: categoria sem perfil continua sem perfil.
- `bestOf` do perfil = 1 (set único) ou 3 (MD3/MD5), como o servidor.
- Strings PT; `dart format` só em arquivo novo.

## Review Focus

1. Categoria nova em vôlei de quadra: perfil 25/15 gravado; beach tennis: games com super tie-break.
2. Categoria carregada sem perfil, reeditada sem tocar no placar: segue sem perfil; editar parte de 21/15.
3. Trocar o esporte: perfil das categorias acompanha.
4. Set único esconde o decisivo; o perfil gravado sai com `bestOf` 1.
5. Categoria gravada pelo portal (com perfil) reeditada no app: preserva e sincroniza `bestOf`.

---

### Task 1: helpers e modelo

**Files:** `tournament_create_logic.dart`, `tournament_create_draft.dart` (`copyWith(scoringProfileRaw:)` com sentinela para limpar), `tournament_create_providers.dart` (`setSport` refaz perfis; `addCategory` aplica sugestão se a categoria nova não tiver perfil), `data/tournament_create_mapper.dart` (sincroniza `bestOf`), testes.

- [ ] RED/GREEN espelhando `tournament-create.scoring.spec.ts`; commit.

### Task 2: editor de categoria

**Files:** `presentation/tournament_create/sheets/tournament_category_editor_sheet.dart` (seção "Sets e placar"), widget test.

- [ ] "Melhor de" (Set único / MD3); pontos: "Set até" e "Set decisivo até" (MD3); games: "Sem vantagem" e "Set decisivo" (MD3).
- [ ] Widget test: categoria nova de vôlei de quadra mostra "Set até 25"; beach tennis mostra "Sem vantagem"; commit.

### Task 3: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2d2-editor-placar` (2d2a). Mesma regra de troca de esporte da 2d2a: só refaz perfil de outro tipo.
