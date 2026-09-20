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

## 3. Fases de entrega

### Fase 0 — Blindagem dos consumidores de duelo
Pré-requisito de tudo. Sem isso, uma rodada KOTC vaza para histórico e rating.

- `isDuelMatch(matchType)` em TS (`match-status.ts`) e Dart (`tournament_match.dart`).
- Aplicar em: `rating-engine`, `head-to-head`, `tournament-predictions`,
  `group-standings`, `category-bracket-advance`, `league-ranking`,
  `tournament_podium_logic`, histórico do atleta (`athlete_match_history_mapper`),
  `athlete_profile_stats_logic`.
- Teste de regressão: um doc `koc_round` não entra em nenhum desses caminhos.

Nota: `rating-engine.ts` já falha em `missing_fields` sem `teamAId`/`teamBId` —
falha segura, mas o guard explícito é o que trava a regressão.

### Fase 1 — Configuração e geração da chave
- Enum + labels (`tournament_create_logic.dart`), `supportedBracketSystems`.
- Parse nos 3 mappers: `tournament_create_mapper`, `league_create_mapper`,
  `league_stage_create_logic` (os três têm o mesmo `switch` de formato).
- UI de config em `organizer_category_format_section.dart`: duplas por quadra,
  duração da rodada, quantos classificam.
- `koc-bracket-builders.ts`: distribui o elenco pago em rodadas de `teamsPerCourt`
  por semeadura serpentina; devolve `MatchDraft[]`.
- Branch em `runGenerateCategoryBracket` (`organizer-category-ops.ts:367`).

### Fase 2 — Mesa ao vivo
- `koc-engine.ts` **puro** (fila, coroação, pontos, relógio, desempate) + testes —
  mesmo padrão de `match-scoring.ts`.
- Callables: `kocStartRound`, `kocRegisterRally`, `kocUndoRally`, `kocPauseClock`,
  `kocFinishRound`.
- Tela do mesário: trono, fila, cronômetro, dois botões grandes (rei venceu /
  desafiante venceu), desfazer.

### Fase 3 — Avanço de fase e encerramento
- `koc-standings.ts`: ordena por pontos → desempate configurado.
- `kocAdvancePhase`: fase completa → monta as rodadas da fase seguinte.
- `koc_final` completa → pódio pela tabela.
- Integrações: `tournament-completion.isFinalMatchType` (hoje `=== "final"` exato),
  `league-ranking.ts:70`, `tryAwardGlobalRankingForMatch` (resolver de colocação
  a partir de `kocStandings`, não de `winnerId` da final).

### Fase 4 — App do atleta
- Card "Agora" KOTC no Focus (tabela ao vivo + fila, não placar A×B).
- Tela da rodada; visão da categoria em formato tabela por fase.
- Pódio e histórico lendo `kocStandings`.

### Fase 5 — Ranking, XP e notificações
- Pontos de ranking por colocação na final.
- Push de rodada (quadra, horário, elenco).

## 4. Riscos

| Risco | Mitigação |
|-------|-----------|
| Rodada KOTC vazando para rating/histórico | Fase 0 antes de qualquer geração |
| Mesário errar o rally (ritmo é alto) | `kocUndoRally` com log em `kocRallies` |
| Relógio divergir entre mesa e app | `clockEndsAt` no servidor; cliente só renderiza |
| Elenco ímpar não fechar rodadas | Rodadas de 3 e 4 na mesma fase; semeadura serpentina |

## 5. Decisões em aberto
1. **Escopo do MVP** — torneio completo com fases, ou rodada avulsa primeiro?
2. **Pontuação** — só o rei pontua (oficial) ou todo vencedor de rally?
3. **Fim da rodada** — tempo, alvo de pontos, ou os dois?
4. **Modalidade** — só duplas, ou também individual/trio?
5. **Prazo** — entra na 1ª etapa da Liga (24/10) ou fica para depois do lançamento?
