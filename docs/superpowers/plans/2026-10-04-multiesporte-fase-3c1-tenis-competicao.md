# Multiesporte fase 3c1: tênis em competição — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador cria torneio e liga de tênis (dupla) no app e no painel, com placar de tênis sugerido nas categorias e ranking só por esporte.

**Architecture:** Mesmo molde da 2d1 (beach tennis): `sports/catalog.json` sobe `tennis` para `competition` e o codegen propaga; `TournamentSport` (Dart) e o tipo/lista `KNOWN_TOURNAMENT_SPORTS` (painel) ganham `tennis` na ordem do catálogo. Os testes de paridade enum × catálogo (já existentes) são o RED. Listas derivadas (filtro de esporte do ranking no app e no portal) passam a incluir `TENIS`.

**Tech Stack:** catálogo + codegen, Flutter, Angular, functions.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda da fase 3c).

## Global Constraints

- KOTC só em vôlei de praia; `GLOBAL_RANKING_SPORT_CODES` inalterado (tênis não alimenta o legado).
- `dart format` só em arquivo novo.

## Review Focus

1. Categoria nova de tênis nasce com o perfil do catálogo (games, com vantagem, 3º set completo) nas duas superfícies.
2. Torneio de beach tennis/vôlei existente: nada muda (ordem do enum não é persistida por índice).
3. Formatos oferecidos para tênis não incluem KOTC.
4. Placar de tênis no servidor: categoria sem perfil explícito recebe o perfil do catálogo.
5. Torneio legado com `sport: 'tennis'` gravado antes (via `sportRaw`) agora abre como tênis, sem perder o valor.

---

### Task 1: catálogo e tipos dos wizards
**Files:** `sports/catalog.json` (+ gerados), `nexago_app/lib/features/organizer/domain/tournament_create/tournament_create_draft.dart`, `frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts`, testes de ranking que travam a lista de esportes (app e portal), teste do servidor para o perfil de tênis.
- [ ] RED (paridade enum × catálogo falha após o catálogo) → GREEN; commit.

### Task 2: Verificação final e PR empilhado
- [ ] codegen --check, functions, rules, flutter, ng (organizer, athlete); revisão independente; PR contra `claude/multiesporte-fase-3b2-ranking-app`.
