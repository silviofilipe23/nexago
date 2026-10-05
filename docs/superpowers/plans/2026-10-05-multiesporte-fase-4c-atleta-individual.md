# Multiesporte fase 4c: categoria individual no portal do atleta — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O atleta se inscreve numa categoria individual (tênis simples) pelo portal: vê "Individual"/"atletas", a tela de condições inscreve direto (sem parceiro), o pagamento é a taxa inteira e o nome aparece sozinho (sem "/ Atleta").

**Architecture:** `data/team-size.ts` (`parseTeamSizeField`: 1 individual, 3–5 equipe, resto dupla) nas leituras de categoria, inscrição, convite e equipe; `isTeamCategoryOffer` vira `>= 3` e `isIndividualCategoryOffer`; rótulos "Individual"/"atletas"; formato do torneio "Individual" só quando todas as categorias são; `registrationTermsCopy` ganha a variante individual (`registersDirectly`) e a tela chama `registerSolo` (o servidor da 4a cria a inscrição completa); pagamento esconde "Minha parte × Integral" na individual; progresso "Sua inscrição · R$"; `duoNameOf` (2 cópias) mostra o atleta inteiro quando não há 2º slot.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 4 + emenda fase 4).

## Review Focus
1. Fluxo: categoria individual → condições → inscrição → (uniforme) → pagamento integral → sucesso, sem passar por parceiro/aguardando.
2. Torneio com "exigir dupla formada" + categoria individual: a individual inscreve direto.
3. Torneio só de simples aparece "Individual"; simples + duplas, "Dupla".
4. Equipe (3–5) e dupla idênticas a hoje.
5. Nome da individual em listas, chave, Focus, perfil — sem "/ Atleta".

### Task 1: leitura e rótulos · Task 2: condições e pagamento · Task 3: nomes · Task 4: verificação e PR
