# Compartilhamento do ranking de palpites — portal do atleta e app

Data: 2026-08-07
Protótipos de referência: `04j — Bolão / ranking de palpites`, `04k — Bolão / compartilhar ranking`

## Problema

A tela de palpites existe nas duas superfícies e funciona, mas o ranking é uma lista sem
graça e não sai de dentro do produto. O que faz um bolão de palpites girar é a provocação no
grupo do WhatsApp — e hoje não há como levar a classificação pra fora.

## Escopo

1. Trazer os elementos visuais do protótipo `04j` para a seção de ranking, em coluna única.
2. Adicionar um botão que compartilha o ranking como imagem, com compartilhamento nativo.
3. Persistir a posição anterior de cada participante para exibir a variação ("subiu 3 posições").

Fora do escopo: mudar o modelo de pontuação (placar exato, bônus de sequência), o portal do
organizador, e qualquer rota pública sem login.

## Decisões tomadas no brainstorm

| Decisão | Escolha |
|---|---|
| Escopo | Compartilhamento + visual do protótipo, com as métricas que existem de verdade |
| Destino do link | `/torneios/{id}/palpites` no portal do atleta, atrás do `authGuard` |
| Folha de compartilhamento | Nativa nas duas superfícies, sem modal e sem preview |
| Layout web | Coluna única dentro da aba, sem a coluna lateral do protótipo |
| Variação de posição | Entra no escopo, com um campo novo escrito pelo trigger de scoring |

## O que o protótipo promete e o que existe

O mock foi desenhado sobre um modelo de pontuação que o backend não tem. O backend real
(`functions/src/tournament-predictions.ts`) só aceita palpite de **vencedor**: `MATCH_PICK_POINTS = 1`
por acerto e `CHAMPION_PICK_POINTS = 3` extras quando o palpite da final acerta o campeão.

| Protótipo | Nesta entrega |
|---|---|
| "9 placares exatos" | **N acertos** — cruzando `picks` com o `winnerId` das partidas, no cliente |
| Linha: "5 exatos · 12 vencedor" | Linha: **N acertos · M palpites** |
| "Como pontuar": +25 exato / +10 vencedor / +20 sequência | **Vencedor certo +1 · Campeão +3 extras** (a final vale 4) |
| "245 pts · subiu 3 posições" | Mantido — ver [Variação de posição](#variação-de-posição) |
| "24 jogos palpitados" / "38 participantes" | Reais: palpites enviados e `entries.length` |
| Palavra "bolão" | **Não usar.** O recurso não movimenta dinheiro e o app processa pagamento de verdade; "bolão" convida leitura de aposta. A aba continua "Palpites" e o card diz "Ranking de palpites" |

## Variação de posição

O único campo novo em todo o projeto.

### Servidor

Em `processBracketPredictionScoring`, depois do laço de créditos e **somente quando
`credited > 0`**:

1. Monta, a partir dos documentos já lidos no início, a lista
   `{userId, scoreBefore, picksCount}`.
2. Calcula `previousRank` ordenando por `score desc → picksCount desc → userId asc`
   (o mesmo critério da web — ver [Ordenação](#ordenação-canônica)).
3. Grava `{previousRank, rankUpdatedAt}` em **todas** as entries, em lotes de 450 documentos.

Escreve em todas, não só em quem pontuou: quem não acertou também muda de posição quando os
outros sobem.

Não é preciso persistir a posição *atual*. Ela é recalculada do zero na próxima rodada a partir
das pontuações lidas naquele momento, então guardá-la seria um segundo campo para manter
sincronizado sem ganho nenhum.

O guarda `credited > 0` é o que impede uma reinvocação do trigger de apagar as setinhas: se
todos os créditos caíram na idempotência de `gamification_events`, nenhuma pontuação mudou e a
foto anterior é preservada.

### Cliente

`delta = previousRank − posiçãoCalculadaNoCliente`. Positivo é subida. Sem `previousRank`
(participante novo, ou torneio que ainda não teve nenhuma partida concluída), não desenha seta.

A posição exibida continua sendo a que o cliente calcula, não uma posição vinda do servidor —
assim o número na tela e a seta ao lado nunca se contradizem.

### Limitações aceitas

- Duas partidas concluídas ao mesmo tempo disparam dois triggers concorrentes; o último a
  escrever vence e pode ter lido pontuações defasadas. É cosmético e se corrige na rodada
  seguinte.
- Entre duas rodadas, alguém enviar mais palpites pode mexer no desempate e deslocar a posição
  em um lugar sem que haja resultado novo. A seta fica um a menos; a posição exibida continua
  correta.
- `previousRank` reflete sempre a última rodada pontuada, não uma janela de tempo.

## Ordenação canônica

`score desc → picksCount desc → userId asc`.

Hoje a web usa esse critério (`buildPredictionLeaderboard`) e o **Flutter ordena só por
`score`** (`buildPredictionLeaderboardEntries`, `tournament_predictions_logic.dart`). Em empate
as duas superfícies mostram posições diferentes — tolerável enquanto o número só aparecia na
tela, inaceitável agora que ele vai estampado numa imagem que circula no WhatsApp, e agora que
o servidor também precisa concordar para calcular `previousRank`.

**Alinhar o Flutter ao critério da web.** O comparador passa a existir em três lugares
(servidor, web, app); cada um leva teste próprio e um comentário apontando para os outros dois.

## Tela de ranking

Estrutura atual preservada: aba dentro do shell do torneio, alternador *Meus palpites | Ranking*.
Na seção Ranking, nesta ordem:

1. **Pódio** dos três primeiros. O app já tem `RankingPodium`; a web ganha o equivalente.
2. **Card "Sua campanha"** — posição, pontos, acertos sobre decididos, quantos em jogo, e a
   variação de posição. Vem de `predictionStatsOf`, que já calcula tudo isso menos a variação.
3. **Lista** a partir do 4º, com a linha do próprio atleta destacada em laranja e a seta de
   variação à direita.
4. **Painel "Como pontuar"** com as duas regras reais.

Sem a coluna lateral do protótipo: o shell do torneio já tem cabeçalho e abas, e uma segunda
navegação na mesma tela duplicaria hierarquia. O app é coluna única de qualquer forma, então
as duas superfícies ficam próximas.

## Compartilhamento

Botão **"Compartilhar ranking"** no topo da seção Ranking, visível sempre que houver ao menos
um participante. Quem ainda não palpitou também compartilha — o card sai só com o pódio e o
convite.

### Imagem

1080×1920 (9:16), mesmo formato do card de partida que já existe. Conteúdo:

- Marca nexaGO e o nome do torneio
- Top 3 com os badges de medalha e a pontuação
- A linha do próprio atleta destacada, quando ele não está no pódio
- Rodapé com a URL de entrada

**Sem avatares.** O protótipo não usa, e isso elimina o precarregamento de imagem antes da
captura — hoje a parte frágil dos dois compartilhamentos que já existem no app.

Nomes abreviados (`Marcelo A.`), como no protótipo, a partir dos nomes já hidratados de
`public_profiles`.

A variação de posição **não** entra na imagem — ela vive na tela, onde tem contexto. No card
ela seria um número solto sem referência.

### Web

`canvas` → `toBlob('image/png')` → `navigator.canShare({files})` → `navigator.share`. No
desktop, onde não há folha nativa, cai em download do PNG e cópia do link, com toast. É o que
`match-share-dialog.component.ts` já faz, sem o modal. `AbortError` é engolido.

### App

`RepaintBoundary` fora da tela → `toImage(pixelRatio: 3)` → PNG em `Directory.systemTemp` →
`Share.shareXFiles`. Clone de `sand_rank_share_capture.dart`, incluindo `await
WidgetsBinding.instance.endOfFrame` antes da captura e o `sharePositionOrigin` do iPad
(`nexaSharePositionOrigin`). Trata `ShareResultStatus.unavailable`.

### Link

`{origin}/torneios/{tournamentId}/palpites`. Atrás do `authGuard`, que já persiste o destino em
`?redirect=` e atravessa o onboarding — quem não tem conta cadastra e volta exatamente na
página. Nenhuma infraestrutura nova.

## Arquivos

### Cloud Functions

- `functions/src/tournament-predictions.ts` — `snapshotPredictionRanks` novo, chamado ao final de
  `processBracketPredictionScoring` sob `credited > 0`
- `functions/src/tournament-predictions.test.ts` — casos do snapshot e do guarda de idempotência

### Portal do atleta (Angular)

Módulos puros novos, testáveis sem Angular nem Firestore:

- `tournaments/predictions/predictions-share-card.ts` — desenho do canvas 1080×1920, no molde de
  `tournaments/match/match-share-card.ts`
- `tournaments/predictions/predictions-share.ts` — texto, URL e montagem dos dados do card

Editados:

- `data/tournament-predictions-repository.ts` — `previousRank` na interface `TournamentPredictionEntry`
- `tournaments/predictions/predictions.selectors.ts` — `delta` em `PredictionLeaderboardRow`,
  acertos por participante, variação em `PredictionStats`
- `tournaments/predictions/predictions-tab.component.{ts,html,scss}` — pódio, card, lista, painel,
  botão de compartilhar
- `.spec.ts` correspondentes

### App (Flutter)

Novos:

- `features/tournaments/domain/predictions/prediction_share_text.dart` — copy e link, puro
- `features/tournaments/presentation/widgets/predictions/prediction_share_card.dart` — o card 9:16
- `features/tournaments/presentation/widgets/predictions/prediction_share_capture.dart` — captura e
  compartilhamento

Editados:

- `features/tournaments/domain/predictions/tournament_prediction_entry.dart` e o mapper —
  `previousRank`
- `features/tournaments/domain/predictions/tournament_predictions_logic.dart` — desempate alinhado,
  variação, acertos por participante
- `features/tournaments/presentation/tournament_predictions_page.dart` — card "Sua campanha",
  painel "Como pontuar", botão de compartilhar
- testes correspondentes

## Sem mudança

- **Firestore rules** — `tournamentPredictions/{id}/entries` já é `read: true` / `write: false`;
  `previousRank` é escrito por Cloud Function como todo o resto do documento.
- **Índices** — a coleção continua sendo lida inteira e ordenada em memória.
- **Modelo de pontuação** — nenhuma constante de pontos muda.

## Deploy

A variação de posição só aparece onde as functions estiverem implantadas. **Produção não tem
nenhuma function de palpites hoje** — só o dev. Sem o deploy, o campo nunca é escrito e o
cliente simplesmente não desenha seta nenhuma; o resto da entrega (visual e compartilhamento)
funciona igual. Nada quebra, mas vale dizer explicitamente na entrega.

## Riscos

- **Comparador em três linguagens.** Divergir de novo reintroduz o bug que esta entrega
  corrige. Mitigação: teste em cada superfície com o mesmo cenário de empate.
- **Lote de escrita por rodada.** Passa a haver uma escrita por participante a cada partida
  concluída, além dos créditos. Em lotes de 450 e na escala atual (dezenas de participantes) é
  irrelevante; num torneio com milhares seria preciso repensar.
- **`toBlob` e captura são assíncronos e podem falhar** (aba em segundo plano, memória).
  Os dois caminhos tratam erro com toast e não deixam a tela travada.
