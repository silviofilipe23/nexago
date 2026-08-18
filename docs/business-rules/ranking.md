# Ranking

## Conceito
Existem dois rankings de pontos, alimentados pelo mesmo motor de colocação, mas com escopos diferentes:

- **Ranking geral nexaGO** — soma pontos de **todos os torneios** do app, cruzando categorias. É o que aparece na aba Ranking do atleta.
- **Ranking de liga** — soma pontos só das etapas de **uma liga específica**, por categoria. Usado para decidir quem se classifica para a Grande Final da liga.

Ranking (pontos por colocação) é diferente de [Nível](levels.md) (rating usado para elegibilidade de categoria/anti-sandbagging). Um atleta pode liderar o ranking de pontos com nível baixo, ou ter nível alto sem nunca ter pontuado — são dois eixos independentes.

## Como se ganha colocação numa partida
A colocação é atribuída automaticamente quando uma partida é concluída (mesma regra para ranking geral e de liga):

- **Final** → vencedor = 1º, perdedor = 2º.
- **Disputa de 3º lugar** (quando a categoria tem essa partida) → vencedor = 3º, perdedor = 4º.
- **Semifinal**, só quando *não* há disputa de 3º lugar → perdedor = 3º.
- **Quartas de final e rodadas anteriores do mata-mata** (oitavas, 1ª rodada, etc.) → todas caem no mesmo bucket "quartas" (equivalente a 5º–8º).
- **Fase de grupos** → duplas pagas/inscritas que não avançaram ao mata-mata só pontuam pelo bucket "grupos", e só depois que a 1ª partida de mata-mata da categoria terminar (é o momento em que dá para saber quem ficou de fora).
- **Dupla eliminação (WB/LB)**: a chave de vencedores (WB) nunca pontua sozinha; quem cai pra Losers Bracket (LB) pontua pela rodada da LB — última rodada da LB = 3º, penúltima = 4º, rodadas anteriores = bucket "quartas".
- Partida de grupo nunca gera colocação diretamente.
- W.O. conta normalmente para colocação (mas não conta para o rating Glicko — sistema separado).
- Corrigir o vencedor de uma partida já processada refaz a colocação (idempotente por torneio+categoria).

## Ranking geral nexaGO
- **Tabela-base por colocação**: 1º = 1000, 2º = 800, 3º = 600, 4º = 500, quartas (5º–8º) = 330, grupos = 100.
- **Pesos por preset de categoria** (derivados da faixa, nunca gravados):
  - Elite: 1.2 (campeão 1200)
  - Open: 1.0 (1000)
  - Avançado: 0.5 (500)
  - Intermediário: 0.25 (250)
  - Iniciante: 0.125 (125)
  - Livre: 0.125 (125)
  - Legada/custom: 1.0
- **Fórmula de cálculo**: base × peso do preset × `rankingWeight` do torneio × modulador de chave, arredondado uma vez. Cada torneio pode ter um `rankingWeight` (padrão 1.0) que multiplica os pontos — permite dar mais valor a torneios maiores.
- **Modulador de chave** (aplicado conforme número de duplas pagas na categoria):
  - ≥8 duplas pagas: 100%
  - 4–7 duplas pagas: 60%
  - <4 duplas pagas: 25%
- **Restrição para Livre**: ninguém recebe pontos do bucket "grupos" — só pontua quem chega ao mata-mata. Essa regra vale nos dois motores (geral e liga).
- **Gate de participação**: torneio avulso com <10 duplas pagas não gera pontos. Etapa de liga é isenta do gate, mas fica sujeita ao modulador de chave.
- **Migração de escala**: em 18/08/2026, o histórico de colocações foi reescalado ×10 via script idempotente (`scaleVersion: 2` gravado em documentos novos). Resultados anteriores permanecem com a escala antiga para auditoria.
- Pontuação vale para o atleta **e** para a dupla; um atleta que joga mais de uma categoria/dupla no ano tem os pontos somados juntos, sem distinção de categoria.
- Cálculo da pontuação total: **todo resultado conta, sem descarte**. `pointsByYear[ano]` soma tudo que foi conquistado naquele ano e a soma "geral" é a soma dos anos — é literalmente todo resultado já conquistado.
- No app, o atleta pode ver dois modos: **Geral** (todos os anos) e **Por ano** (só os resultados daquele ano). Tem filtro por gênero (masculino/feminino/misto) e por atletas/duplas, além de busca por nome.
- Não vale para o ranking de liga, que continua com o modo de contagem escolhido pelo organizador (ver abaixo).

## Ranking de liga
- Escopo por `liga + categoria`: um atleta/dupla tem uma posição por categoria dentro de cada liga, além da posição no ranking geral.
- Só pontua se a etapa (torneio) estiver vinculada a uma liga (`tournaments.leagueId`) e a liga existir.
- Tabela de pontos própria por liga (`leagues.rankingPointsByPlace`), configurável pelo organizador ao criar a liga; padrão quando não customizada: **1º = 450, 2º = 280, 3º = 180, 4º = 120, quartas = 80, grupos = 40** — bem mais alto que o ranking geral, pra valorizar o circuito estruturado.
- **Restrição para Livre**: como no ranking geral, categoria Livre não recebe pontos do bucket "grupos" — só pontua no mata-mata.
- Modo de contagem de etapas, escolhido na criação da liga:
  - **4 melhores de 6 etapas** (padrão) — descarta os 2 piores resultados da dupla.
  - **3 melhores de 5 etapas** — descarta os 2 piores.
  - **Todas as etapas contam** — soma tudo, sem descarte.
- Grande Final: a liga define o número de vagas (sempre em incrementos de 2) e se existem wildcards — vagas extras fora da classificação automática do ranking da liga.

## Regras
- Ranking é atualizado automaticamente (Cloud Function no encerramento da partida) — não há lançamento manual de pontos.
- Alterações manuais/administrativas devem ser auditadas.
- Resultados de partidas alimentam o ranking; a colocação depende do tipo de partida e da rodada (ver seção acima), não é escolhida manualmente pelo organizador.
- Ranking geral nunca filtra por categoria — soma tudo que o atleta/dupla jogou no nexaGO.
- Ranking de liga é sempre por categoria e nunca cruza ligas diferentes.
