---
name: tournament-registration-audit
description: Checklist de auditoria para inscrições, PIX, convites de parceiro, teams e campos de pagamento em torneios NexaGO. Use ao revisar registration flows ou firestore.rules de inscriptions.
---

# Registration & Payment Audit

Modo **read-only**. Formato de achado: `.cursor/skills/tournament-league-audit/SKILL.md`.

## Mapa de arquivos

| Camada | Path |
|--------|------|
| UI atleta | `nexago_app/lib/features/tournaments/presentation/tournament_registration_page.dart` |
| PIX | `tournament_registration_pix_page.dart` |
| Service | `nexago_app/lib/features/tournaments/data/tournament_registration_service.dart` |
| Invite | `tournament_partner_invite_service.dart`, `functions/src/tournament-partner-invite.ts` |
| PIX CF | `functions/src/tournament-registration-pix.ts`, `asaas-tournament-registration-webhook.ts` |
| Rules | `firestore.rules` → `artifacts/.../inscriptions`, `teams` |
| Meus torneios | `my_tournament_registrations_repository.dart` |

## Checklist happy path

1. Atleta com perfil completo acessa inscrição (`athlete-tournament-access`).
2. Cria `team` + `inscription` com `isPaid: false`, `participantUids`.
3. PIX via CF → webhook → `isPaid` / `sharePaidUids` atualizados **somente** server-side.
4. Convite: inviter envia → invitee aceita → `participantUids` gravado na CF.
5. Organizador confirma pagamento manual via `organizerConfirmRegistrationPayment`.
6. Inscrição aparece em Meus Torneios (query `participantUids` ou fallback legado).

## Checklist bordas

- [ ] Dupla com mesmo atleta em `player1` e `player2`
- [ ] Inscrição em categoria `registrationClosed`
- [ ] Torneio `listingStatus: closed` / `cancelled`
- [ ] Pagamento parcial (split) — um atleta paga, outro não
- [ ] Convite expirado / já aceito / invitee errado
- [ ] Inscrição legada sem `participantUids`
- [ ] Free registration (`confirmFreeTournamentRegistration`)
- [ ] Cancelamento de PIX pendente

## Matriz de abuso

| Ataque | Verificar |
|--------|-----------|
| Client seta `isPaid: true` | `firestore.rules` `inscriptionPaymentFieldsUnchanged` |
| Client altera `paidAmount` | idem |
| `participantUids` com UID de terceiro | `inscriptionParticipantUidsMatchTeam` |
| Trocar `player1Id` após inscrição | `teamPlayerIdsUnchanged` |
| Ler PII de todas inscrições | `allow read: if true` em inscriptions — avaliar exposição |
| Re-inscrição mesma categoria | duplicate guard no app/CF |
| Webhook replay / valor errado | idempotência e validação de valor |

## Gaps conhecidos

- `participantUids` só em writes novos; legado sem backfill
- Comentário em `tournament_registration_service` menciona MP; fluxo é Asaas
- `tournament_partner_invite_home_logic_test` com falhas conhecidas

## Testes existentes

- `tournament_registration_logic_test.dart`
- `tournament_partner_invite_test.dart`
- `functions/src/tournament-registration-pix-helpers.test.ts`
- `functions/src/athlete-tournament-access.test.ts`

## Escalar ao CBV

- Critério de elegibilidade de categoria (nível/sandbagging)
- Inscrição após encerramento com tolerância operacional
- Dupla com substituição de atleta pós-inscrição
