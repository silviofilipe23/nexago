---
name: tournament-firestore-acl-audit
description: Checklist de auditoria Firestore — rules, ACL staff/scorer, collections públicas e paths legados para torneios e ligas no NexaGO.
---

# Firestore ACL & Security Audit

Modo **read-only**. Formato: `.cursor/skills/tournament-league-audit/SKILL.md`.

Sempre cruzar com `.cursor/skills/firebase-rules-reviewer/SKILL.md`.

## Coleções críticas

| Path | Leitura | Escrita sensível |
|------|---------|------------------|
| `tournaments/{id}` | pública | `managerId`, `listingStatus`, `categoryOps` |
| `tournaments/{id}/staff/{uid}` | staff | roles ACL |
| `leagues/{id}` | pública | `listingStatus` allowlist |
| `artifacts/.../inscriptions` | **pública** | pagamento, `participantUids` |
| `artifacts/.../teams` | pública | `player1Id`/`player2Id` |
| `artifacts/.../matches` | pública | placar, status, teams |
| `matches/.../pointEvents` | append | scorer |
| `tournamentRegistrationInvites` | inviter/invitee | CF-only write |
| `users/{uid}/gamification/*` | owner read | **CF-only write** |
| `torneios/{id}` | legado backoffice | diverge de `tournaments/` |

Helper paths: `nexago_artifacts_paths.dart`

## Checklist rules

- [ ] Inscrição: pagamento imutável para atleta
- [ ] Inscrição: `participantUids` validado vs team no create
- [ ] Gamificação: `write: if false` para client
- [ ] Match: `managerCanOnlyEditMatchFields` para manager
- [ ] Match: `isTournamentOrganizer()` global — least privilege?
- [ ] Delete inscription: quem pode?
- [ ] Staff index `users/{uid}/tournamentStaff`

## Matriz de abuso

| Ataque | Onde testar |
|--------|-------------|
| Atleta A lê inscrição de atleta B | inscriptions public read |
| Atleta promove-se a scorer | staff rules |
| Client grava XP | gamification rules |
| Alterar `winnerId` sem role | matches update |
| Escrever em torneio alheio | `canManageTournament` |

## Dual-path risks

- App lê `tournaments/` e fallback `artifacts/.../tournaments/`
- Backoffice `torneios/` com rules diferentes
- Writes em um path, reads em outro

## Índices

`firestore.indexes.json` — validar queries usadas vs índices deployados.

## Gaps conhecidos

- Inscriptions PII públicas (by design para chaves — avaliar minimização)
- Organizer global role em matches

## Escalar ao CBV

Não aplicável — foco técnico/segurança. CBV só se vazamento permitir fraude esportiva (ex.: alterar resultado).
