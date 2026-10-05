# Multiesporte fase 4b1: categoria individual no painel do organizador — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O organizador cria categoria individual de tênis no painel e o painel lê/mostra inscrições individuais corretamente. (Mesa/saque/tempo médico por slots ficam na 4b2.)

**Architecture:**
- **Catálogo:** `allowedTeamSizes` por esporte (`competition` obrigatório; subconjunto ordenado de 1–5): vôlei de praia/quadra, futevôlei e beach tennis `[2,3,4,5]` (o que o painel oferece hoje), tênis `[1,2]`; esportes de perfil `null`. Codegen nas 3 plataformas.
- **Wizard** (torneio e liga): tipos de disputa = `allowedTeamSizes` do esporte; trocar o esporte leva categoria de tipo não permitido para dupla; individual: vagas de 1 em 1, rótulos "atletas"; em torneio publicado, o tipo de disputa de categoria já existente não muda (a troca de `teamSize` com inscrições quebraria reservas e inscrições).
- **Leitura no painel:** `teamSize` 1 deixa de cair em "dupla" (parsers 3–5 viram 1–5 com a semântica explícita: 1 individual, null/2 dupla, 3+ equipe); portões "é equipe" passam a `>= 3`; rótulos por `participantNoun`.
- **Servidor:** inscrição carimbada `teamSize: 1` nunca é "anexável" por convite (defesa se a categoria mudar de tamanho).

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 4 + emenda da fase 4).

## Global Constraints
- Dupla/equipe idênticas a hoje; nenhum esporte perde opção que tinha.
- "Dupla eliminatória" (formato) e "Exigir dupla já formada" (reserva solo) não são o substantivo do participante.

## Review Focus
1. Tênis oferece Individual e Dupla; vôlei não oferece Individual.
2. Trocar tênis → vôlei com categoria individual: a categoria vira dupla (vagas coerentes).
3. Torneio publicado: tipo de disputa de categoria existente travado; categoria nova livre.
4. Painel lista/conta inscrições individuais como "atleta(s)", não "dupla"/"equipe"; inscrição manual do organizador pede 1 atleta.
5. Convite de parceiro numa inscrição `teamSize: 1` nunca anexa.

### Task 1: catálogo `allowedTeamSizes`
### Task 2: wizard (torneio e liga)
### Task 3: leitura e rótulos no painel
### Task 4: defesa no servidor
### Task 5: verificação final e PR
