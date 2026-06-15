---
name: tournament-listing-discovery-audit
description: Checklist de auditoria para listingStatus, discovery Competir, CTAs de inscrição e alinhamento atleta vs organizador em torneios e ligas NexaGO.
---

# Listing & Discovery Audit

Modo **read-only**. Formato: `.cursor/skills/tournament-league-audit/SKILL.md`.

## Mapa de arquivos

| Camada | Path |
|--------|------|
| Status domain | `nexago_app/lib/features/tournaments/domain/tournament_listing_status.dart` |
| Labels | `tournament_discovery_labels.dart` |
| Discovery repo | `tournaments_repository.dart`, `leagues_repository.dart` |
| Mapper | `tournament_document_mapper.dart` |
| UI | `tournament_discovery_page.dart`, `tournament_discovery_list_page.dart` |
| Detail | `tournament_detail_page.dart` |
| Organizer | `tournament_ops_logic.dart`, `organizer-category-ops.ts` (`closeTournamentRegistrations`) |

## Checklist happy path

1. Organizador publica com `listingStatus: open` → aparece em Competir.
2. `draft` / `cancelled` **não** aparecem (`isPubliclyListedTournament`).
3. `closed` → atleta vê "Inscrições encerradas", `canRegisterForTournament` = false.
4. CTA "Inscrever" só em `open` / `almostFull`.
5. Torneio ao vivo no dia do evento: badge coerente (organizer vs athlete).
6. Liga publicada visível; draft de liga oculta.

## Checklist bordas

- [ ] Documento só com `status` legado (sem `listingStatus`)
- [ ] `resolveListingStatus` promove `open` → `live` no dia do evento
- [ ] `bracketsReady` vs `closed` — labels distintos?
- [ ] Filtro "só abertos" em discovery list
- [ ] Torneio etapa de liga (`isLeagueStage`) no card
- [ ] `liveMatchesNow` desatualizado vs matches reais
- [ ] Legacy path `artifacts/.../tournaments/`

## Matriz de abuso

| Cenário | Verificar |
|---------|-----------|
| Draft visível na discovery | filtro client/query |
| Inscrição após `closed` | UI + rules + CF |
| Status enganoso ("aberto" mas lotado) | `spotsLeft`, `almostFull` |
| Torneio cancelado ainda inscritável | `cancelled` mapping |

## Gaps conhecidos

- Dual `listingStatus` / `status`
- `closed` mapeado para `bracketsReady` no enum (label via `tournamentStatusLabelFromRaw`)
- Discovery ainda pode usar snapshot total + filtro client (custo)

## Testes

- `tournament_listing_status_test.dart`
- `tournament_discovery_helpers_test.dart`
- `compete_hub_logic_test.dart`

## Escalar ao CBV

- Critério de encerramento de inscrições vs calendário CBV
- Divulgação de chaves antes do congresso técnico
