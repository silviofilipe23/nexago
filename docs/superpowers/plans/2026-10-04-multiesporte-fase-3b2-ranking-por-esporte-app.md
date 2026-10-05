# Multiesporte fase 3b2: ranking por esporte no app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A tela Ranking do app e a posição por esporte do perfil público passam a ler os docs por esporte (`athleteRankingsBySport`/`teamRankingsBySport`, fase 3a), espelhando o portal (3b1).

**Architecture:**
- **Dados:** `NexagoArtifactsPaths.athleteRankingsBySportCollection()`/`teamRankingsBySportCollection()`; `AthleteRankingEntry.fromBySportData(docId, data, sportCode)`/`TeamRankingEntry.fromBySportData` (dono do CAMPO; reserva: id sem o sufixo); `buildAthleteRankingRowsForPeriod(entries, year:)`/`buildTeamRankingRowsForPeriod` (geral = total; ano = `pointsByYear[ano]`, sem pontos fica fora, renumera); `athleteLevelRankForSport(profile, sport)` (`levelsBySport[sport]` ?? `level`) e `teamLevelRankForSport`; `rankingSportOptions` (catálogo `competition`) e `defaultRankingSport(primary)`. Repositório: `loadAthleteRankingForSport(sport, {year})`, `loadTeamRankingForSport(sport, {year})`, `loadAthleteSportRanks(athleteId, {year})`.
- **Tela:** `RankingPageFilter.sport` (`null` = esporte principal); `rankingSportProvider` resolve o efetivo (`athleteProfileProvider`); mapper recebe o esporte; folha de filtros ganha a seção ESPORTE (não conta como filtro ativo — aparece no cabeçalho); cabeçalho "Classificação" ganha a linha "Vôlei de praia · 2026"/"· Geral".
- **Perfil público:** `athleteSportRanksProvider` passa a `loadAthleteSportRanks` (beach tennis entra). O método antigo `loadAthleteRankingBySport` (resultados crus + torneios) sai.

**Tech Stack:** Flutter/Dart, Riverpod, flutter_test.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emendas da fase 3 e 3b).

## Global Constraints

- Strings PT; `dart format` só em arquivo novo.
- Demais superfícies (KPI da home, comunidade, hub Competir, minhas competições, equipes) seguem no total somado.
- Deploy do app só depois do backfill (sem reserva pro legado).

## Review Focus

1. Temporada de beach tennis aparece (pelos `pointsByYear`).
2. Atleta com futevôlei como principal abre em Futevôlei; escolha manual vence.
3. Filtro de nível usa o nível do esporte escolhido; sem ele, o global.
4. "Limpar" da folha não troca o esporte para outro sem o atleta pedir (volta ao principal).
5. Perfil público: posição em beach tennis aparece; esporte sem pontos no ano fica com travessão.

---

### Task 1: dados por esporte
**Files:** `tournaments/data/nexago_artifacts_paths.dart`, `ranking/domain/ranking_models.dart`, `ranking/domain/ranking_logic.dart`, `ranking/data/ranking_repository.dart` (+ testes em `test/features/ranking/ranking_models_test.dart`, `ranking_logic_test.dart`).
- [ ] RED/GREEN; commit.

### Task 2: tela Ranking com esporte
**Files:** `ranking_list_models.dart`, `ranking_providers.dart`, `ranking_list_mapper.dart`, `ranking_filters_sheet.dart`, `ranking_classification_header.dart`, `athlete_ranking_page.dart` (+ testes de mapper, folha e cabeçalho).
- [ ] RED/GREEN; commit.

### Task 3: posição por esporte no perfil público
**Files:** `athlete/domain/athlete_public_profile_providers.dart`, `ranking_repository.dart`.
- [ ] RED/GREEN (lógica pura de posição por esporte); commit.

### Task 4: Verificação final e PR empilhado
- [ ] `flutter test` (conferir `[E]`), `flutter analyze` nos arquivos tocados; revisão independente; PR contra `claude/multiesporte-fase-3b1-ranking-portais`.
