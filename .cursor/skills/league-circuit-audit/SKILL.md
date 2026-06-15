---
name: league-circuit-audit
description: Checklist de auditoria para ligas — wizard C1-C6, etapas D1-D3, league_stage_tournament_factory e visibilidade atleta no NexaGO.
---

# League Circuit Audit

Modo **read-only**. Formato: `.cursor/skills/tournament-league-audit/SKILL.md`.

## Mapa de arquivos

| Camada | Path |
|--------|------|
| League wizard | `nexago_app/lib/features/organizer/presentation/league_create/` |
| Stage wizard | `league_stage_create/` |
| Domain | `league_create_logic.dart`, `league_stage_create_logic.dart` |
| Data | `organizer_leagues_repository.dart`, `league_create_mapper.dart` |
| Factory | `league_stage_tournament_factory.dart` |
| Athlete | `league_detail_page.dart`, `leagues_repository.dart`, `league_document_mapper.dart` |
| Rules | `firestore.rules` → `leagues/{id}` |

## Checklist happy path

1. Criar liga C1–C6 → `leagues/{id}` com `stages[]`, `listingStatus`.
2. Publicar liga cria torneios por etapa (se aplicável no wizard).
3. Pós-publicação: adicionar etapa D1–D3 → `publishStage`.
4. `league_stage_tournament_factory` seta `leagueId`, `leagueStageId`, `isLeagueStage: true`.
5. `stages[].tournamentIds[]` atualizado no batch.
6. Atleta vê liga em Competir e etapas no detalhe.
7. Torneio de etapa mostra badge de liga no organizer (`tournament_ops_logic`).

## Checklist bordas

- [ ] Categoria desabilitada na etapa → `registrationClosed`
- [ ] Etapa draft vs open
- [ ] `listingStatus` liga: rules só `draft`/`open` — sem `closed`?
- [ ] Múltiplas etapas com mesma ordem
- [ ] Ranking da liga (`leagueTeamRankings`) vs torneio isolado
- [ ] Remover etapa / torneio órfão

## Matriz de abuso

| Cenário | Verificar |
|---------|-----------|
| Publicar liga sem permissão | rules + managerId |
| Atleta vê draft de liga | `isPubliclyListedTournament` |
| Etapa duplicada no calendário | factory idempotência |

## Gaps conhecidos

- League rules não modelam `closed`/`cancelled` como tournaments
- Ranking de circuito pode não estar ligado a todos os torneios de etapa

## Testes

- `league_create_logic_test.dart`, `league_create_mapper_test.dart`
- `league_stage_create_logic_test.dart`
- `league_stage_tournament_factory_test.dart`

## Escalar ao CBV

- Pontuação acumulada por etapa (circuito)
- Critério de classificação geral da liga
- Número de etapas obrigatórias vs opcionais
- Grand final entre etapas
