---
name: tournament-league-audit-coordinator
description: Orquestra os 6 agents de auditoria de torneios/ligas em paralelo, deduplica e consolida relatório P0-P3. Use para auditoria completa antes de release.
---

# Coordinator — Tournament & League Audit

## Workflow

1. Carregar `.cursor/skills/tournament-league-audit/SKILL.md`.
2. Carregar esta skill para lista de subagents e critérios de merge.
3. Disparar em **paralelo** (Task tool, `readonly: true`):

| Subagent | Skill |
|----------|-------|
| tournament-registration-auditor | `.cursor/skills/tournament-registration-audit/SKILL.md` |
| tournament-listing-discovery-auditor | `.cursor/skills/tournament-listing-discovery-audit/SKILL.md` |
| tournament-match-ops-auditor | `.cursor/skills/tournament-match-ops-audit/SKILL.md` |
| tournament-bracket-category-auditor | `.cursor/skills/tournament-bracket-category-audit/SKILL.md` |
| league-circuit-auditor | `.cursor/skills/league-circuit-audit/SKILL.md` |
| tournament-firestore-acl-auditor | `.cursor/skills/tournament-firestore-acl-audit/SKILL.md` |

4. Aguardar todos; extrair achados no formato da skill compartilhada.
5. Deduplicar por root cause (ex.: mesmo gap de `listingStatus` em discovery + detail = 1 achado).
6. Re-priorizar se P0 de security afeta registration.
7. Escalar ao `cbv-tournament-referee-agent` achados marcados "Escalar CBV? sim".
8. Emitir relatório usando template em `tournament-league-audit/SKILL.md`.

## Critérios de deduplicação

- Mesmo arquivo + mesma linha lógica → um achado.
- Sintoma diferente, mesma causa (ex.: status casing) → um achado com impactos listados.
- Security + functional do mesmo bypass → P0 único.

## Pós-auditoria opcional

Se o usuário pedir: rodar `pr-reviewer` ou `nexago-pr-reviewer` nas mudanças recentes (`git diff`).

## Ambiente de teste manual

Firebase dev: `volley-track-dev-4596c`
