# Multiesporte: organização, ranking e funções para todos os esportes

Data: 2026-10-03

## Contexto

O produto nasceu para vôlei de praia e o código reflete isso: "esporte" não é um conceito do
domínio, é uma string que aparece em vários vocabulários e nunca carrega regra. O inventário
feito em 03/10/2026 nas três camadas (Cloud Functions, app Flutter, portais Angular) mostrou:

- **Torneio só aceita 3 esportes.** `TournamentSport` tem `beachVolleyball`, `indoorVolleyball`
  e `footvolley` no app (`tournament_create_draft.dart:3`) e no portal
  (`tournament-create.model.ts:8`). Beach tennis não pode ser criado, embora o backend já mapeie
  `beachtennis → BEACH_TENNIS` (`category-level-eligibility.ts:195-209`).
- **Coerção silenciosa.** Valor desconhecido de `sport` vira `beachVolleyball` ao reler o doc:
  3 mappers e 3 sessions no app (`tournament_create_mapper.dart:292`, `league_create_mapper.dart:206`,
  `organizer_leagues_repository.dart:483`, `*_create_session.dart`) e 2 no portal
  (`tournament-create-mapper.ts:226`, `league-create.model.ts:477`). Qualquer esporte novo gravado
  no Firestore é reescrito como vôlei de praia quando um cliente antigo reedita o evento.
- **Placar é vôlei de praia hard-coded** (21/15, vantagem de 2, saque rally) em 4 cópias:
  `functions/src/match-scoring.ts` (autoritativo), `frontend/shared/live-scoring/match-scoring.ts`,
  `match_scoring_logic.dart` + `tournament_match_display.dart:108-135` no app e
  `athlete/.../data/matches-repository.ts:227-239`. O único ajuste é `bestOf`, e `bestOf5` vira 3 no
  servidor (`match-scoring.ts:27-29`, `organizer-match-ops.ts:815-822`). Não existe nada que
  expresse games, tie-break ou no-ad.
- **Ranking geral não tem esporte.** `athleteRankings/{athleteId}` e `teamRankings/{teamId}` somam
  pontos de todos os esportes (`tournament-ranking.ts:107-117`, entradas sem `sport`). A tela web
  filtra pelo esporte do **perfil** do atleta, não do torneio.
- **Vocabulários.** 2 no backend (`tournaments.sport` camelCase; `ATHLETE_SPORT_CODES` em
  UPPER_SNAKE), 4 nos portais, 6 no app. Pontes com perda: futevôlei vira vôlei indoor no chip de
  arena (`sport-chip.ts:131-158`), padel vira `null`, desconhecido vira vôlei de praia.
- **Equipe é dupla.** `resolveCategoryTeamSize` tem piso 2 (`tournament-team-category.ts:52-73`);
  `player1Id`/`player2Id` em cerca de 30 arquivos; "dupla" em 573 ocorrências no app e cerca de
  380 no portal; slots de saque `1|2` e tempo médico `^[AB][12]$` assumem 2 por lado.
- **Já bom e reaproveitável:** chaves 100% por formato, sem referência a esporte;
  `ratingLadders/{SPORT}` com flags editáveis sem deploy (`rating-config.ts:226-243`);
  `levelsBySport`; o padrão de id `athleteRatings/{uid}_{SPORT}`; presets de categoria neutros.
- **Bugs de passagem:** `draw-sessions.ts:391` lê `sportId` (campo inexistente, sorteio ignora
  nível por esporte); `head-to-head.ts:318-328` compara o código de perfil com o enum do torneio;
  Bora Jogar usa chave minúscula em `levelsBySport` (`friendly-match-logic.ts:113`);
  `athlete_profile.dart:524-535` não tem "Futevôlei" no mapa rótulo → id.

## Decisões do dono

- **Direção:** catálogo canônico + perfil de placar por categoria + ranking particionado por
  esporte, dentro do modelo Firestore atual. Rejeitados: módulo/plugin por esporte (triplica
  código em três plataformas para uma variabilidade que cabe em quatro estratégias) e motor de
  regras interpretado do Firestore (interpretador em três linguagens e não entra nas rules).
- **Fase 0 vai primeiro:** estancar a coerção e corrigir os bugs antes de existir esporte novo
  na base, porque o app da loja reescreve o doc.
- **Beach tennis é o primeiro esporte novo de competição.** Os demais entram pelo catálogo com
  grau de suporte explícito, não "todos de uma vez".
- **Retrocompatibilidade é obrigatória** (CLAUDE.md): nenhum valor já persistido muda de grafia;
  tudo é normalizado na leitura.

## Definições

| Termo | Definição |
|---|---|
| Código do esporte | Valor camelCase persistido em `tournaments.sport` e `leagues.sport` (`beachVolleyball`, `beachTennis`, `padel`). É a chave do catálogo. |
| Código de perfil | Valor UPPER_SNAKE persistido em `users.sportOnboarding.levelsBySport`, `athleteRatings/{uid}_{code}` e `ratingLadders/{code}` (`VOLEI_PRAIA`). Não muda. |
| Alias | Grafia legada ou rótulo que resolve para um código do esporte na leitura (`beach_volleyball`, `beachvolleyball`, "Vôlei de praia"). Nunca é gravado por código novo. |
| Grau de suporte | O que o esporte pode fazer: `profile` (só nível no perfil e Bora Jogar), `ranking` (perfil + rating/ranking), `competition` (tudo: torneio, liga, mesa, telão). |
| Perfil de placar | Objeto `scoringProfile` que diz como uma partida é pontuada e encerrada. Mora na categoria e é carimbado em cada partida na geração da chave. |
| Tipo de placar | O `kind` do perfil: `sets_points`, `sets_games`, `single_score`, `timed_rally`. Cada tipo é uma estratégia nas três implementações. |
| Tamanho da equipe | `teamSize` da categoria (1 a 5). Substitui "dupla" como unidade de participação. |
| Vetores de placar | Arquivos JSON com entradas e saídas esperadas das estratégias, consumidos pelos testes em TypeScript e Dart. |

## Arquitetura

### Eixo 1: catálogo canônico de esportes

**Fonte da verdade:** `sports/catalog.json` na raiz do repositório. Um script Node
(`sports/codegen.js`) gera três artefatos commitados:

- `frontend/shared/sports/catalog.generated.ts`, exportado pelo pacote `@nexago/sports`
  (novo alias em `frontend/tsconfig.json`, ao lado de `@nexago/levels`).
- `functions/src/sports/catalog.generated.ts`.
- `nexago_app/lib/core/sports/catalog.generated.dart`.

Cada entrada do catálogo:

```json
{
  "code": "beachTennis",
  "profileCode": "BEACH_TENNIS",
  "label": "Beach tennis",
  "shortLabel": "BT",
  "icon": "racket",
  "coverArt": "beach_tennis",
  "aliases": ["beach_tennis", "beachtennis", "Beach tennis", "Beach tênis"],
  "support": "competition",
  "defaultTeamSize": 2,
  "allowedTeamSizes": [1, 2],
  "defaultScoringProfile": { "kind": "sets_games", "...": "ver eixo 2" },
  "formats": ["groups_knockout", "single_elimination", "double_elimination", "round_robin"],
  "arenaCourtTypes": ["Beach tennis"]
}
```

Catálogo inicial (grau de suporte na data deste spec; o grau sobe por fase, não por deploy
avulso):

| Código | Perfil | Suporte | Observação |
|---|---|---|---|
| `beachVolleyball` | `VOLEI_PRAIA` | competition | Como hoje |
| `indoorVolleyball` | `VOLEI_QUADRA` | competition | Como hoje; placar 25/15 na fase 2 |
| `footvolley` | `FUTEVOLEI` | competition | Como hoje; placar 18/15 na fase 2 |
| `beachTennis` | `BEACH_TENNIS` | profile → competition na fase 2 | Já tem arte de capa. Ver emenda de 04/10 |
| `tennis` | `TENIS` | profile → competition na fase 3 | Individual exige fase 4 |
| `padel` | `PADEL` (novo) | entra no catálogo na fase 3 | Código de perfil novo entra nas rules |
| `pickleball` | `PICKLEBALL` (novo) | entra no catálogo quando houver uso | Placar side-out fica fora deste spec |
| `football` | `FUTEBOL` | profile | `single_score` fora deste spec |
| `basketball` | `BASQUETE` | profile | idem |
| `running` | `CORRIDA` | profile | Sem competição no produto |
| `other` | `OUTROS` | profile | |

**Resolução de alias.** `resolveSportCode(raw)` normaliza (minúsculas, sem acento, sem espaço e
sublinhado) e procura no código e nos aliases. Retorna `null` para desconhecido. **Nenhum
leitor cai em vôlei de praia por default.** Onde hoje há default (chip de arena, agenda do
atleta, "Vôlei de praia" como fallback de exibição), passa a exibir "Esporte não informado" ou a
usar o esporte principal do perfil, explicitamente.

**Pontes substituídas.** `tournamentSportToLevelSportCode` (backend, `@nexago/levels` e Dart)
passa a ler `catalog[code].profileCode`. `sportChipFromLabel`, `defaultSportChipFromProfile`,
`_labelToAppSportId` e os mapas de ícone e rótulo espalhados (5 de rótulo e 6 de ícone no app;
10 cópias de rótulo nos portais) são apagados e lidos do catálogo.

**Rules.** `firestore.rules` não lê arquivo. A lista de códigos de perfil em
`sportLevelNotLowered` (linhas 516-553) continua escrita à mão; um teste em `functions`
compara essa lista com o catálogo e falha se divergirem. Padel e pickleball entram na lista.

**Esporte do torneio congela.** Na rule de `tournaments` e `leagues`, `sport` só pode mudar por
admin ou super admin. Gestor, staff e mesário precisam reenviar o mesmo valor. Isso é o que
impede o app antigo de rebaixar um torneio de beach tennis para vôlei ao reeditar: o save é
recusado inteiro, que é o comportamento desejado até o build mínimo subir.

### Eixo 2: perfil de placar

**Onde mora.** `tournaments.categories[].scoringProfile` (objeto). Na geração da chave,
`bracketMatchDoc` (`organizer-category-ops.ts:128-145`) carimba `scoringProfile` na partida ao
lado de `bestOf`, que continua sendo gravado por compatibilidade (`bestOf` = `scoringProfile.bestOf`).
O servidor é autoritativo: `submitMatchResult` e `updateLiveMatchScoreCore` validam contra o
perfil da partida, nunca contra o que o cliente manda.

**Partida sem perfil (legado).** `scoringProfileOf(matchDoc, tournamentSport)` deriva: tipo
`sets_points` com os defaults do esporte do torneio e `bestOf` do doc (1 ou 3). Isso cobre toda a
base atual sem backfill.

**Tipos e parâmetros.**

```ts
type ScoringProfile =
  | { kind: 'sets_points'; bestOf: 1 | 3 | 5; setTarget: number; decidingSetTarget: number;
      winBy: number; pointCap: number | null }
  | { kind: 'sets_games'; bestOf: 1 | 3 | 5; gamesPerSet: number; winByGames: number;
      tiebreakAtGames: number | null; tiebreakTo: number; noAd: boolean;
      decidingSet: 'full' | 'super_tiebreak'; superTiebreakTo: number }
  | { kind: 'single_score'; periods: number; tieAllowed: boolean }
  | { kind: 'timed_rally'; durationSec: number; teamsPerCourt: number };
```

Defaults por esporte (editáveis por categoria no wizard; o wizard mostra só os campos do tipo):

| Esporte | Perfil padrão |
|---|---|
| Vôlei de praia | `sets_points` MD3, 21, decisivo 15, vantagem 2, sem teto |
| Vôlei de quadra | `sets_points` MD3, 25, decisivo 15, vantagem 2, sem teto |
| Futevôlei | `sets_points` MD3, 18, decisivo 15, vantagem 2, sem teto |
| Beach tennis | `sets_games` MD3, 6 games, vantagem 2, tie-break em 6-6 a 7, no-ad, 3º set super tie-break a 10 |
| Tênis | `sets_games` MD3, 6 games, vantagem 2, tie-break em 6-6 a 7, com vantagem, 3º set completo |
| Padel | `sets_games` MD3, 6 games, vantagem 2, tie-break em 6-6 a 7, no-ad, 3º set completo |
| KOTC (formato, não esporte) | `timed_rally` como hoje (`kocConfig`) |

`single_score` entra no tipo para o catálogo fechar, mas **não é implementado neste spec**
(futsal, futebol e basquete seguem em `profile`). `bestOf: 5` passa a ser respeitado em
`sets_points`: 5º set usa `decidingSetTarget`.

**Representação do placar na partida.** `sets[]` continua sendo a lista de sets fechados.

- `sets_points`: `{a, b}` em pontos, como hoje.
- `sets_games`: `{a, b}` em games, mais `tb: {a, b}` quando o set fechou em tie-break ou super
  tie-break. O set decisivo em super tie-break grava `{a: 1, b: 0, tb: {a: 10, b: 7}}`.
- `resultA`/`resultB` continuam sendo "sets vencidos" para o cliente antigo.

**Placar ao vivo.** `liveScore` ganha `pointsA`/`pointsB` (pontos dentro do game, inteiros
0 a 4 para 0/15/30/40/AD, ou pontos do tie-break) e passa a usar `gamesA`/`gamesB` para games.
Os campos legados `currentGamesA`/`currentGamesB` continuam sendo escritos com o valor que o
cliente antigo espera: pontos do set em `sets_points`, games em `sets_games`. Param de ser
escritos quando o build mínimo passar do primeiro build que lê os novos.

**Estratégias.** Uma por tipo, mesma interface nas três implementações:

```ts
interface ScoringStrategy {
  isSetWon(set, index, profile): boolean
  setWinnerSide(sets, index, profile): 'A' | 'B' | null
  matchWinnerSide(sets, profile): 'A' | 'B' | null
  validateSubmission(sets, profile): Issue[]
  applyPoint(state, side, profile): state      // só mesa ao vivo
  undoPoint(state, profile): state
  rulesLabel(profile): string                  // "MD3 · 21 pts · decisivo 15"
  setPointHint(state, profile): string | null  // "set point", "match point", "tie-break"
}
```

Ficam em `functions/src/scoring/` (autoritativo), `frontend/shared/scoring/` (pacote
`@nexago/scoring`, substitui `@nexago/live-scoring/match-scoring.ts`) e
`nexago_app/lib/core/scoring/`. As quatro cópias de hoje são apagadas e os consumidores
(mesa, lançamento rápido, telão, overlay, Focus, ponto a ponto, pôster, notificação de set
point, Live Activity, standings de grupo) passam a receber o perfil. `tournament_match_display.dart`
e `matches-repository.ts` do portal do atleta deixam de ter constantes próprias.

**Saque e tempos.** `serving-player.ts` e `match_serving_player_logic.dart` recebem `teamSize`
(slots 1..N) e, em `sets_games`, alternam o sacador por game, não por ponto. Tempo médico e
técnico ficam em `scoringProfile.timeouts` só se um esporte precisar de valor diferente; na data
deste spec todos usam os valores atuais, então o campo não existe ainda.

**Standings de grupo.** `group-standings.ts` ganha critério por tipo: `sets_points` mantém
vitórias → saldo de pontos → confronto direto; `sets_games` usa vitórias → saldo de sets →
saldo de games → confronto direto. O critério é derivado do tipo, não configurável.

### Eixo 3: ranking e rating por esporte

**Ranking geral.** Novo id `athleteRankings/{athleteId}_{profileCode}` e
`teamRankings/{teamId}_{profileCode}`, mesmo padrão de `athleteRatings`. Cada entrada de
`results[]` ganha `sport` (código do esporte). `tournamentCategoryResults` ganha `sport` também.

- **Dupla escrita** durante a transição: o doc legado sem sufixo continua recebendo tudo somado,
  para o app da loja; o doc por esporte recebe só o seu. A dupla escrita acaba quando o build
  mínimo passar do build que lê o doc por esporte.
- **Backfill** por script admin: percorre `tournamentCategoryResults`, resolve `sport` pelo
  torneio e regrava os docs por esporte. Idempotente, paginado, `dryRun`.
- **Telas.** A aba Ranking (app e portal) ganha filtro de esporte, com default no esporte
  principal do perfil, e lê o doc do esporte filtrado. O esporte de um resultado é o do torneio,
  nunca o do perfil. O ranking de liga já é por liga e não muda.

**Rating.** `RATED_SPORT_CODES` sai do código. A engine lê `ratingLadders/{profileCode}.flags.ratingEnabled`
(já existe) para decidir se rateia; ausente é `false`. `athlete-ratings-repository.ts:13` no
portal passa a consultar o mesmo doc. Ligar rating para beach tennis vira edição de config.

**Escada de nível.** Continua única, 7 degraus, para todos os esportes. `levelRank` está
persistido em `athleteRatings` e nas rules; escada por esporte é mudança futura e não entra
aqui. O que já é por esporte (`levelsBySport`, `levelLocked`, `ratingLadders.levels` como
override de rótulo) continua.

### Eixo 4: equipe por tamanho

- `resolveCategoryTeamSize` perde o piso 2. `teamSize: 1` é individual: inscrição solo sem
  parceiro, sem convite, sem reserva pendente; a equipe tem `memberUids` com um uid e
  `player2Id` ausente.
- `allowedTeamSizes` do catálogo limita o que o wizard oferece por esporte.
- `participantNoun(teamSize)` (`"atleta"`, `"dupla"`, `"trio"`, `"quarteto"`, `"quinteto"`,
  plural e artigo) substitui "dupla" literal nas mensagens de erro do backend e nos textos de
  mesa, telão, Focus e inscrição. O texto de marketing e de telas que só existem para vôlei
  (KOTC) não muda.
- `head-to-head.ts:172-197` passa a usar `extractTeamMemberUids` em vez de `player1Id`/`player2Id`.
- Capa de equipe (`team_cover_art_catalog.dart`) passa a ser indexada pelo esporte do
  **torneio** da inscrição, com fallback no esporte principal do titular.

### Eixo 5: arena e descoberta

- `arenas.courtTypes[]` e `courts.types[]` passam a aceitar o código do esporte além do rótulo.
  Leitura resolve os dois pelo catálogo (`arenaCourtTypes` são aliases). Escrita nova grava o
  código. Sem backfill: a base atual é lida por alias.
- `arenaMatchesSportChip` e `sportFirestoreIdFromChip` deixam de casar substring; o chip é o
  código do esporte e o casamento é por igualdade após resolução de alias. `ArenaSportChip`
  vira a lista de esportes do catálogo com `arenaCourtTypes` não vazio, mais `all`.
- `courts.sport`, que o portal do atleta e o site leem mas o portal da arena nunca escreve,
  passa a ser escrito como `types[0]` resolvido para código.

## Compatibilidade e migração

| Situação | Comportamento |
|---|---|
| Doc com `sport` em grafia legada (`beach_tennis`) | Resolvido por alias na leitura. Não é regravado. |
| Doc com `sport` desconhecido | `resolveSportCode` retorna `null`; UI mostra o código em title case (emenda de 04/10); elegibilidade cai no nível global, como hoje. Nunca é coagido. |
| App antigo reedita torneio de esporte novo | Rule recusa o update porque `sport` mudaria. O organizador vê erro de salvamento e precisa do app novo. Aceito. |
| Partida sem `scoringProfile` | Derivado de `bestOf` + esporte do torneio. |
| `liveScore` lido por app antigo | `currentGamesA/B` continuam escritos até o build mínimo subir. |
| Ranking lido por app antigo | Doc legado continua escrito (dupla escrita) até o build mínimo subir. |
| `ratingLadders/{code}` sem `flags.ratingEnabled` | Não rateia. Hoje `VOLEI_PRAIA` e `VOLEI_QUADRA` têm o doc; conferir a flag antes do deploy da fase 3 para não desligar rating por engano. |
| Código de perfil novo (`PADEL`, `PICKLEBALL`) | Entra em `ATHLETE_SPORT_CODES`, nas rules e no catálogo na mesma PR. |

O gate de versão (`appConfig/appVersion.minBuildNumber`) é o mecanismo para encerrar cada
dupla escrita. Cada fase que introduz um campo novo lido pelo app registra qual build passa a
lê-lo.

## Fases

Cada fase é uma PR própria, mergeável sozinha, atrás de nada que dependa da fase seguinte.

**Fase 0: estancar.**
Remover a coerção para `beachVolleyball` (8 pontos listados no Contexto; valor desconhecido
é preservado como string). Congelar `sport` nas rules de `tournaments` e `leagues`. Corrigir
`draw-sessions.ts` (`sportId` → `sport`), `head-to-head.ts` (comparar código de perfil),
`friendly-match-logic.ts` (chave em UPPER_SNAKE) e `athlete_profile.dart` (futevôlei no mapa).
Saída: nenhum caminho reescreve `sport`; testes de rules cobrindo o congelamento.

**Fase 1: catálogo.**
`sports/catalog.json`, codegen, `@nexago/sports`, `functions/src/sports/`, `core/sports/` no
app. Trocar as pontes de código e os mapas de rótulo e arte pelo catálogo. Teste rules ×
catálogo. Saída: um esporte novo de perfil entra editando um arquivo; nenhuma tela mostra
"Vôlei de praia" para algo que não é.

**Emenda de 04/10/2026 (fase 1).**
- **Beach tennis abre na fase 2, não na 1.** A validação de placar hoje exige set de 21 pontos
  com vantagem de 2 no servidor e nas mesas; um set de beach tennis (6-4) é recusado. Abrir a
  criação antes do tipo `sets_games` geraria torneios impossíveis de operar. Na fase 1
  `beachTennis` fica no catálogo com suporte `profile`, e o torneio legado nessa grafia segue
  travado pelo `sportRaw` da fase 0, agora exibindo "Beach tennis".
- **Esporte desconhecido mostra o próprio código em title case** ("Padel", "Curling"), não
  "Esporte não informado". O rótulo genérico fica só para ausência do campo. Motivo: o código
  é informação real e "não informado" seria falso.
- **Padel e pickleball ficam fora do catálogo inicial.** Código de perfil novo mexe nas rules
  de nível, que já estão perto do teto de avaliação; entram quando houver uso.
- **Ícones e chips de arena/descoberta ficam fora da fase 1.** Os ícones por tela são escolha
  visual e os chips são da fase 5. O campo `icon` entra no catálogo quando o primeiro
  consumidor for migrado.
- **Normalização igual nas três linguagens por construção:** minúsculas, tabela fixa de
  acentos do português, remove tudo que não é letra ou dígito. Os vetores de teste moram no
  `catalog.json` e o codegen os emite nos três alvos.

**Fase 2: perfil de placar e beach tennis.**
`beachTennis` entra em `TournamentSport` nas três superfícies e sobe para `competition`, já
com `sets_games` (emenda de 04/10). Tipo `ScoringProfile`, estratégias `sets_points` e `sets_games` nas três implementações,
vetores de placar, carimbo na partida, derivação para legado, validação no servidor,
`liveScore` novo com dupla escrita, wizard com campos por tipo, consumidores lendo o perfil,
standings por tipo, saque por game. Vôlei de quadra e futevôlei passam a usar seus defaults.
Saída: mesa, telão, overlay, Focus e pôster corretos para beach tennis com tie-break e super
tie-break; vetores verdes nas três linguagens.

**Emenda de 04/10/2026 (fase 2): quatro entregas.**
A fase 2 toca placar em três plataformas e em cerca de quinze telas; vira quatro PRs, cada um
mergeável sozinho, e beach tennis só abre no último.
- **2a, núcleo, sem mudança de comportamento.** Tipo `ScoringProfile` (`sets_points` e
  `sets_games`), regras de vencedor de set e de partida e validação de placar final nas três
  linguagens, com vetores compartilhados em `sports/scoring-vectors.json`. `scoringProfile`
  padrão no catálogo. Carimbo na partida em `bracketMatchDoc`. As quatro cópias da regra de 21
  pontos passam a delegar ao núcleo com o perfil histórico. O servidor grava `tb` nos sets de
  games e decide o vencedor pelo perfil; continua aceitando placar parcial como hoje.
- **2b, lançamento e mesa.** Lançamento rápido (app e portal) e mesa ao vivo lendo o perfil:
  games, pontos 0/15/30/40/AD, tie-break, super tie-break, saque por game, `liveScore` novo em
  dupla escrita.
- **2c, exibição.** Telão, overlay, Focus, pôster, ponto a ponto, card da chave e critério de
  desempate dos grupos por tipo.
- **2d, abrir beach tennis.** Wizard com os campos de cada tipo, `beachTennis` no enum e em
  `competition`, defaults 25/15 (quadra) e 18/15 (futevôlei) só quando o wizard deixar o
  organizador escolher o alvo.

Decisões que valem para a fase 2 inteira:
- **Partida sem perfil carimbado usa a regra histórica, qualquer que seja o esporte** (21,
  decisivo 15 só no 3º set de MD3, vantagem 2). Derivar pelo esporte mudaria o alvo de torneios
  de futevôlei já em andamento no meio do evento.
- **Até a 2d, os esportes de competição atuais têm perfil padrão igual à regra histórica.** Trocar
  para 25 ou 18 sem o organizador poder escolher fecharia sets cedo na mesa ao vivo de quem joga
  a 21.
- `single_score` e `timed_rally` saem do tipo até existir estratégia para eles.

**Fase 3: ranking e rating por esporte.**
Docs por esporte, `sport` nas entradas, dupla escrita, backfill, filtro de esporte na aba
Ranking (app e portal), gate de rating por flag. Tênis e padel sobem para `competition`.
Saída: ranking de beach tennis separado do de vôlei; rating ligável por config.

**Fase 4: equipe por tamanho.**
Piso 1 em `teamSize`, inscrição individual, `participantNoun`, slots de saque por tamanho,
tempo médico por slot, confronto direto por `memberUids`, capa de equipe pelo esporte do torneio.
Saída: torneio de tênis individual de ponta a ponta.

**Fase 5: arena e descoberta.**
Códigos em `courtTypes`/`types`, chip por igualdade, `courts.sport` escrito. Saída: filtro por
esporte da aba Reservar exato, sem substring.

## Testes

- **Vetores de placar** em `sports/scoring-vectors/{kind}.json`: lista de casos
  `{profile, sets, expected: {setWinners, matchWinner, issues}}` e casos de `applyPoint`
  `{profile, state, side, expected}`. O teste Jest de `functions`, o Jest de `frontend/shared`
  e o teste Dart leem o mesmo arquivo. Um caso novo é adicionado no JSON, nunca em só uma
  linguagem.
- **Catálogo × rules:** teste em `functions` que extrai os códigos de `sportLevelNotLowered`
  das rules e compara com `profileCode` do catálogo.
- **Catálogo × gerados:** o CI roda o codegen e falha se o diff não for vazio.
- **Rules:** congelamento de `sport` (gestor com mesmo valor passa, valor diferente é
  recusado, admin passa).
- **Derivação legada:** partida sem perfil, com `bestOf` 1 e 3, para cada esporte de competição.
- **Ranking:** dupla escrita e backfill idempotente com `dryRun`.
- **Paridade de UI:** os testes de widget existentes da mesa e do Focus ganham um caso
  `sets_games` cada.

## Fora de escopo

- `single_score` (futsal, futebol, basquete) e placar side-out (pickleball): o tipo existe no
  catálogo, a estratégia não.
- Escada de nível por esporte.
- KOTC para esportes além do vôlei de praia.
- Internacionalização dos rótulos (não há i18n no app).
- Migração da grafia de valores já persistidos.
- Backoffice de catálogo (lista de esportes editável sem deploy).

## Riscos

| Risco | Mitigação |
|---|---|
| Divergência de placar entre TypeScript e Dart | Vetores compartilhados; o servidor revalida tudo. |
| App da loja quebra ao reeditar evento de esporte novo | Fase 0 antes de qualquer esporte novo; erro de save explícito; build mínimo. |
| Desligar rating por engano na fase 3 | Checar `ratingLadders/VOLEI_PRAIA` e `VOLEI_QUADRA` antes do deploy; o deploy da fase grava a flag se ausente. |
| Dupla escrita esquecida para sempre | Cada fase registra no spec de rollout o build que encerra a dupla escrita. |
| "dupla" em 900 ocorrências | A fase 4 troca só textos funcionais; marketing e telas de vôlei ficam. |
