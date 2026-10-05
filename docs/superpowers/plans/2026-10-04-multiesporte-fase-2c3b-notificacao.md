# Multiesporte fase 2c3b: notificação de partida acompanhada com games — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** O push de "placar ao vivo" de quem segue uma partida de games (beach tennis) traz os sets e games certos, o ponto do game, avisa set point / match point pela regra de games e notifica cada ponto (não só o fim do game).

**Architecture:** O motor de games da mesa (`live-games.ts`) passa a existir também nas functions (`functions/src/sports/live-games.ts`, mesma lógica do `@nexago/sports`, provada pelos mesmos `liveVectors`/`eventTextVectors`). `match-live-follow-notify.ts` lê `scoringProfile` e `currentGame` do doc: sets vencidos por `setsWonBy` do perfil efetivo, assinatura com o ponto do game (só em games — a de pontos fica idêntica, o sidecar guarda assinaturas antigas), alerta de set/match point por `gamesFlag`, e as linhas da notificação em games ("5 x 4 · 40-15"; "Super tie-break" e os pontos dele).

**Tech Stack:** TypeScript (Cloud Functions), `node --test`.

**Spec:** `docs/superpowers/specs/2026-10-03-multiesporte-arquitetura-design.md` (emenda 2c: 2c3b = notificação).

## Global Constraints

- Partida de pontos: ZERO mudança — mesma assinatura, mesmas decisões, mesmos textos (testes existentes de `match-live-follow-notify.test.ts` intactos).
- O app só exibe as strings do servidor (`scoreLine`, `setsLine`, `statusLabel`, alerta) — nada muda no app.
- Live Activity fica fora (o conteúdo não tem gatilho no repositório).

## Review Focus

1. Ponto dentro do game (15-0 → 30-0) muda a assinatura em games (vira push "score" respeitando o throttle).
2. 5-4 em 30-30 → 40-30: entra em set point; em 40-40 sem vantagem, ponto de B fecha o game e não alerta.
3. Super tie-break: linha "7 x 5", status "Super tie-break", match point em 9-8.
4. Set fechado em games conta pelo perfil (6-4 fecha; 5-4 não) — "Fim do set" não dispara em 5-4.
5. Partida de pontos: assinatura e textos idênticos aos de hoje.

---

### Task 1: motor de games nas functions

**Files:** `functions/src/sports/live-games.ts` (cópia de `frontend/shared/sports/live-games.ts` no estilo das functions), `functions/src/sports/live-games.test.ts` (liveVectors + eventTextVectors).

- [ ] RED (import inexistente) → GREEN; commit.

### Task 2: notificação lendo o perfil

**Files:** `functions/src/match-live-follow-notify.ts`, `functions/src/match-live-follow-notify.test.ts`.

- [ ] `LiveMatchSnapshot` ganha `scoringProfile: unknown` e `currentGame: {a,b} | null`; `snapshotFromMatchData` lê os dois.
- [ ] `normalize`: perfil efetivo; vitórias por `setsWonBy`; em games guarda `game`, `tiebreak`, `superTiebreak`.
- [ ] `liveScoreSignature`: em games acrescenta o ponto do game.
- [ ] `pointAlertOf`: games → `gamesFlag`.
- [ ] `buildMatchLiveContext`: games → `scoreLine` "5 x 4 · 40-15" (super tie-break: "7 x 5"), `statusLabel` "Set N" / "Tie-break" / "Super tie-break".
- [ ] RED/GREEN com os cinco casos do Review Focus; commit.

### Task 3: Verificação final e PR empilhado

- [ ] Suítes completas; revisão independente; PR contra `claude/multiesporte-fase-2c3a-ponto-a-ponto`.
