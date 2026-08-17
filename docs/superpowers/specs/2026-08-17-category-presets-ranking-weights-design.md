# Presets de categoria, pesos geométricos e escada de 7 níveis — Design

**Data:** 2026-08-17
**Status:** aprovado em conversa (junção de duas sessões: "Ranking score status" + "Pesos de pontuação por categoria")
**Escopo:** ranking geral nexaGO, escada de níveis, elegibilidade de categoria. O ranking de liga mantém tabela própria e fica fora dos pesos.

## Contexto

Duas conversas convergiram aqui:

1. A remoção da regra de "melhores 5 por ano" do ranking geral (aprovada e **já implementada** nesta branch, sem commit — ver D1).
2. O problema do farm de pontos: "iniciantes se inscrevem em categorias Open apenas para ganhar os pontos de participação". A resposta é um sistema de presets de categoria com faixa de nível fechada, pesos geométricos por categoria e modulador por tamanho de chave.

## Decisões

### D1. Best-N removido do ranking geral (implementado)

`aggregateRankingResults` soma **todos** os resultados do ano (`pointsByYear[y]` = soma integral; `totalPoints` = soma dos anos). `BEST_N_RESULTS_PER_YEAR`, `sumBestNPoints`/`bestNResults` e o parâmetro `n` dos builders foram removidos das três superfícies (CF, portal do atleta, app). A folha "Como funciona" do app não promete mais "melhores 5".

Estado: implementado nesta branch (9 arquivos), verificado — 1148 testes nas functions, 27 no app. O histórico ficou sem recálculo **naquele momento**; a migração de escala (D9) o recalcula por tabela.

### D2. Escada de nível com 7 degraus

| código | label | rank |
|---|---|---|
| `iniciante_1` | Iniciante 1 | 0 |
| `iniciante_2` | Iniciante 2 | 1 |
| `intermediario_1` | Intermediário 1 | 2 |
| `intermediario_2` | Intermediário 2 | 3 |
| `avancado_1` | Avançado 1 | **4 (novo)** |
| `avancado_2` | Avançado 2 | **5 (novo)** |
| `open` | Open | **6 (era 5)** |

- O rank 4 (vago) e o 5 (ex-Open) passam a ser Avançado 1 e 2; Open sobe para 6.
- O alias legado de leitura `'Avançado' → 'Intermediário 1'` (app, `athlete_profile_options.dart`) é removido; `'Avançado'`/`'avancado'` passam a resolver para `avancado_1`. Demais aliases legados continuam (`iniciante`→0, `intermediario`→2, `livre`/`Open / federado`→open).
- Superfícies de nível (chips/barras com 5 segmentos no app, `/perfil/esportes` no portal, `@nexago/levels`, filtro de nível do ranking) passam a 7 degraus.

**Renumeração coordenada** (a memória "nunca renumerar" cai aqui, de forma deliberada e com backfill):
- `LEVEL_RANK`/`LEVEL_CODES` em `functions/src/category-level-eligibility.ts` (fonte autoritativa).
- Mapa `athleteLevelRank` nas rules (`firestore.rules:321`): adiciona `avancado_1/2` + labels, move `open`/`Open` para 6. As comparações das rules são intra-request (nível novo × nível antigo no mesmo mapa), então o deploy é atômico e seguro.
- Backfill: `athleteRatings.levelRank` 5→6 para atletas Open. O plano de implementação deve enumerar por grep todos os leitores de `levelRank` persistido e atualizá-los na mesma PR.

**Escada Glicko** (`rating-config.ts`) ganha dois degraus **acima**, mantendo o espaçamento de 150:
- `avancado_1`: inicial 1900 (promove ≥2020, rebaixa ≤1800)
- `avancado_2`: inicial 2050 (promove ≥2170, rebaixa ≤1950)
- `open`: inicial passa de 1900 → 2200 (rebaixa ≤2100)
- Backfill de realinhamento: rating de atletas Open sobe para ≥2200 (mesma regra do self-upgrade: "nunca abaixo do inicial do novo degrau"), com proteção de promoção padrão. Ninguém possui `avancado_*` no dia 0 — os degraus são alcançados por subida manual ou promoção da engine.

### D3. Presets de categoria (faixa fechada)

Campo novo `categories[].preset` com tabela autoritativa `CATEGORY_PRESETS` nas functions (novo `functions/src/category-presets.ts`), espelhada em `@nexago/levels` e no app:

| preset | faixa (ranks) | quem entra |
|---|---|---|
| `iniciante` | 0–1 | Iniciante 1 e 2 |
| `intermediario` | 2–3 | Intermediário 1 e 2 |
| `avancado` | 4–5 | Avançado 1 e 2 |
| `open` | 4–6 | Avançado + Open (fecha chave com topo pequeno) |
| `elite` | 6 | só Open |
| `livre` | 0–6 | qualquer atleta |

- **Legado:** categoria sem `preset` (todo torneio já criado) segue a regra atual — só teto via `categories[].level`, sem piso. Nada quebra para inscritos existentes; o early-exit de categoria Open legada permanece.
- O wizard do organizador (criar-torneio) passa a escolher o preset em vez de digitar nível solto; `categories[].level` (label) continua sendo gravado por retrocompatibilidade de exibição.
- Não existe faixa custom: a faixa é regra da plataforma, não escolha do organizador. Ajustar a definição de um preset no futuro é deploy, não backfill.

### D4. Tabela-base nova + pesos geométricos (ranking geral)

Tabela-base (`DEFAULT_GLOBAL_POINTS`) reescalada ×10: **1º=1000 · 2º=800 · 3º=600 · 4º=500 · quartas=330 · grupos=100**.

Peso por preset multiplica a tabela inteira ("cada categoria vale o dobro da anterior"):

| preset | peso | campeão | participação (grupos) |
|---|---|---|---|
| `elite` | **1.2** | **1200** | 120 |
| `open` | 1.0 | 1000 | 100 |
| `avancado` | 0.5 | 500 | 50 |
| `intermediario` | 0.25 | 250 | 25 |
| `iniciante` | 0.125 | 125 | 13 |
| `livre` | 0.125 | 125 | — (ninguém recebe, ver D6) |

- Âncora escolhida: campeão da Elite = 1200 (base 1000 × 1.2).
- Fórmula: `pontos = round(base × pesoPreset × rankingWeight × moduladorChave)`. Compõe com o `rankingWeight` do torneio (default 1.0) e com o modulador (D7).
- Categoria **sem preset** (legado) pontua com peso 1.0 — igual à regra da época.
- Racional (da sessão de pesos): campeão de uma categoria ≈ semifinalista da de cima; quartas no Open (330) > campeão do Intermediário (250) — subir de faixa sempre paga. Peso linear/achatado deixaria campeão do Iniciante à frente de semifinalista do Open e destruiria a credibilidade do geral.
- **Só ranking geral.** O ranking de liga mantém `rankingPointsByPlace` própria configurável, sem pesos por baixo.

### D5. Faixa barra inscrição (piso e teto)

- `assertTeamLevelEligibility` (chokepoint único, 8 chamadores) ganha piso: com preset, o integrante **mais forte** da dupla precisa caber na faixa `[piso, teto]`. Sem preset, regra legada (só teto).
- A entrada da dupla continua decidida pelo mais forte (regra anti-sandbagging atual); o mais fraco pode estar abaixo do piso (entra junto — mas ver D6).
- Portais e app espelham a faixa na UI (esconder/desabilitar categoria fora da faixa); quem manda é o assert nas functions.

### D6. Participação (bucket "grupos") restringida

- **Parceiro abaixo do piso** do preset: não recebe o bucket "grupos" no doc individual (`athleteRankings`); o doc da dupla (`teamRankings`) recebe normalmente (a dupla qualificou pela faixa). Colocações de mata-mata pontuam integral para os dois.
- **Livre: ninguém recebe** o bucket "grupos" (nem dupla, nem atletas) — só pontua quem chega ao mata-mata, e com peso 0.125. Fecha o farm de "aparecer e levar participação".
- As duas restrições valem no ranking **geral e no de liga** (ambos concedem o bucket hoje; deixar a liga aberta reabriria o farm via etapa de liga).

### D7. Modulador por tamanho de chave (ranking geral)

Pontos do geral modulados pelas duplas **pagas** da categoria (contagem que `loadPaidTeamIds` já fornece):

| duplas pagas | fator |
|---|---|
| ≥ 8 | 100% |
| 4–7 | 60% |
| < 4 | 25% |

- Protege contra chave minúscula no topo (Elite de 3 duplas: 1200 × 25% = 300, ordem de um campeão do Intermediário cheio — justo). Desaparece sozinho quando as chaves encherem.
- O **gate de desafio permanece**: torneio avulso com <10 duplas pagas continua sem pontuar (etapa de liga é isenta do gate, mas sujeita ao modulador).
- Só no ranking geral; a liga não modula.

### D8. Ranking por categoria com linha congelada (nova superfície)

- Novos agregados por preset, escritos pelo mesmo caminho de premiação: `athleteCategoryRankings/{preset}_{athleteId}` e `teamCategoryRankings/{preset}_{teamId}`, com pontos **cheios** (sem peso — dentro da categoria todos têm o mesmo multiplicador, então o peso é invisível ali).
- **Congelamento é automático pela faixa**: quando o nível atual do atleta ultrapassa o teto do preset, ele não consegue mais se inscrever ali (D5), logo a linha para de acumular sozinha. A UI marca a linha como **"Promovido"** quando `nível atual > teto do preset` — propaganda viva da progressão.
- Superfícies: seletor de categoria nas telas de ranking do app e do portal do atleta. Fase própria, por último (não bloqueia o motor).

### D9. Migração de escala do histórico (×10)

A reescala da tabela-base torna insustentável misturar totais antigos (base 100) com novos (base 1000) — um campeão Open antigo (100) ficaria atrás de um campeão Iniciante novo (125).

- Script `functions/scripts/backfill-ranking-scale-x10.js`: varre `athleteRankings`, `teamRankings` e `tournamentCategoryResults`, multiplica `points`/`pointsEarned` por 10 e recalcula `totalPoints`/`pointsByYear` a partir do `results[]` (com a agregação nova de D1 — soma integral).
- Fair por construção: na regra antiga toda categoria pagava tabela cheia (peso 1.0), então old×10 = exatamente o que a regra da época teria pago na escala nova.
- Nota: isso **supera** a decisão anterior de "sem recálculo" do best-N — a reescala força recomputar os agregados, e o recompute aplica a soma integral também ao histórico. Consequência aceita ao aprovar a âncora 1200 (flag para revisão do dono na spec).
- Idempotência: o script grava um marcador (`scaleVersion: 2`) no doc para nunca multiplicar duas vezes; o motor novo grava `scaleVersion: 2` em docs novos.
- Cutover: deploy do motor novo e execução do script na mesma janela (dev primeiro, prod depois).

## Fora de escopo (registrado como trabalho futuro)

- **Reset de temporada no geral** (ideia da sessão de pesos; não selecionada).
- Pesos/modulador no ranking de liga.
- Faixa custom por organizador.
- `rankingTableId` continua gravado e ignorado (limpeza é tarefa separada).

## Ordem de implementação

1. **Escada 7** (D2): constantes + rules + vocabulário nas 3 superfícies + backfills (`levelRank`, realinhamento Glicko). Bloqueia tudo — os presets referenciam ranks 4–6.
2. **Presets + elegibilidade** (D3, D5): `CATEGORY_PRESETS`, piso no assert, wizard, espelhos de UI.
3. **Motor de pontos** (D4, D6, D7, D9): tabela-base ×10, pesos, modulador, restrições de participação, script de migração.
4. **Ranking por categoria** (D8): agregados novos + telas.

(D1 já está feito nesta branch e entra no primeiro PR.)

## Testes

- **Functions (node:test):** `category-presets` (faixas, pesos, arredondamento), assert de elegibilidade com piso (dupla mista, legado sem preset, Open legado), `globalPointsForAward` com peso×modulador×rankingWeight, supressão do bucket grupos (abaixo do piso, Livre) nos dois motores, idempotência do upsert com `scaleVersion`.
- **App (flutter test):** paridade das constantes de preset/peso, folha "Como funciona" com a tabela nova, 7 degraus nos helpers de nível.
- **Portais (zoneless TestBed):** espelhos de faixa no wizard e na inscrição, `@nexago/levels` com 7 degraus.
- **Script de migração:** teste com fixture (dry-run conta, run multiplica uma vez, re-run não multiplica).

## Riscos

- **Cliente antigo × escada nova:** app publicado não conhece `avancado_*`; leitores tratam código desconhecido como "sem nível" (rank 0 permissivo em elegibilidade). Mitigação: elegibilidade é server-side (assert), e o vocabulário novo entra nas 3 superfícies antes de qualquer atleta possuir os códigos novos.
- **Deploy rules × backfill `levelRank`:** ordem descrita em D2; comparações das rules são intra-request, backfill é functions-side.
- **Mistura de escala** se o script de D9 não rodar junto do cutover — mitigada pelo `scaleVersion` e pela janela única.
- **Chave "quartas" do bucket:** o modulador e os pesos multiplicam no ponto único `globalPointsForAward` — nenhuma mudança nos resolvers de colocação (`resolveLeaguePlacementsFromMatch` intocado).
