# Multiesporte fase 4b2: saque e tempo médico por elenco nas mesas dos portais — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Numa partida individual (tênis simples) a mesa do organizador e a do portal do atleta não indicam um "atleta 2" inexistente: o sacador é sempre o titular e a mesa não pergunta quem saca; o tempo médico lista os atletas do elenco (1 a 5).

**Architecture:** `@nexago/live-scoring`: `ServingPlayerSlot` 0–5; `RosterSizes {A,B}` (ausente = dupla); rotação = próximo do elenco (individual fica no 1, dupla alterna, equipe roda); `servingPlayerSlotOf` devolve 1 na individual; `needsServingPlayer(servingRosterSize: 1)` = false; `LiveMatch.rosterSizes` + `withRosterSizes` (o doc da partida não sabe o elenco — a mesa preenche com o que já carregou). Tempo médico: `MedicalTimeoutSlot` 1–5, chave `^[AB][1-5]$`. Mesas: nomes por `memberUids`, elenco por lado, seletores 1..N, escritas com `withRosterSizes`. Dart (app) fica na 4d.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (Eixo 2 "Saque e tempos" + Eixo 4).

## Review Focus
1. Individual: ponto que devolve o saque não aponta para slot 2; selo "SAQUE · NOME" mostra o titular.
2. Dupla: comportamento idêntico (alterna 1↔2; pergunta quem saca).
3. Equipe 3–5: tempo médico lista todos; rotação roda o elenco.
4. Doc antigo com `medicalTimeoutPlayers` ['A1','B2'] continua lido; app (Dart) ainda lê só 1|2 — chaves 3–5 gravadas pelo portal são ignoradas lá (4d).
5. Mesa sem os times carregados ainda: cai em dupla (comportamento de hoje).

### Task 1: lib compartilhada · Task 2: mesas · Task 3: verificação e PR
