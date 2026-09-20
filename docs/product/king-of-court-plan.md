# Plano — modalidade King of the Court

Regras do formato: `docs/business-rules/king-of-court.md`.
Este documento é o plano de engenharia: modelo de dados, fases de entrega e riscos.

## 1. Por que não dá para reaproveitar `matches` como duelo

Todo o motor atual assume **dois lados**: `teamAId`/`teamBId`, `winnerId`, `sets`,
`resultA`/`resultB`. Uma rodada KOTC tem de 3 a 5 duplas e uma tabela de pontos.

Acoplamento medido hoje:

| Camada | Arquivos que leem `teamAId` |
|--------|-----------------------------|
| `functions/src` (sem testes) | 17 |
| `nexago_app/lib` | 56 |

Duas saídas foram consideradas:

- **Coleção nova (`kocRounds`)** — isola o formato, mas obriga a reimplementar
  agenda, quadras, chamada para a quadra, check-in, telão, push e "Agora".
- **Mesma coleção `matches`, com `matchType` próprio** ✅ **recomendado** — herda
  agenda/quadra/status/telão de graça; o custo é blindar os consumidores de duelo.

A agenda (`match-schedule-allocation.ts`, `match-dynamic-reschedule.ts`) é a parte
cara e é agnóstica de formato. Vale herdar.

## 2. Modelo de dados

### 2.1 Configuração da categoria
Novo valor `TournamentBracketSystem.kingOfCourt` (raw `king_of_court`), gravado em
`categoryOps.{categoryId}.bracketFormatOverride`.

`categoryOps.{categoryId}.bracketConfig`:

```json
{
  "teamsPerCourt": 4,
  "roundEndMode": "time",
  "roundDurationSec": 900,
  "targetPoints": 0,
  "qualifiersPerRound": 2,
  "phaseCount": 3,
  "crownScores": false,
  "tiebreak": "golden_point"
}
```

### 2.2 Rodada — `artifacts/{projectId}/public/data/matches/{matchId}`

| Campo | Valor |
|-------|-------|
| `matchType` | `koc_round` \| `koc_semifinal` \| `koc_final` |
| `round` / `kocPhase` | 1 = classificatória … N = final |
| `poolId` | quadra lógica da fase (`C1`, `C2`…) |
| `teamAId` / `teamBId` | **`""`** — sentinela de "não é duelo" |
| `kocTeamIds[]` | elenco da rodada (ordem = entrada) |
| `kocConfig` | snapshot da config na geração |
| `kocState` | `{kingTeamId, challengerTeamId, queue[], points{}, rallies, servingTeamId, clockStartedAt, clockEndsAt, pausedAccumSec}` |
| `kocStandings[]` | `{teamId, points, place, rallies, crowns}` — gravado no encerramento |
| `winnerId` | 1º colocado da rodada |
| `status`, `courtId`, `scheduleTime`, `dayKey`, `queueOrder` | reuso da agenda atual |

Log de rallies na subcoleção **`kocRallies`** (não em `pointEvents`): as rules de
`pointEvents` validam `setIndex`/`scoreA`/`scoreB` e o play-by-play do app
(`match_detail_play_by_play_logic.dart`) parseia aquele shape. Subcoleção separada
evita quebrar os dois.

### 2.3 Segurança
Leitura de `matches` já é pública. Toda escrita KOTC vai por callable com
`assertCanScoreTournament` (mesmo guard de `updateLiveMatchScore`) — **sem** mudança
em `firestore.rules` para o placar. Só `kocRallies` precisa de bloco de leitura.

## 3. Decisões travadas (20/09)

| Decisão | Escolha |
|---------|---------|
| Escopo | **Categoria KOTC dentro de torneio existente** — convive com grupos/mata-mata nas outras categorias do mesmo torneio |
| Pontuação | **Só o rei pontua** — coroação não vale ponto (`crownScores: false`, sem flag no wizard) |
| Fim da rodada | **Tempo, 15 min** (`roundEndMode: "time"`, `roundDurationSec: 900`); alvo de pontos não entra no MVP |
| Prazo | **Rodar na 1ª etapa da Liga, 24/10** |

A escolha de escopo reforça a decisão da seção 1: no **mesmo torneio** vão conviver
partidas de duelo e rodadas KOTC, lidas pelas mesmas queries de agenda, telão e
"Agora". Coleção separada obrigaria a unir os dois fluxos na leitura de qualquer
jeito — e a Fase 0 deixa de ser higiene e vira pré-requisito de correção.

## 4. Caminho crítico até 24/10

Duas datas mandam no plano, e nenhuma das duas é 24/10:

- **10/10 — inscrições abertas.** O atleta vê o formato da categoria no momento da
  inscrição. A Fase 1 (config + geração) precisa estar publicável antes disso.
- **~15/10 — corte do build de loja.** As telas KOTC do atleta só chegam ao celular
  por build publicado: revisão da Apple + propagação (~24h, ver
  `docs/forced-app-update.md`). Build cortado depois disso não roda no dia D.

| Semana | Entrega |
|--------|---------|
| 22–26/09 | Fase 0 (blindagem) + enum, mappers e labels da Fase 1 |
| 29/09–03/10 | Fase 1 fecha: wizard de config + `koc-bracket-builders` + geração |
| 06–10/10 | Fase 2: `koc-engine` + callables + mesa ao vivo — **10/10: inscrições abertas** |
| 13–17/10 | Fase 3 (avanço de fase + pódio) + Fase 4 mínima — **corte do build** |
| 20–23/10 | Ensaio em dev com elenco real, smoke em quadra, congelamento |
| 24/10 | 1ª etapa |
| Pós-evento | Fase 5: ranking, XP e push |

O que **não** entra no MVP: alvo de pontos, `crownScores` configurável, modalidade
individual/trio, pontos de ranking global pela colocação KOTC.

## 5. Fases de entrega

### Fase 0 — Blindagem dos consumidores de duelo
Pré-requisito de tudo. Sem isso, uma rodada KOTC vaza para histórico e rating do
mesmo torneio que tem categorias normais.

- `isDuelMatch(matchType)` em TS (`match-status.ts`) e Dart (`tournament_match.dart`).
- Aplicar em: `rating-engine`, `head-to-head`, `tournament-predictions`,
  `group-standings`, `category-bracket-advance`, `league-ranking`,
  `tournament_podium_logic`, histórico do atleta (`athlete_match_history_mapper`),
  `athlete_profile_stats_logic`.
- Teste de regressão: um doc `koc_round` não entra em nenhum desses caminhos.

Nota: `rating-engine.ts` já falha em `missing_fields` sem `teamAId`/`teamBId` —
falha segura, mas o guard explícito é o que trava a regressão.

### Fase 1 — Configuração e geração da chave — **antes de 10/10**
- Enum + labels (`tournament_create_logic.dart`), `supportedBracketSystems`.
- Parse nos 3 mappers: `tournament_create_mapper`, `league_create_mapper`,
  `league_stage_create_logic` (os três têm o mesmo `switch` de formato).
- UI de config em `organizer_category_format_section.dart`: duplas por quadra e
  quantos classificam. Duração fica fixa em 15 min no MVP.
- `koc-bracket-builders.ts`: distribui o elenco pago em rodadas de `teamsPerCourt`
  por semeadura serpentina; devolve `MatchDraft[]`.
- Branch em `runGenerateCategoryBracket` (`organizer-category-ops.ts:367`).

### Fase 2 — Mesa ao vivo
- `koc-engine.ts` **puro** (fila, coroação, pontos, relógio) + testes — mesmo padrão
  de `match-scoring.ts`.
- Callables: `kocStartRound`, `kocRegisterRally`, `kocUndoRally`, `kocPauseClock`,
  `kocFinishRound`.
- Tela do mesário: trono, fila, cronômetro, dois botões grandes (rei venceu /
  desafiante venceu), desfazer.

### Fase 3 — Avanço de fase e encerramento
- `koc-standings.ts`: ordena por pontos → bola de ouro → último rei → confronto direto.
- `kocAdvancePhase`: fase completa → monta as rodadas da fase seguinte.
- `koc_final` completa → pódio pela tabela.
- Integrações: `tournament-completion.isFinalMatchType` (hoje `=== "final"` exato) e
  `league-ranking.ts:70` precisam aceitar `koc_final`, senão o torneio **não fecha**.

### Fase 4 — App do atleta (mínimo para o dia D)
Não é opcional: sem isso o card "Agora" renderiza uma rodada com os dois lados
vazios. O mínimo é card KOTC (elenco, quadra, horário) + tabela ao vivo da rodada,
tudo somente leitura. Chave por fase, pódio e histórico podem vir depois.

### Fase 5 — Ranking, XP e notificações — **pós-evento**
- Colocação KOTC → pontos de ranking (`tryAwardGlobalRankingForMatch` resolvendo por
  `kocStandings`, não pelo `winnerId` da final).
- Push de rodada (quadra, horário, elenco).

## 6. Riscos

| Risco | Mitigação |
|-------|-----------|
| Build de loja perder a janela da Apple | Corte em ~15/10; telas KOTC do atleta são somente leitura, sem dependência de callable nova |
| Rodada KOTC vazando para rating/histórico do mesmo torneio | Fase 0 antes de qualquer geração |
| Torneio não fechar por `isFinalMatchType` não conhecer `koc_final` | Coberto na Fase 3, com teste de fechamento |
| Mesário errar o rally (ritmo é alto) | `kocUndoRally` com log em `kocRallies` |
| Relógio divergir entre mesa e app | `clockEndsAt` no servidor; cliente só renderiza |
| Elenco ímpar não fechar rodadas | Rodadas de 3 e 4 na mesma fase; semeadura serpentina |
| Prazo apertado com o lançamento nas lojas em paralelo | KOTC fica atrás de uma categoria só; se atrasar, a etapa roda nos formatos atuais sem regressão |
