# Multiesporte fase 3a: ranking geral por esporte e rating por configuração (servidor) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O servidor passa a manter o ranking geral por esporte (docs novos, `sport` nos resultados) sem mexer no que o app da loja lê, e o rating de um esporte novo passa a ser ligado por configuração.

**Architecture:**
- **Coleções novas** `athleteRankingsBySport/{athleteId}_{profileCode}` e `teamRankingsBySport/{teamId}_{profileCode}` (mesmo formato do doc legado + `sport` na identidade). Ficar na coleção legada quebraria o app da loja (lê a coleção inteira e usa o `doc.id` como atleta) e o script de limpeza (classificaria como órfão). Emenda no spec.
- **Dupla escrita:** o doc legado continua recebendo o que já recebia (vôlei de praia, quadra, futevôlei e esporte não reconhecido — o gate da 2d1 fica só para o legado); o doc por esporte recebe o seu esporte (inclusive beach tennis). Esporte não reconhecido (`null`) não tem doc por esporte.
- `sport` (profileCode) em cada entrada de `results[]` e no doc de `tournamentCategoryResults`; `parseResults` preserva o campo; o retorno cedo de `awardGlobalPlacement` considera `sport` ausente.
- **Backfill admin** (`backfillRankingsBySport`, super admin, paginado, `dryRun`): percorre `tournamentCategoryResults`, resolve `sport` pelo torneio, grava `sport` no resultado e reconstrói os docs por esporte a partir dos resultados (idempotente: recalcula do zero por id). Não é executado neste PR.
- **Rating:** `isRatingEnabledFor(code, config)` — esporte que já rateava (`VOLEI_PRAIA`, `VOLEI_QUADRA`) mantém o comportamento de hoje (flag do doc; ausente = ligado); qualquer outro só rateia com `ratingLadders/{code}` existente e `flags.ratingEnabled === true` (o fallback `ratingLadders/default` não liga esporte novo). `RATED_SPORT_CODES` deixa de ser o gate.

**Tech Stack:** Cloud Functions (TS), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 3; emenda da fase 3 neste PR).

## Global Constraints

- Doc legado (`athleteRankings/{id}`, `teamRankings/{id}`) idêntico ao de hoje para todo torneio que já pontuava.
- Nada é escrito em produção por este PR; o backfill tem `dryRun` e é só código.
- Rating de vôlei de praia/quadra sem mudança.

## Review Focus

1. Torneio de vôlei de praia: legado igual a hoje + doc por esporte `_VOLEI_PRAIA` com o mesmo total.
2. Torneio de beach tennis: nada no legado; doc `_BEACH_TENNIS`.
3. Reprocessar a mesma partida (idempotência) não duplica nas duas coleções; entrada antiga sem `sport` ganha o campo.
4. Backfill `dryRun` não escreve; real reconstrói por esporte e é idempotente.
5. Rating: futevôlei/beach tennis sem doc → não rateia; com doc `ratingEnabled: true` → rateia; vôlei de praia sem doc → rateia como hoje.

---

### Task 1: ranking por esporte (escrita)
**Files:** `functions/src/tournament-ranking.ts` (+ teste), `functions/scripts/award-koc-tournament-ranking.js` (passa `sportCode`).
- [ ] RED/GREEN para os itens 1–3 do Review Focus; commit.

### Task 2: backfill
**Files:** `functions/src/ranking-by-sport-backfill.ts` (+ teste), export no `index.ts`.
- [ ] RED/GREEN (dryRun não escreve; reconstrói por esporte; idempotente); commit.

### Task 3: rating por configuração
**Files:** `functions/src/rating-config.ts`, `rating-engine.ts`, `rating-triggers.ts`, `athlete-level-admin.ts` (+ testes).
- [ ] RED/GREEN para o item 5; commit.

### Task 4: Verificação final e PR empilhado
- [ ] Suítes; revisão independente; PR contra `claude/multiesporte-fase-2d2b-placar-app`.
