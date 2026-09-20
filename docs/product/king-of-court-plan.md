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
| Pontuação no ranking | **Não pontua** — nem ranking global, nem liga, nem XP (decidido 20/09) |
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

O que **não** entra no MVP: alvo de pontos, `crownScores` configurável e
modalidade individual/trio. Pontuação no ranking não entra **nem depois** — ver
Fase 5.

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

### Fase 1 — Configuração e geração da chave ✅ concluída
- `koc-bracket-builders.ts`: fases sucessivas, serpentina por seed na
  classificatória e cruzamento `(origem + colocação - 1) % destino` nas fases
  seguintes — a fórmula que garante que ninguém reencontre na fase seguinte quem
  acabou de enfrentar. Devolve `KocRoundDraft[]`, tipo próprio: `MatchDraft` fala
  em dois lados.
- `kocRoundDoc` + `resolveKocConfig` em `organizer-category-ops.ts`, e branch em
  `runGenerateCategoryBracket`. O doc grava `kocConfig` como snapshot.
- Enum, labels, `supportedBracketSystems` e os 3 mappers no app.
- `king_of_court_plan.dart`: espelho Dart do gerador, para o wizard mostrar o
  **tempo total de quadra** (ver seção 8).
- Tela `organizer_category_generate_koc_page.dart`, com a prévia calculada sobre
  as duplas REALMENTE pagas, e `generateBracketRouteFormat` reconhecendo KOTC —
  sem isso a categoria caía na tela de eliminatória simples.

**Cobertura.** Backend verde: 2778 testes (43 novos), incluindo a grade exata da
1ª etapa. Testes Dart escritos, não executados (sem SDK Flutter no ambiente).

**Piso do formato.** 3 duplas, checado no wizard
(`minTeamsToGenerateBracketFor`) e no backend. O mínimo genérico de 2 valeria
para KOTC e deixaria publicar uma rodada que não gira.

### Fase 2 — Mesa ao vivo ✅ concluída
- `koc-engine.ts` **puro**: fila, coroação, pontos e relógio, sem Firestore.
- Callables `kocStartRound`, `kocRegisterRally`, `kocUndoRally`, `kocSetClock`,
  `kocFinishRound` em `koc-match-ops.ts`.
- App: `koc_round_state.dart` (leitura do doc), `OrganizerKocOpsService` e a mesa
  em `organizer_koc_table_page.dart` — dois alvos grandes, fila, cronômetro e
  tabela ao vivo. `organizerMatchTablePath` escolhe a mesa pelo tipo da partida,
  num lugar só.

**Cobertura.** Backend verde: 2854 testes (76 novos). Testes Dart escritos, não
executados.

#### Três decisões que o código fixou

**O estado é sempre reproduzido do log, nunca ajustado.** O log de rallies vive
num array no próprio doc (`kocRallies`) — o relógio limita a rodada a algumas
dezenas de rallies, então cabe folgado, e toda operação vira uma leitura só.
Desfazer é reproduzir sem o último rally. Isso não é preciosismo: **desfazer uma
coroação não tem inversa única** (quem voltou para o trono? em que posição da
fila entrou o destronado?), e a mesa erra com frequência num formato de 20s por
rally.

**Rally carrega `expectedSeq`.** Duplo toque com rede ruim reenviaria o mesmo
rally e viraria ponto fantasma. Com o seq, o servidor recusa e a mesa recarrega.

**Empate que decide vaga TRAVA o encerramento.** O regulamento resolve na areia
(bola de ouro), e um critério silencioso decidindo classificação seria pior que
um erro visível. `kocFinishRound` recusa com `koc_unresolved_tie`; a mesa
oferece voltar e jogar o rally, ou aceitar o desempate automático
explicitamente. Empate que não atravessa o corte não trava nada.

### Fase 3 — Avanço de fase e encerramento ✅ concluída
- `koc-phase-advance.ts`: monta a fase seguinte a partir das tabelas da anterior.
- `tournament-completion.isFinalMatchType` passou a aceitar `koc_final` — era a
  linha que fazia a categoria terminar e o **torneio nunca fechar**.
- Pódio no app: `TournamentMatch.kocStandingTeamIds` + `computeCategoryPodium`.

**Cobertura.** Backend verde: 2876 testes (22 novos).

#### O gatilho é diferente do de duelo, e isso é o ponto

Uma partida de duelo propaga o vencedor **assim que acaba**. Uma fase KOTC só
pode ser montada quando **todas** as suas rodadas terminaram: antes disso as
vagas ainda estão em disputa nas outras quadras. Por isso `shouldAdvanceKocPhase`
não reaproveita `shouldPropagateMatchAdvance` — aquele é o gate dos consumidores
de duelo, que a fase 0 fechou para KOTC de propósito.

O avanço é **idempotente**: rodada que já tem elenco não é tocada, então retry de
trigger ou correção de resultado não embaralha quadra. E vaga sem dono (tabela
ausente ou curta) **não monta a rodada** — deixa o buraco visível para o
organizador em vez de publicar um elenco incompleto.

#### A ordem do elenco é decisão de mérito, não cosmética

Quem abre `kocTeamIds` começa **no trono**, e o trono é de onde os pontos vêm.
`resolveKocRoster` ordena por colocação e, dentro dela, pela rodada de origem —
então o melhor classificado entra defendendo, como o cabeça de chave abre a
classificatória.

#### O pódio KOTC não tem disputa de 3º

Sem eliminação, a tabela da rodada final já ordena todos: 1º, 2º e 3º saem dela.
`computeCategoryPodium` trata `koc_final` por esse caminho e ignora
`Third Place`, que não existe no formato. Tabela ausente devolve pódio vazio —
pódio torto é pior que pódio ausente.

#### Fica para a Fase 5 (ranking)

`league-ranking.ts` e `tournament-ranking.ts` resolvem colocação a partir de um
duelo final (`winnerId` + os dois lados). Para KOTC a colocação vem de
`kocStandings`, o que exige um resolver próprio — trabalho de ranking, não de
encerramento. O torneio já fecha sem isso; o que falta é **pontuar** a etapa.

### Fase 4 — App do atleta ✅ concluída
- `TournamentMatch.kocTeamIds` + `matchInvolvesTeam` ciente do elenco.
- `FocusKocRoundCard`: card próprio no Focus, no lugar do herói de duelo.
- `kocRoundProvider`: uma stream do doc, assinada pela mesa E pelo card.
- `kingOfCourtPhaseLabel`: "CLASSIFICATÓRIA · RODADA 3" / "SEMIFINAL" / "FINAL".

#### O bug que a fase 0 criou de propósito, e que esta fase pagou

A fase 0 gravou os dois lados VAZIOS para esconder a rodada dos consumidores de
duelo. O efeito colateral: ela ficou escondida **do próprio atleta**, porque
"esta partida é minha" era `teamAId == meuTime`. A rodada não renderizava errado
— simplesmente não aparecia.

A correção mora num ponto só: `matchInvolvesTeam`, o único lugar do app que
decide se a partida é do atleta. Numa rodada a dupla está no ELENCO. Com isso a
rodada volta a aparecer no Focus, na agenda e na convocação sem espalhar o
formato pelas telas.

#### O que ficou de fora, e por quê

A **jornada** (trilha da chave), o **pôster de campanha** e o "eliminado"
continuam com a checagem de duelo inline, o que exclui KOTC. Não é esquecimento:
são conceitos de chave. No KOTC ninguém é eliminado por perder um rally — deixa
de classificar pela tabela, e não existe "trilha" porque não existe caminho
único. O guard em `eliminatedFromKnockout` é explícito para dizer isso.

O card mostra a tabela ao vivo, o trono, a fila e o cronômetro; o rodapé explica
a regra que o público mais erra — **destronar não dá ponto**. Tudo somente
leitura: quem registra rally é a mesa.

### Fase 4b — Telão ✅ concluída
- `PublicKocRoundPage`: telão da rodada, tipografia grande, sem interação.
- `PublicKocBoardPage` + `kocBoardRoundId`: telão **por categoria**, que segue a
  rodada valendo.
- `PublicMatchLivePage` desvia para o telão KOTC quando a partida é uma rodada —
  o link público e o compartilhamento que já existem continuam valendo.
- Botão "abrir telão" na mesa, que é de onde o organizador opera no dia.

#### Por categoria, não por rodada

Numa quadra só as sete rodadas acontecem em sequência. Um telão por rodada
obrigaria alguém a trocar o link **sete vezes durante a etapa, na frente do
público**. O telão da categoria abre uma vez de manhã e acompanha até a final.

A precedência responde a quem está esperando: em andamento → **próxima a
entrar** → última concluída. Entre rodadas ele mostra quem sobe, não o resultado
de quem acabou de sair.

#### Um defeito da fase 4 que este trabalho revelou

`FocusRosters` indexa nomes de dupla pelos **dois lados** das partidas. A rodada
KOTC grava os dois vazios, então o card do atleta da fase 4 sairia com
"A definir" em **todas** as linhas do elenco — o dado que mais importa na tela.

Corrigido com `kocRosterNamesProvider`, que resolve os nomes pelos ids do
elenco. O `select` sobre o elenco é necessário, não decorativo: `kocRoundProvider`
emite a cada rally, e sem ele a busca de nomes seria refeita dezenas de vezes por
rodada para um dado que não muda. A mesa ganhou o mesmo resolver como fallback.

### Fase 4c — Portal do organizador ✅ concluída

**O erro que motivou esta fase.** O portal do organizador é o Angular em
`frontend/projects/organizer`, um **port próprio** do modelo Flutter — o
`tournament-create.model.ts` declara isso no topo. As fases 1 a 4 mexeram só no
app Flutter e nas functions, então a modalidade **não aparecia no wizard do
portal**: ele renderiza as opções de `SUPPORTED_BRACKET_SYSTEMS`, que tinha três
valores e nenhum era KOTC. Não era erro — era ausência.

Sete arquivos do portal duplicam o que o app já tinha, e todos precisaram da
modalidade:

| Arquivo | O que duplicava |
|---------|-----------------|
| `data/tournament-create.model.ts` | tipo, mapa Firestore, rótulos, descrição, `SUPPORTED_BRACKET_SYSTEMS`, parse |
| `data/tournament-create-mapper.ts` | escrita/leitura da config no doc |
| `data/league-create.model.ts` | escrita da config na categoria da liga |
| `data/organizer-ops.service.ts` | union de `format` da callable |
| `data/organizer-settings.model.ts` | lista de sistemas das preferências |
| `eventos/seeds.component.ts` | `BracketFormat` próprio, lista de formatos, piso de publicação |
| `eventos/wizard/criar-torneio.component.ts` | opções e config da categoria |

O wizard ganhou os steppers de duplas por quadra, classificam e duração, mais a
**estimativa de tempo total de quadra** (porta de `king_of_court_plan.dart`, que
por sua vez espelha o gerador no backend — a fonte da verdade continua sendo o
backend).

**Cobertura.** Portal: build de produção OK e 902 de 903 testes passando. A
falha restante é de FUSO (`14:32` esperado, `17:32` recebido = UTC-3) em
`inscricoes.rows.spec.ts`, arquivo não tocado aqui — pré-existente num ambiente
UTC.

#### O que este episódio revelou, e que segue ABERTO

O portal tem **mesa e telão próprios**: `painel/telao/` (`telao-screen`,
`telao-court-card`, `telao-config`) e `mesa-ao-vivo`, `placar`, `chaveamento`.

A mesa (fase 2) e o telão (fase 4b) foram construídos **no app Flutter**. Se o
organizador opera o dia pelo portal, faltam as duas telas lá — e sem a mesa no
portal **ninguém registra rally em 24/10**. O `telao-court-card` atual mostra
placar de duelo.

Decisão pendente: onde a etapa será operada. A resposta define se as duas telas
do Flutter bastam ou se precisam de par no portal.

### Fase 4d — Mesa e telão no portal ✅ concluída

A etapa será operada **nos dois** — app e portal —, então as duas telas do dia
precisam existir nos dois lugares.

| Peça | App Flutter | Portal Angular |
|------|-------------|----------------|
| Mesa | `organizer_koc_table_page.dart` | `mesa-koc.component.ts` |
| Telão | `public_koc_round_page.dart` | ramo KOTC em `telao-court-card` |

**Telão.** O do portal é organizado por QUADRA, o que encaixa melhor que a página
por categoria do app: a rodada ocupa quadra, então `courtNowOf` já a escolhe como
"ao vivo" sem mudança. Só faltava o corpo do card.

**Mesa.** Componente próprio, e a mesa de duelo **delega** — assim todo link
existente para `ao-vivo/:matchId` continua valendo. A checagem vem antes de
`teamsReady()`, que exige os dois lados definidos: a rodada não tem lados e
cairia para sempre no aviso de "aguardando as duas equipes".

#### Operar nos dois exigiu uma garantia que já existia

Duas mesas abertas na mesma rodada poderiam registrar o mesmo rally. O
`expectedSeq` da fase 2 resolve: o servidor recusa a segunda com
`koc_seq_mismatch`, a tela avisa, e o doc em tempo real já traz o estado certo —
não há nada a sincronizar na mão. Foi projetado contra duplo toque com rede ruim
e serviu de graça para duas mesas.

#### O mesmo defeito, pela terceira vez

`hydrateTeams` do telão colhia ids de `teamAId`/`teamBId` para resolver nomes e
fotos — vazios na rodada. O telão sairia com "Dupla" em todas as linhas, como o
card do app sairia com "A definir". **Todo código que junta ids pelos dois lados
perde a rodada**, e é o primeiro lugar a olhar ao levar KOTC para uma superfície
nova.

**Cobertura.** Portal: build de produção OK, 922 de 923 testes (20 novos em
`koc.spec.ts`). A falha é a de fuso pré-existente em `inscricoes.rows.spec.ts`.

`koc` é OPCIONAL em `TournamentMatch`: como obrigatório, toda fixture de duelo dos
specs teria de declarar `null`. E o `tsc` do app não pega isso — specs ficam fora
do `tsconfig.app.json`, então só `ng test` acusa.

### Fase 5 — Notificações — **pós-evento**
- Push de rodada (quadra, horário, elenco).

**Ranking saiu do escopo.** A categoria KOTC não pontua: nem ranking global, nem
ranking da liga, nem XP. Isso já é o comportamento — as guardas da fase 0 e o
ramo KOTC do trigger, que retorna antes de `tryAwardLeagueStagePointsForMatch`,
fecham os quatro caminhos.

Por isso `koc-no-ranking.test.ts` existe: a decisão está travada em teste, não só
aqui. Documento é revertido pelo commit seguinte; teste não. O mesmo arquivo
garante o outro lado — a rodada KOTC **continua** montando a fase seguinte e
fechando o torneio.

Uma categoria de duelo no MESMO torneio segue pontuando normalmente: a decisão é
sobre o formato, não sobre a etapa.

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

### Agenda do dia (2h35 de quadra contínua)

| Rodada | Horário | Elenco |
|--------|---------|--------|
| R1 | 0:00–0:15 | seeds 1, 8, 9, 16 |
| R2 | 0:20–0:35 | seeds 2, 7, 10, 15 |
| R3 | 0:40–0:55 | seeds 3, 6, 11, 14 |
| R4 | 1:00–1:15 | seeds 4, 5, 12, 13 |
| — | 1:15–1:30 | intervalo de fase |
| SF1 | 1:30–1:45 | 1ºR1, 2ºR2, 1ºR3, 2ºR4 |
| SF2 | 1:50–2:05 | 1ºR2, 2ºR1, 1ºR4, 2ºR3 |
| — | 2:05–2:20 | intervalo de fase |
| Final | 2:20–2:35 | 1º e 2º de cada semi |

O **intervalo de fase de 15 min não é folga**: sem ele, o 2º da R4 sai às 1:15 e
entra na SF1 às 1:20. É o descanso mínimo do caminho mais apertado.

### O que 1 quadra muda no formato

**A favor.** Todas as rodadas acontecem na mesma quadra, e a classificação é
sempre *dentro* da rodada (top 2). Não existe comparação de pontos entre quadras
com ritmos diferentes — o problema de justiça da seção anterior simplesmente não
existe aqui, e o desempate por aproveitamento deixa de ser necessário no MVP.

**Contra.** Quem cai na classificatória joga 15 min de um evento de 2h35. É o
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

> 7 rodadas × 15 min + trocas e intervalos = **2h35**

Com 20 min vira 3h10, com 10 min vira 2h. É essa linha que responde a pergunta
real ("cabe na minha reserva?") e evita descobrir o estouro no dia. A conta usa o
número de rodadas que a própria geração produz, então já está disponível.

Os números saem de `king_of_court_plan.dart`, que espelha o gerador do backend e
soma 5 min de troca entre rodadas mais os 15 min de intervalo entre fases. A
mesma conta com 2 quadras dá 1h35, e com 4 dá 1h15 — é o paralelismo, não a
duração, que domina o dia.

### Limites e aviso

Abaixo de 10 min a rodada fica rasa: a ~25s por rally, 10 min dão ~24 rallies e,
com 4 duplas em quadra, cerca de 12 por dupla. O wizard aceita, mas avisa. Abaixo
de 5 min recusa.
