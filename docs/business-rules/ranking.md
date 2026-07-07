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
- Tabela de pontos por colocação: **1º = 100, 2º = 80, 3º = 60, 4º = 50, quartas (5º–8º) = 33, grupos = 10**.
- Cada torneio pode ter um peso (`rankingWeight`, padrão 1.0) que multiplica os pontos — permite dar mais valor a torneios maiores.
- Pontuação vale para o atleta **e** para a dupla; um atleta que joga mais de uma categoria/dupla no ano tem os pontos somados juntos, sem distinção de categoria.
- Cálculo da pontuação total: dentro de cada ano só contam os **5 melhores resultados** (demais são descartados); a soma "geral" é a soma desses melhores-5-por-ano ao longo de todos os anos — não é literalmente todo resultado já conquistado.
- No app, o atleta pode ver dois modos: **Geral** (soma total, como acima) e **Por ano** (só os melhores 5 daquele ano). Tem filtro por gênero (masculino/feminino/misto) e por atletas/duplas, além de busca por nome.

## Ranking de liga
- Escopo por `liga + categoria`: um atleta/dupla tem uma posição por categoria dentro de cada liga, além da posição no ranking geral.
- Só pontua se a etapa (torneio) estiver vinculada a uma liga (`tournaments.leagueId`) e a liga existir.
- Tabela de pontos própria por liga (`leagues.rankingPointsByPlace`), configurável pelo organizador ao criar a liga; padrão quando não customizada: **1º = 450, 2º = 280, 3º = 180, 4º = 120, quartas = 80, grupos = 40** — bem mais alto que o ranking geral, pra valorizar o circuito estruturado.
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
