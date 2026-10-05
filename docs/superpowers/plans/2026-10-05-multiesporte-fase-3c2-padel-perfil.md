# Multiesporte fase 3c2: padel como esporte de perfil — Implementation Plan

> **Status (05/10/2026): BLOQUEADO.** A medição da Task 1 mostrou que um 10º código na guarda de nível das rules faz toda negação estourar o teto de expressões (ver emenda "Medição de 05/10/2026" no spec). Só o teste de pior caso foi mantido; o resto aguarda decisão sobre reestruturar a guarda.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O atleta escolhe padel no onboarding e no perfil (app e portal), declara nível, e o nível fica protegido pelas rules como os demais esportes. Padel NÃO vira esporte de torneio nesta fase (não há arte de capa; o teste de capa do wizard trava isso).

**Architecture:**
- **Catálogo:** linha `padel`/`PADEL`/`padel`, rótulo "Padel", `art: null`, `support: profile`, `aliases: ["Pádel"]`, `scoringProfile` do spec (sets_games MD3, 6 games, vantagem 2, tie-break 6-6 a 7, no-ad, 3º set completo), antes de `other`. Vetor de resolução: `["padel","padel"]` e um desconhecido novo (`["curling", null]`). Codegen.
- **Rules:** `sportLevelNotLowered(..., 'PADEL', ...)` em `athleteLevelsNotDowngraded`; comentários "9 esportes" → 10. **Medir** o teto: teste novo em `functions/test/athlete-level-rules.test.mjs` subindo os 10 esportes TODOS travados + os dois campos legados (`assertSucceeds`) — o caso que hoje não é medido. `ALL_SPORTS` e `[5, 9]` → `[5, 10]`.
- **Functions:** `ATHLETE_SPORT_CODES` + `PADEL`; `scripts/set-athlete-level.js`; testes que tratavam `padel` como desconhecido passam a usar outro código (`curling`). `RATED_SPORT_CODES`/`GLOBAL_RANKING_SPORT_CODES` sem PADEL.
- **App:** `AthleteOnboardingOptions.sports` ganha `padel` (ícone de raquete) na ordem do catálogo; descoberta (`discoverSportFilterOptions`, `sportFirestoreIdForLabel` no atleta e nas equipes), chips de descoberta e `defaultSportChipFromProfile` (`'PADEL' => ArenaSportChip.padel`). Teste "todo esporte tem arte" passa a isentar `art == null`.
- **Portal:** `ICON_BY_CODE.PADEL = 'racket'`; `sport-chip.ts`: `case 'PADEL'` em `defaultSportChipFromProfile` e `sportFirestoreIdFromChip('padel') = 'PADEL'`; spec da lista exata.

## Global Constraints
- Ordem de deploy: rules antes dos clientes (cliente novo gravando `levelsBySport.PADEL` com rules antigas passa — o mapa não é validado por chave —, mas o nível de padel só fica protegido depois das rules).
- `dart format` só em arquivo novo. Strings PT.

## Review Focus
1. Atleta com os 10 esportes travados sobe todos de uma vez: a escrita passa (teto de 1000 expressões).
2. Atleta com padel travado não consegue rebaixar o nível de padel.
3. Torneio legado com `sport: 'padel'` (sportRaw) passa a mapear para `PADEL` (nível, sorteio, elegibilidade) sem quebrar o wizard (padel continua fora do `TournamentSport`).
4. Onboarding com 10 esportes num grid de 3 colunas não quebra o layout.
5. Descoberta de atletas/equipes filtra por padel.

### Task 1: catálogo, rules (com medição) e functions
### Task 2: app (onboarding, descoberta, chips)
### Task 3: portal do atleta e `sport-chip.ts`
### Task 4: verificação final e PR empilhado sobre a 3c1
