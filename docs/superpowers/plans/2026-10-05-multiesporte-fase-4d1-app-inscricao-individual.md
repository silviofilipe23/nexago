# Multiesporte fase 4d1: inscrição individual no app — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O atleta se inscreve numa categoria individual pelo app (mesmo resultado do portal, 4c), e o organizador no app não regrava uma categoria individual como dupla.

**Architecture:** `TournamentDocumentMapper` lê `teamSize` 1 (individual) além de 3–5; `TournamentCategoryOffer.isTeamCategory` vira `>= 3` + `isIndividualCategory`, rótulos "Individual"/"atletas"; cotação aceita 1 (cota = taxa inteira); `registrationTermsCopy` com variante individual (`registersDirectly`) e a tela de condições chama `registerSolo` direto; pagamento: uma opção só (taxa inteira) e tipo inicial `full`; uniforme da individual no slot Player1; sem "sair da equipe"; trilha sem passo de dupla, "Sua inscrição · R$"; mappers do organizador (torneio e liga) usam o `teamSize` quando falta `disputeType`. Mesa/saque/tempo médico/exibição/capa ficam na 4d2.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 4 + emenda fase 4).

## Review Focus
1. Fluxo do app: categoria individual → condições → inscrição → (uniforme) → pagamento integral → sucesso, sem parceiro/aguardando.
2. App antigo (loja) numa individual: segue funcionando pelo servidor (4a) — não muda aqui, mas nada nesta entrega pode piorar.
3. Dupla e equipe 3–5 idênticas a hoje (`isTeamCategory` `>= 3` em todos os consumidores).
4. Uniforme individual não fica preso.
5. Organizador no app reabrindo torneio com categoria individual não a transforma em dupla.

### Task 1: leitura, cotação e cópia · Task 2: telas (condições, pagamento, trilha) · Task 3: mappers do organizador · Task 4: verificação e PR
