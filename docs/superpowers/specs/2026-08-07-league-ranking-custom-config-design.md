# Configuração personalizada de pontuação de ranking de ligas

**Data:** 2026-08-07
**Escopo:** wizard web de criação de liga (portal do organizador)

## Problema

Muitas ligas usam tabelas de pontuação diferentes, mas nenhum organizador consegue
personalizar os valores: o passo Ranking do wizard web mostra a tabela padrão nexaGO
somente leitura e o draft sempre grava o default. O backend já é flexível — a Cloud
Function `league-ranking.ts` lê `league.rankingPointsByPlace` (chaves `1`, `2`, `3`,
`4`, `quarters`, `groups`) com fallback para o padrão (450/280/180/120/80/40) — e o
app Flutter e os portais do atleta já leem esse campo para exibir o regulamento.
Falta apenas a UI de edição.

## Solução

Tornar editáveis os 6 valores da tabela no passo Ranking (passo 4) do wizard
`criar-liga.component.ts`. Nenhuma mudança de backend, contrato ou outras superfícies.

### Modelo de dados (sem mudança de contrato)

- `draft.rankingPointsByPlace` continua `Record<string, number>` com as chaves
  `1`–`4`, `quarters`, `groups`.
- Semântica preservada: `{}` = "padrão nexaGO". Na primeira edição o draft passa a
  carregar a tabela completa (partindo do padrão via `effectiveRankingPoints`).
  "Restaurar padrão" volta a `{}`.
- `leagueToFirestore` → `effectiveRankingPoints` já grava a tabela efetiva no doc da
  liga. CF, app Flutter e portais do atleta já leem o campo. Zero mudança fora do
  wizard.
- `rankingTableId` não é tocado: o dropdown do app Flutter só conhece
  `state_circuit`/`nexago_standalone` e quebraria com valor novo.

### UI — passo 4 (Ranking)

- O card "Pontuação" troca o `og-points-table` estático por 6 linhas editáveis:
  label ("1º lugar" … "Fase de grupos") + `<input class="og-input-el" type="number"
  min="0" step="10">`, mesmo padrão dos demais campos numéricos do wizard.
- Título do card deixa de dizer "(padrão nexaGO)".
- Botão "Restaurar padrão nexaGO" (`og-ghost-btn`), visível apenas quando a tabela
  difere do padrão.
- Handler `setPoints(key, raw)`: parse → inteiro ≥ 0 (vazio/NaN → 0), grava a tabela
  completa no draft partindo de `effectiveRankingPoints`.
- `og-points-table` não muda — segue como leitura no Regulamento.

### Revisão — passo 6

- A linha "Ranking" passa a indicar a tabela: "4 melhores de 6 etapas · tabela
  padrão nexaGO" ou "· tabela personalizada", via computed que compara a tabela
  efetiva com `DEFAULT_LEAGUE_RANKING_POINTS`.

### Validação

- Inteiro ≥ 0 por campo; sem exigência de monotonicidade (há ligas que pontuam
  igual em colocações vizinhas).
- O CF já aplica `Math.max(0, Math.round())` na leitura — dupla proteção.
- Nenhum bloqueio de "Continuar": toda tabela de números ≥ 0 é válida.

### Testes

- `painel/data/leagues.spec.ts`: `effectiveRankingPoints` com tabela custom e com
  draft vazio; `leagueToFirestore` gravando a tabela custom no doc.
- Testes de componente, se necessários, seguem o padrão TestBed zoneless dos portais
  (`provideZonelessChangeDetection()`).

## Fora de escopo (deliberado)

- Editar pontos de liga já publicada (retroatividade).
- Presets novos ou buckets extras (Oitavas, Participação).
- Mudanças no wizard do app Flutter.
- Mudanças em `rankingTableId` e nos modos de contagem (`countingStagesMode`).
