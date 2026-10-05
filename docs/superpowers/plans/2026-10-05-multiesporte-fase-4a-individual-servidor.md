# Multiesporte fase 4a: categoria individual no servidor — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Uma categoria com `teamSize: 1` funciona de ponta a ponta no backend: inscrição completa na hora, pagamento da taxa inteira, entra na chave, pontua no ranking do atleta.

**Architecture:**
- `tournament-team-category.ts`: `INDIVIDUAL_TEAM_SIZE = 1`; `resolveCategoryTeamSize`/`registrationTeamSize` aceitam 1 só quando `teamSize` é explícito (derivado de `disputeType` mantém o piso 2); `isIndividualCategory`; `participantNoun(teamSize, {plural?, article?})`. `tournament-team-roster.ts` `expectedRosterSize` aceita 1.
- `registerSoloTournament`: ramo individual cria a equipe de 1 e a inscrição completa na mesma transação; ignora `requireFormedPair`. Convites (`sendPartnerInviteFor`, `acceptTournamentPartnerInvite`, `createExternalPartnerInvite`) recusam categoria individual. `createTournamentTeamRegistration` em categoria não-equipe passa a citar o tamanho certo. `organizerCreateTeamRegistration` aceita 1 atleta em categoria individual.
- Pagamento: cota dinâmica para todo tamanho ≠ 2 (PIX/cartão e webhook); `isFreeRegistrationFullyConfirmed` aceita 1.
- Ranking: equipe de 1 membro não grava `teamRankings`/`teamRankingsBySport`. `head-to-head.ts` por `memberUids`.

**Tech Stack:** Cloud Functions (TS), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 4 + emenda da fase 4).

## Global Constraints
- Dupla e equipe (3–5) idênticas a hoje. `disputeType: 'individual'` sem `teamSize` segue dupla.
- KOTC fora. "dupla eliminatória" não é substantivo de participante.

## Review Focus
1. Inscrição individual: equipe de 1 + inscrição com `teamId`, `partnerPending: false`, `teamSize: 1`; entra no filtro de elegibilidade da chave.
2. App antigo pagando "share" numa individual: cobra e credita a taxa inteira e confirma.
3. Individual gratuita / declarada: confirma com 1 atleta.
4. Convite de parceiro em categoria individual é recusado com mensagem clara (3 caminhos).
5. Categoria legada `disputeType: 'individual'` sem `teamSize`: continua dupla.

---

### Task 1: domínio (tamanho, substantivo, elenco)
### Task 2: inscrição e convites
### Task 3: pagamento
### Task 4: ranking e confronto direto
### Task 5: verificação final e PR (base `main`)
