---
name: tournament-bracket-category-audit
description: Checklist de auditoria para seeding, chaveamento, category_ops, generateCategoryBracket e contagens de inscrição vs maxTeams no NexaGO.
---

# Bracket & Category Ops Audit

Modo **read-only**. Formato: `.cursor/skills/tournament-league-audit/SKILL.md`.

## Mapa de arquivos

| Camada | Path |
|--------|------|
| CF | `functions/src/organizer-category-ops.ts` |
| Domain | `nexago_app/lib/features/organizer/domain/category_ops/` |
| UI | `organizer_category_*_page.dart`, `organizer_category_teams_tab.dart` |
| Inscriptions | `tournament_inscriptions_repository.dart` |
| Bracket UI | `double_elimination_bracket_canvas.dart` |
| Schema | `docs/tournaments-firestore-schema.md` |

## Checklist happy path

1. Inscrições pagas contam para `enrolledCount` / vagas.
2. Seeding salvo em `categoryOps.{id}.seeds`.
3. `generateCategoryBracket` publica matches + `bracketStatus: published`.
4. DE / grupos / SE — número de jogos coerente com N equipes.
5. `advanceBracketWinner` encontra próxima partida (índice round+matchNumber).
6. `organizerConfirmRegistrationPayment` / waitlist / remove from category.
7. `closeTournamentRegistrations` por torneio.

## Checklist bordas

- [ ] N ímpar de equipes (bye)
- [ ] Categoria com 0 ou 1 inscrito pago
- [ ] `categoryId` string = nome — rename quebra matches
- [ ] `registrationClosed` por categoria
- [ ] Chave republicada (idempotência / duplicata de matches)
- [ ] Comunicação em massa (`sendCategoryCommunication`)

## Matriz de abuso

| Cenário | Verificar |
|---------|-----------|
| Confirmar pagamento sem ser organizador | CF auth |
| Gerar chave sem inscrições suficientes | CF precondition |
| Atleta vê chave antes de publicar | public read matches |

## Gaps conhecidos

- Sem testes de integração para `generateCategoryBracket` em CI
- `categoryOps` merge client-side vs CF

## Testes

- `category_ops_logic_test.dart`
- `double_elimination_bracket_layout_test.dart`

## Escalar ao CBV

- Seeding por ranking vs sorteio
- Formato DE com repescagem / grand final reset
- Número mínimo de equipes por categoria
- Pools + ouro/prata
