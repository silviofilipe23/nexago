---
name: tournament-league-audit
description: Vocabulário compartilhado, smoke manual e template de relatório para auditoria end-to-end de torneios e ligas no NexaGO. Use com os agents tournament-*-auditor ou o coordenador.
---

# Tournament & League Audit (shared)

Base para todos os agents de auditoria de competições. Modo padrão: **read-only** — reportar achados, não implementar.

## Vocabulário canônico

| Campo | Valores canônicos | Legado / risco |
|-------|-------------------|----------------|
| `tournaments.listingStatus` | `draft`, `open`, `closed`, `cancelled` | PascalCase, PT, inferência por data em `resolveListingStatus` |
| `match.status` | `Scheduled`, `In Progress`, `Completed` | `scheduled`, `in_progress`, `completed` |
| `match.queueStatus` | `waiting`, `on_court`, `completed` | snake_case (OK) |
| `inscriptions.participantUids` | `[player1Id, player2Id]` | Docs legados sem campo → fallback scan |
| `inscriptions.categoryId` | Nome da categoria (string) | Renomear categoria quebra vínculo |
| Paths torneio | `tournaments/{id}` (canônico) | `artifacts/.../tournaments/`, `torneios/` |

Referência de schema: `docs/tournaments-firestore-schema.md`

## Severidade

| Nível | Critério |
|-------|----------|
| **P0** | Bypass pagamento/ACL, perda de dados, torneio inoperável no dia D |
| **P1** | Fluxo quebrado, inconsistência atleta↔organizador, custo/escala crítico |
| **P2** | Borda sem workaround, UX confusa, débito técnico com impacto |
| **P3** | Melhoria, gap de produto sem bloqueio |

## Formato de achado (obrigatório)

```markdown
### [P0|P1|P2|P3] Título curto

**Cenário:** quem, em qual tela/CF, com qual dado

**Problema:** o que está errado

**Impacto:** atleta / organizador / custo / segurança

**Reprodução:** passos numerados ou query/rules

**Sugestão:** correção mínima viável

**Escalar CBV?** sim/não — se sim, qual aspecto regulamentar
```

## Smoke manual (7 passos) — dev `volley-track-dev-4596c`

| # | Passo | Pass | Fail se |
|---|-------|------|---------|
| 1 | Publicar torneio `open` | Aparece em Competir | Draft visível ou ausente |
| 2 | Inscrever dupla + PIX | `isPaid` só via webhook/CF | Cliente seta `isPaid` |
| 3 | Gerar chave | Matches `Scheduled` | Status legado inconsistente |
| 4 | Agendar + `callMatchToCourt` | Push + G1 "Ao vivo" | Status não detecta live |
| 5 | I1 ponto a ponto | `pointEvents` + `Completed` + XP | Placar/XP não disparam |
| 6 | J2 link público | Placar atualiza read-only | 404 ou stale |
| 7 | Encerrar inscrições | Atleta vê "Inscrições encerradas" | Ainda pode inscrever |

## Template relatório consolidado (coordenador)

```markdown
# Auditoria torneios/ligas — [data]

## Resumo executivo
- P0: N | P1: N | P2: N | P3: N
- Áreas mais críticas: ...

## P0 — Bloqueadores
(lista deduplicada)

## P1 — Alta prioridade
...

## P2 / P3 — Backlog
...

## Smoke manual
(tabela 7 passos com status)

## Recomendações CBV (se houver)
(link para achados escalados ao cbv-tournament-referee-agent)

## Próximos passos sugeridos
```

## Gaps conhecidos (validar primeiro)

1. `participantUids` ausente em inscrições legadas
2. `listingStatus` vs `status` dual + inferência por data
3. `liveMatchesNow` não atualizado pelo match_ops
4. `categoryId` = nome da categoria
5. `organizer-category-ops.ts` sem testes de integração em CI
6. Discovery: filtro client-side vs query indexada
7. Liga: rules só permitem `draft`/`open` em write

## Ordem de execução recomendada

1. `tournament-firestore-acl-auditor` (fundação segurança)
2. `tournament-registration-auditor`
3. `tournament-listing-discovery-auditor`
4. `tournament-bracket-category-auditor`
5. `tournament-match-ops-auditor`
6. `league-circuit-auditor`
7. Coordenador consolida + smoke

## Quando escalar ao CBV

Invocar `.cursor/agents/cbv-tournament-referee-agent.md` quando o achado envolver:

- Seeding/chaveamento injusto
- WO, cartões, protestos, lesão
- Sandbagging / categoria errada
- Ranking/pontuação de circuito
- Súmula incompleta ou sem rastreabilidade

Não escalar CBV para bugs puramente técnicos (null, índice, typo de status).

## Skills complementares

- Segurança rules: `.cursor/skills/firebase-rules-reviewer/SKILL.md`
- Custo Firestore: `.cursor/skills/nexago-cost-reviewer/SKILL.md`
- Arquitetura Flutter: `.cursor/skills/flutter-architecture-expert/SKILL.md`
