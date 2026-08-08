# Desafios: torneios pequenos não pontuam no ranking global

**Data:** 2026-08-07
**Escopo:** Cloud Functions (`tournament-ranking.ts`) + copy dos wizards (app e web)

## Problema

Qualquer torneio pontua no ranking global hoje — a CF `tournament-ranking.ts` diz
"todo torneio pontua" e ignora o campo `rankingEnabled` que os dois wizards
(app Flutter e portal web) já gravam. Isso permite farming de pontos em eventos
minúsculos e faz o toggle "Vale pontos no ranking" mentir para o organizador.

O produto quer uma divisão: **torneio** (vale pontos) vs **desafio** (não vale).
Definição do dono: desafio é torneio com **menos de 10 duplas**.

## Regra de elegibilidade

Uma categoria concede pontos de ranking global (`athleteRankings`,
`teamRankings`, `tournamentCategoryResults`) se, no momento da premiação:

1. O torneio **é etapa de liga** (`leagueId` não vazio) → **sempre elegível**
   (isento da regra; comportamento atual preservado); OU
2. `rankingEnabled !== false` **E** a categoria tem **≥ 10 duplas pagas**
   (inscrições com `isPaid === true` e fora da lista de espera — mesma contagem
   do `loadPaidTeamIds` existente).

Constante `MIN_TEAMS_FOR_GLOBAL_RANKING = 10` ("menos de 10 duplas" = desafio).

**Não muda:** rating Glicko-2, XP/gamificação e pontos de ranking de liga.
Docs antigos sem `rankingEnabled` contam como `true` (mesmo default dos wizards).

## Implementação

### Cloud Function (`functions/src/tournament-ranking.ts`)

- Helper puro exportado:
  `isGlobalRankingEligible(params: {isLeagueStage: boolean; rankingEnabled: boolean; paidTeamsCount: number}): boolean`.
- Gate em `tryAwardGlobalRankingForMatch`, após carregar o doc do torneio
  (já carregado para `rankingWeight`): resolver `isLeagueStage` por
  `leagueId` não vazio e `rankingEnabled` por `!== false`; carregar
  `loadPaidTeamIds` uma única vez (hoje já é chamado no fluxo do bucket
  "groups" — reaproveitar a mesma carga) e avaliar o helper. Inelegível →
  retorna `{awarded: false, teamsUpdated: 0}` com log informativo, sem escrever
  nada.

### Copy dos wizards (comunicação mínima)

- Web (`criar-torneio.component.ts`, toggle "Vale pontos no ranking"): descrição
  passa a citar a regra automática — "Resultados contam para o ranking oficial.
  Categorias com menos de 10 duplas pagas não pontuam (desafio)."
- App Flutter (`tournament_create_rules_page.dart`, mesmo toggle): mesma frase.

## Testes

`functions/src/tournament-ranking.test.ts` (node:test + FakeFirestore, padrão
existente):

- `isGlobalRankingEligible`: etapa de liga sempre elegível (mesmo com toggle
  off ou 2 duplas); toggle off bloqueia; 9 pagas bloqueia; 10 pagas + toggle
  on passa; default de docs antigos (`rankingEnabled` ausente) conta como on.
- Fluxo: partida encerrada em categoria com 9 duplas pagas não escreve em
  `tournamentCategoryResults`/`athleteRankings`/`teamRankings`; com 10, escreve.

## Fora de escopo (deliberado)

- Divisão visual nas listagens (badge/aba "Desafios") — fase 2, spec próprio.
- Recálculo/estorno de pontos já concedidos.
- Limiar configurável (constante fixa em 10).
- Qualquer efeito em rating Glicko-2, XP ou ranking de liga.
- O efeito real exige **deploy das functions** (dev primeiro, padrão do projeto).

## Edge cases assumidos

- Contagem avaliada a cada premiação: se a categoria cruzar o limiar no meio do
  evento (raro — inscrições fecham antes da chave), partidas premiadas depois
  do cruzamento pontuam e as anteriores não; sem reprocessamento retroativo.
- `rankingWeight` continua respeitado quando a categoria é elegível.
