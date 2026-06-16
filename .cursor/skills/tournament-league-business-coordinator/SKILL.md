---
name: tournament-league-business-coordinator
description: Orquestra os 5 agents de regras de negócio de torneios/ligas em paralelo, deduplica achados e opcionalmente dispara auditoria técnica. Use antes de release ou após mudanças grandes em competições.
---

# Business Coordinator — Tournament & League Audit

## Workflow

1. Carregar `.cursor/skills/tournament-league-audit/SKILL.md` (formato P0–P3, template, smoke).
2. Carregar esta skill.
3. Disparar **em paralelo** (`Task`, `readonly: true`) os 5 agents de **negócio**:

| Subagent | Skill |
|----------|-------|
| `tournament-create-rules-auditor` | `.cursor/skills/tournament-create-rules-audit/SKILL.md` |
| `league-circuit-rules-auditor` | `.cursor/skills/league-circuit-rules-audit/SKILL.md` |
| `registration-enrollment-rules-auditor` | `.cursor/skills/registration-enrollment-rules-audit/SKILL.md` |
| `tournament-operations-rules-auditor` | `.cursor/skills/tournament-operations-rules-audit/SKILL.md` |
| `competition-contract-rules-auditor` | `.cursor/skills/competition-contract-rules-audit/SKILL.md` |

4. Aguardar todos; extrair achados no formato compartilhado.
5. **Deduplicar por regra violada** (ex.: TC-07 + CC-08 uniforme = 1 achado).
6. Para cada achado, preencher:
   - **Escalar técnico?** → um de: `tournament-registration-auditor`, `tournament-listing-discovery-auditor`, `tournament-bracket-category-auditor`, `tournament-match-ops-auditor`, `league-circuit-auditor`, `tournament-firestore-acl-auditor`
   - **Escalar CBV?** → `cbv-tournament-referee-agent`
7. Preencher matriz smoke A/B/C de `docs/tournament-league-smoke-dev.md`.
8. Emitir relatório (template abaixo).

## Fase 2 opcional (técnica)

Disparar `tournament-league-audit-coordinator` quando:

- Qualquer P0 de segurança/ACL/pagamento
- ≥3 achados com **Escalar técnico?** apontando o mesmo agent
- Usuário pedir auditoria completa negócio + técnico

Skill do coordenador técnico: `.cursor/skills/tournament-league-audit-coordinator/SKILL.md`

## Critérios de deduplicação

- Mesma regra de negócio (ID TC-/LC-/RE-/TO-/CC-) em camadas diferentes → um achado com camadas listadas.
- Sintoma org + atleta, mesma causa → um achado.
- Contrato (CC) + bug funcional → priorizar P0/P1 do funcional; CC como nota na reprodução.

## Template relatório (negócio)

```markdown
# Auditoria de regras de negócio — torneios/ligas — [data]

## Resumo executivo
- P0: N | P1: N | P2: N | P3: N
- Regras mais violadas: TC-…, RE-…, …

## P0 — Bloqueadores
(cada achado com Escalar técnico? / Escalar CBV?)

## P1 — Alta prioridade
...

## P2 / P3 — Backlog
...

## Smoke A / B / C
(tabela docs/tournament-league-smoke-dev.md — Pass/Fail/Não testado)

## Handoff técnico recomendado
| Agent técnico | Motivo |
|---------------|--------|

## Recomendações CBV
...

## Próximos passos
```

## Modo

- **Read-only** por padrão.
- Não implementar correções salvo pedido explícito.

## Ambiente smoke manual

Firebase dev: `volley-track-dev-4596c`
