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
| Fim da rodada | **Tempo, configurável pelo organizador** (`roundEndMode: "time"`, padrão 900s); alvo de pontos não entra no MVP |
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

### Fase 0 — Blindagem dos consumidores de duelo ✅ concluída
Pré-requisito de tudo. Sem isso, uma rodada KOTC vaza para histórico e rating do
mesmo torneio que tem categorias normais.

**Fronteira.** `isDuelMatch` / `isKingOfCourtMatch` em `match-status.ts` e
`TournamentMatchType` em `tournament_match_type.dart`. Testam o **prefixo**
`koc_`, não uma lista fechada, para que um tipo KOTC novo já nasça blindado.

**Backend — seis triggers na coleção `matches`.** Cinco passam por três
predicados puros, que é onde a guarda entrou:

| Predicado | Protege |
|-----------|---------|
| `shouldPropagateMatchAdvance` | avanço de chave, ranking de liga, conclusão do torneio |
| `shouldProcessRatingUpdate` | Glicko e ranking global (que o importa como `shouldAwardForMatch`) |
| `shouldProcessTournamentMatchXp` | XP e palpites de chave |

O sexto (`onMatchLiveScoreChanged`) tem guarda direta: o push monta
"dupla A × dupla B".

**Backend — callables de escrita.** `assertDuelMatch` em `declareMatchWalkover`,
`submitMatchResult`, `updateLiveMatchScoreCore`, `advanceBracketWinner` e
`applyLeagueRankingForMatch`. As de **agenda** ficaram de fora de propósito
(`scheduleMatch`, `callMatchToCourt`, `releaseMatchAfterCheckIn`,
`revertMatchToScheduled`): a rodada KOTC ocupa quadra e horário como qualquer
outra e precisa delas.

**App.** `isBracketMatch` e `isPoolMatch` no modelo. O segundo era o vazamento
real: a rodada usa `poolId` para a quadra da fase, então sem a guarda ela
entraria na tabela de grupos da categoria. Mais o filtro por `isDuel` na campanha
do atleta.

#### O que a auditoria mostrou que NÃO precisava de guarda

Metade do inventário previsto já era segura, por dois motivos que vale registrar
porque também protegem o que vier depois:

- **Quem busca por `teamId`** nunca vê a rodada: ela grava `teamAId`/`teamBId`
  vazios, e nenhuma query `where(teamAId == <id real>)` casa com string vazia.
  Cobre `head-to-head`, `draw-sessions`, histórico e estatísticas do atleta.
- **Quem compara `matchType` por igualdade exata** já não casa com `koc_final`.
  Cobre `group-standings`, `tournament_podium_logic`, `league-ranking` e
  `focus_journey_logic`.

O perigo mora em quem usa `contains("final")`: `koc_final` casa. Havia dois,
ambos hoje inalcançáveis por serem alimentados por `teamId`, mas que passam a ser
alcançáveis na Fase 4, quando a rodada chega ao Focus do atleta —
`athlete_tournament_detail_mapper` (corrigido) e `draw-sessions` (segue seguro
pela query, com a fronteira anotada).

**Cobertura.** Suíte do backend verde: 2735 testes. Os testes Dart foram escritos
(`test/features/tournaments/domain/tournament_match_type_test.dart`) mas **não
executados** — não há SDK Flutter no ambiente onde a fase foi feita.

### Fase 1 — Configuração e geração da chave — **antes de 10/10**
- Enum + labels (`tournament_create_logic.dart`), `supportedBracketSystems`.
- Parse nos 3 mappers: `tournament_create_mapper`, `league_create_mapper`,
  `league_stage_create_logic` (os três têm o mesmo `switch` de formato).
- UI de config em `organizer_category_format_section.dart`: duplas por quadra,
  quantos classificam e **duração da rodada** (ver seção 8).
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
| Duração alterada na categoria mudar rodada já em jogo | `kocConfig` é snapshot na geração; o relógio lê a duração do doc da rodada, nunca da categoria |
| Elenco ímpar não fechar rodadas | Rodadas de 3 e 4 na mesma fase; semeadura serpentina |
| Prazo apertado com o lançamento nas lojas em paralelo | KOTC fica atrás de uma categoria só; se atrasar, a etapa roda nos formatos atuais sem regressão |

## 7. Desenho da 1ª etapa — 16 duplas, 1 quadra

Decidido em 20/09: campo de **16 duplas**, **uma quadra** dedicada à categoria,
**um turno** de classificatória.

### Config da categoria

```json
{
  "teamsPerCourt": 4,
  "qualifiersPerRound": 2,
  "phaseCount": 3,
  "roundEndMode": "time",
  "roundDurationSec": 900,
  "crownScores": false
}
```

16 ÷ 4 fecha exato: 4 rodadas → 8 duplas → 2 semifinais → 4 duplas → final.
Sete rodadas, sem bye e sem sobra.

### Semeadura

Classificatória em serpentina pelo seed — cada rodada soma 34, então não existe
rodada da morte:

| Rodada | Seeds |
|--------|-------|
| R1 | 1, 8, 9, 16 |
| R2 | 2, 7, 10, 15 |
| R3 | 3, 6, 11, 14 |
| R4 | 4, 5, 12, 13 |

Semifinais por cruzamento, reaproveitando o padrão de
`crossoverFirstRoundPairings` (`category-bracket-builders.ts`):

- **SF1** — 1º R1, 2º R2, 1º R3, 2º R4
- **SF2** — 1º R2, 2º R1, 1º R4, 2º R3

Os dois classificados de uma mesma rodada caem em semifinais diferentes: ninguém
reencontra adversário antes da final. Cada semi leva dois primeiros e dois
segundos colocados.

Final: 1º e 2º de cada semifinal. A tabela da final **é** o pódio.

### Agenda do dia (2h30 de quadra contínua)

| Rodada | Horário | Elenco |
|--------|---------|--------|
| R1 | 0:00–0:15 | seeds 1, 8, 9, 16 |
| R2 | 0:20–0:35 | seeds 2, 7, 10, 15 |
| R3 | 0:40–0:55 | seeds 3, 6, 11, 14 |
| R4 | 1:00–1:15 | seeds 4, 5, 12, 13 |
| — | 1:15–1:30 | intervalo de fase |
| SF1 | 1:30–1:45 | 1ºR1, 2ºR2, 1ºR3, 2ºR4 |
| SF2 | 1:50–2:05 | 1ºR2, 2ºR1, 1ºR4, 2ºR3 |
| Final | 2:15–2:30 | 1º e 2º de cada semi |

O **intervalo de fase de 15 min não é folga**: sem ele, o 2º da R4 sai às 1:15 e
entra na SF1 às 1:20. É o descanso mínimo do caminho mais apertado.

### O que 1 quadra muda no formato

**A favor.** Todas as rodadas acontecem na mesma quadra, e a classificação é
sempre *dentro* da rodada (top 2). Não existe comparação de pontos entre quadras
com ritmos diferentes — o problema de justiça da seção anterior simplesmente não
existe aqui, e o desempate por aproveitamento deixa de ser necessário no MVP.

**Contra.** Quem cai na classificatória joga 15 min de um evento de 2h30. É o
preço de um turno só, e foi decisão consciente: dois turnos custariam +1h20 na
mesma quadra.

**Risco novo.** Rodadas sequenciais cascateiam atraso: um estouro na R1 empurra
as outras seis. Com quadras em paralelo o atraso fica contido em uma. Mitigação:
cronômetro fechado no servidor (`clockEndsAt`), 5 min de troca entre rodadas e os
15 min de intervalo de fase como colchão.

**Convocação escalonada.** As duplas da R4 não precisam chegar às 0:00 — chegam
1h depois. Isso sai de graça: a agenda já grava `scheduleTime` por partida e o
push de convocação da Fase 5 usa o mesmo campo. Sem isso, 12 duplas ficam
esperando na beira da quadra.

## 8. Duração da rodada — configuração

A duração não é constante: é o parâmetro que o organizador mais vai querer mexer,
porque é ele que define se o dia cabe na reserva da quadra.

### Três níveis, do mais amplo ao mais local

**1. Padrão da categoria** (wizard, Fase 1) — `roundDurationSec`, stepper de 5 em
5 min, faixa de **5 a 40 min**, padrão 15. É o valor que popula todas as rodadas
na geração da chave.

**2. Override por fase** (wizard, opcional) — `phaseDurationsSec: {"1": 900, "2":
900, "3": 1200}`. Fase sem entrada cai no padrão. Atende o caso real de querer uma
final mais longa que a classificatória.

**3. Ajuste da rodada no dia D** (mesa, Fase 2) — `kocSetRoundDuration` antes de
iniciar, e `kocAdjustClock` (±1 min) com a rodada em andamento.

O nível 3 não é luxo: é a mitigação direta do risco de cascata da seção 7. Com uma
quadra e sete rodadas em sequência, um estouro na R1 empurra as outras seis, e
encurtar uma rodada no meio do dia é o único jeito de recuperar o horário sem
cortar rodada.

### Onde o valor mora

`kocConfig` no doc da rodada é a **fonte da verdade** do relógio, gravada como
snapshot na geração. A config da categoria é só o molde que a preenche: mudar a
categoria depois não mexe em rodada já gerada nem, muito menos, em rodada em jogo.

`clockEndsAt` é derivado no servidor em `kocStartRound` (`startedAt + duração +
pausedAccumSec`) e **recalculado** por `kocSetRoundDuration` / `kocAdjustClock`.
O cliente nunca calcula prazo — só renderiza a contagem até `clockEndsAt`.

### O wizard precisa mostrar a conta

Duração isolada não diz nada ao organizador; o que ele precisa ver é o **tempo
total de quadra**:

> 7 rodadas × 15 min + intervalos = **2h30**

Com 20 min vira 3h05, com 10 min vira 1h55. É essa linha que responde a pergunta
real ("cabe na minha reserva?") e evita descobrir o estouro no dia. A conta usa o
número de rodadas que a própria geração produz, então já está disponível.

### Limites e aviso

Abaixo de 10 min a rodada fica rasa: a ~25s por rally, 10 min dão ~24 rallies e,
com 4 duplas em quadra, cerca de 12 por dupla. O wizard aceita, mas avisa. Abaixo
de 5 min recusa.
