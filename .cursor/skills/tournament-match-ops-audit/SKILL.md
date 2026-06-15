---
name: tournament-match-ops-audit
description: Checklist de auditoria G1-J3 — agenda, fila, check-in, placar, WO, validação, J2 público e status canônico de partidas no NexaGO.
---

# Match Ops Audit (G1–J3)

Modo **read-only**. Formato: `.cursor/skills/tournament-league-audit/SKILL.md`.

## Mapa de arquivos

| Camada | Path |
|--------|------|
| CF | `functions/src/organizer-match-ops.ts`, `functions/src/match-status.ts` |
| Domain | `nexago_app/lib/features/organizer/domain/match_ops/` |
| UI organizer | `nexago_app/lib/features/organizer/presentation/match_ops/` |
| J2 público | `nexago_app/lib/features/tournaments/presentation/public_match_live_page.dart` |
| Atleta dia D | `athlete_tournament_day_logic.dart`, `my_tournaments_page.dart` |
| Status | `tournament_match_status.dart` |
| Gamificação | `functions/src/tournament-match-gamification.ts` |
| Reminders | `functions/src/index.ts` → `sendMatchReminders` |

## Checklist happy path

1. `generateCategoryBracket` cria matches `Scheduled`.
2. H2 agenda → `scheduleTime`, `dayKey`, `courtId`.
3. `callMatchToCourt` → `queueStatus: on_court`, `In Progress`, push `match_call`.
4. G1 center mostra live/upcoming/finished corretamente.
5. Check-in ambas equipes → `releaseMatchAfterCheckIn`.
6. I1 live table → `pointEvents` + status `Completed`.
7. `validateMatchResult` / `advanceBracketWinner`.
8. J2 público reflete placar read-only.
9. XP dispara em transição para `Completed`.

## Checklist bordas

- [ ] Status legado `in_progress` em dados antigos
- [ ] Conflito de quadra (`detectCourtOverlap`)
- [ ] WO (`declareMatchWalkover`) — vencedor/avanco
- [ ] `autoScheduleTournamentDay` com 200+ partidas
- [ ] Manager vs scorer field allowlist (`managerCanOnlyEditMatchFields`)
- [ ] `liveMatchesNow` no torneio
- [ ] Atleta: banner chamada de quadra / próxima partida

## Matriz de abuso

| Ataque | Verificar |
|--------|-----------|
| Atleta altera placar direto no Firestore | rules matches update |
| Scorer altera `teamAId` | field allowlist |
| Organizer global bypass | `isTournamentOrganizer()` vs ACL |
| Replay point event | `pointEventSeq` transação |

## Gaps conhecidos

- `report.status: validated` separado de `match.status`
- Public live reusa providers do organizer
- CF tests mínimos em `organizer-match-ops.test.mjs`

## Testes

- `match_ops_logic_test.dart`, `match_scoring_logic_test.dart`, `schedule_logic_test.dart`
- `athlete_tournament_day_logic_test.dart`
- `functions/src/match-status.test.ts`

## Escalar ao CBV

- WO sem presença / critério de vitória
- Intervalo entre sets, tempo médio de partida
- Protesto de resultado / confirmação dupla (I3 atleta)
