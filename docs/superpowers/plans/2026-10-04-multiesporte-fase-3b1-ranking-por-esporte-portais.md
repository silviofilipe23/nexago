# Multiesporte fase 3b1: ranking por esporte nos portais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A página Ranking do portal do atleta e o card de entrevista da transmissão passam a ler os docs por esporte (`athleteRankingsBySport`/`teamRankingsBySport`, fase 3a).

**Architecture:**
- **Portal do atleta** (`data/rankings-repository.ts`): `fetchAthleteRankingBySport`/`fetchTeamRankingBySport(db, projectId, sportCode)` com `where('sport','==',code)`; linha = `{id (do campo athleteId/teamId; reserva: id do doc sem o sufixo), totalPoints, tournamentsCount, pointsByYear}`; puro `rankingBySportRowFromDoc` e `pointsForPeriod(row, period, year)` (geral = total; temporada = `pointsByYear[ano]`).
- Página: filtro de esporte por código de perfil (`sportsWithSupport('competition')` de `@nexago/sports`), padrão = `primarySportId` do próprio perfil se de competição, senão `VOLEI_PRAIA`; `loadRanking(mode, period, sport)`; temporada sem pontos no ano fica fora; `rankParticipants` deixa de filtrar esporte (o dado já é do esporte) — `RankingSlice.sport` e `RankingParticipant.sport` saem. Nível por esporte: `AthletePublicProfile.levelsBySport` e `levelForSport(profile, sport)`.
- **Painel** (`painel/data/rankings-repository.ts`): `fetchRankingParticipants(db, projectId, sportCode)` — com código lê as coleções por esporte (todo participante com `sport = code`), `null` lê o legado como hoje. `TransmissaoDataService.ensureRanking()` usa `tournamentSportToLevelSportCode(tournament.sportId)` e só lê depois do torneio carregado; recarrega se o esporte mudar.

**Tech Stack:** Angular 20 (signals), Karma/Jasmine.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emendas da fase 3 e 3b).

## Global Constraints

- Strings em PT; nada de `ngClass`/`ngStyle`; signals.
- Legado continua sendo lido pelas demais superfícies (painel do atleta, comunidade, equipes).
- Doc por esporte: o id do atleta/equipe vem do CAMPO, nunca do `doc.id` (`{id}_{CODE}`).

## Review Focus

1. Temporada de beach tennis: aparece pelos `pointsByYear` (sem `tournamentCategoryResults`).
2. Atleta com futevôlei como principal: filtro abre em Futevôlei (o chip antigo caía em vôlei de praia).
3. Nível da linha é o do esporte filtrado; sem nível no esporte usa o global.
4. Card de entrevista em torneio de beach tennis: posição entre os atletas de beach tennis; torneio desconhecido: total somado.
5. Troca de esporte não mistura resposta atrasada da leitura anterior na lista.

---

### Task 1: dados por esporte no portal do atleta
**Files:** `frontend/projects/athlete/src/app/data/rankings-repository.ts` (+ spec), `data/public-profiles-repository.ts` (`levelsBySport`), `data/my-athlete-profile-repository.ts` (`primarySportId`).
- [ ] RED/GREEN: `rankingBySportRowFromDoc` (id do campo e reserva), `pointsForPeriod`, `levelForSport`; commit.

### Task 2: página Ranking com filtro por esporte
**Files:** `ranking/athlete-ranking.component.ts|html`, `athlete-ranking.models.ts`, `athlete-ranking.selectors.ts` (+ spec).
- [ ] RED/GREEN: `rankParticipants` sem filtro de esporte; `defaultRankingSport(primarySportId)`; descarte de resposta atrasada (geração); commit.

### Task 3: card de entrevista pelo esporte do torneio
**Files:** `frontend/projects/organizer/src/app/painel/data/rankings-repository.ts` (+ spec), `painel/transmissao/transmissao-data.service.ts`.
- [ ] RED/GREEN: participantes por esporte com id do campo e `sport` = código; `rankingSportOf(tournament)` (undefined = ainda não carregado); commit.

### Task 4: Verificação final e PR empilhado
- [ ] `ng test` athlete e organizer + build dos dois; revisão independente; PR contra `claude/multiesporte-fase-3a-ranking-servidor`.
