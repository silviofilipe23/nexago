# Pontos por fase alcançada no mata-mata — Design

## Contexto

O ranking geral só tem dois destinos abaixo do pódio: o balde `quarters` (base 330)
para **qualquer** eliminação de mata-mata que não seja semifinal ou final, e o balde
`groups` (base 100) para participação (`resolveLeaguePlacementsFromMatch`,
`functions/src/league-ranking.ts`). Não existe degrau entre "caiu na primeira rodada
de uma chave de 22" e "caiu nas quartas de verdade".

O efeito apareceu na Copa Goiás (dev), mesmo torneio, mesma categoria de nível,
mesmo peso 0.25:

| | Masculino (dupla eliminação, 22 duplas) | Feminino (grupos + mata-mata, 12 duplas) |
|---|---|---|
| pódio | 250 · 200 · 150 · 125 | 250 · 200 · 150 · 125 |
| resto | 18 duplas × 83 = **1494** | 8 duplas × 25 = **200** |
| total | **2219** | **925** |

As 18 duplas do masculino — da 5ª à 22ª colocação — foram todas carimbadas
`finalPlace: 5`. Quem caiu na primeira rodada da losers recebeu o mesmo que quem
chegou às quartas. No feminino, quem não passou dos grupos caiu na participação.
Ou seja: **o formato escolhido pelo organizador está decidindo a pontuação**, não a
campanha da dupla. Um circuito que premia igual o 5º e o 22º também não tem como
publicar resultado de forma honesta.

O mata-mata simples tem a mesma raiz: `matchType === "knockout"` manda para
`quarters` qualquer rodada que não seja a semifinal, então numa chave de 32 o
eliminado da primeira rodada empata com o das quartas.

Base de código: `main` após o PR #258 (recálculo retroativo com os pesos da fase 3),
que depende da fase 3 (PR #256) e da fase 2 (PR #250).

## Decisões

### D1. O prêmio abaixo do pódio é a FASE alcançada, não a colocação ordinal

Duplas eliminadas na mesma fase ganham igual. Não se calcula 5º/6º/7º/8º dupla a
dupla: isso exigiria um critério de desempate entre quem caiu na mesma rodada
(semeadura? saldo de sets?) que hoje não existe e viraria regra nova para o
organizador explicar. Faixa é como circuito publica resultado.

### D2. Escada de degraus (ranking geral e liga)

| degrau | faixa | geral | % do campeão | liga (padrão) |
|---|---|---|---|---|
| campeão | 1 | 1000 | 100% | 450 |
| vice | 2 | 800 | 80% | 280 |
| 3º | 3 | 600 | 60% | 180 |
| 4º | 4 | 500 | 50% | 120 |
| quartas | 5–8 | 330 | 33% | 80 |
| **oitavas** | **9–16** | **200** | **20%** | **60** |
| **16-avos** | **17–32** | **130** | **13%** | **45** |
| participação | — | 100 | 10% | 40 |

Pódio e quartas ficam **exatamente** como estão — a mudança é aditiva, e o histórico
de quem realmente chegou às quartas não se mexe.

**Regra de piso:** nenhum degrau paga menos que a participação. Quem venceu partida
nunca pode ganhar menos que quem não passou dos grupos. Com plantas de até 27 duplas
(`functions/src/bracket-definitions/`), 16-avos é o último degrau necessário; o piso
é o que cobre chave maior no futuro sem mudar a regra.

A tabela da liga continua editável pelo organizador (`leagues.rankingPointsByPlace`);
os degraus novos entram como default, e chave ausente numa tabela já salva cai no
default do degrau — tabela customizada existente não muda de valor.

### D3. O degrau é derivado da ESTRUTURA da chave

Módulo novo `functions/src/bracket-placement-tiers.ts`, puro (sem Firestore): recebe
a lista de partidas da categoria e devolve, para cada rodada eliminatória, a faixa de
colocação que aquela eliminação implica — contando quantas duplas caem por rodada e
acumulando **de baixo para cima** (quem cai primeiro ocupa as últimas posições). O
degrau sai do TOPO da faixa: topo ≤8 → quartas, ≤16 → oitavas, ≤32 → 16-avos.

Exemplo, planta de 22 duplas: LB r1 tem 6 partidas (caem 6 → 17º–22º → 16-avos),
r2 tem 4 (13º–16º → oitavas), r3 tem 4 (9º–12º → oitavas), r4 tem 2 (7º–8º →
quartas), r5 tem 2 (5º–6º → quartas).

Duas alternativas foram descartadas:

- **Contar em runtime quantas duplas seguem vivas**: depende do estado do torneio na
  hora da premiação e fica sensível a partida concluída fora de ordem — o que a mesa
  produz o tempo todo.
- **Usar a rodada crua como degrau**: não sobrevive à comparação entre plantas. A LB
  de 22 duplas tem 6 rodadas e a de 8 tem 3; a mesma "rodada 2" significa colocações
  completamente diferentes.

A lista de partidas existe inteira desde a geração da chave, então a mesma função
serve o motor (na premiação) e o script do histórico (nas partidas já gravadas). É
essa unificação que impede o passado de divergir do presente de novo.

Contrato de tipos: `LeaguePlacementBucket` passa de `"quarters" | "groups"` para
`"quarters" | "r16" | "r32" | "groups"`, e `finalPlaceForAward` mapeia cada balde para
o topo da sua faixa (D5). As duas tabelas de pontos ganham as chaves `r16` e `r32`.

**Entrada desigual na LB não atrapalha:** nas plantas de 20–23 os perdedores da WB R2
entram em rodadas diferentes da LB (intencional, ver `de-plantas-20-24`). O critério
aqui é *quantas duplas caem em cada rodada*, não quando cada uma entrou.

### D4. Eliminação é perdedor SEM destino, não "última rodada da LB"

**Emenda de 19/08, durante a implementação.** A primeira versão desta decisão dizia
para ignorar a final da LB na contagem, porque seu perdedor ainda joga o 3º lugar.
O teste contra as 25 plantas reprovou isso nas plantas de 4, 5 e 6: ali a disputa de
3º puxa participantes de rodadas DIFERENTES — na de 4 lugares o 3º é entre o perdedor
da LB **R1** e o da final da LB; na de 6, entre o perdedor da LB **R2** e o da final.
"A última rodada da LB é pódio" é falso justamente onde a chave é mais curta.

A regra correta vem da fiação que a chave materializada já grava
(`category-bracket-builders.ts`): **`loserAdvance` aponta a próxima partida do
perdedor**. Partida com `loserAdvance` não elimina ninguém; partida sem ele elimina.
Verificado no dado real do dev: na DE de 22 as rodadas LB r1–r5 somam 18 eliminações
(22 − 4) e a final da LB aponta para a disputa de 3º.

Duas bordas ficam de fora dessa regra e continuam pelo caminho antigo:

- **DE legada sem disputa de 3º**: nenhum perdedor tem destino, então a final da LB e
  a anterior são excluídas por rodada — é exatamente onde o resolvedor premia 3º e 4º.
- **Mata-mata simples**: da semifinal em diante não gera degrau, pelo mesmo motivo.

**Chave sem fiação nenhuma** (materializada por código anterior a esses campos) não é
adivinhada: o módulo devolve mapas vazios, o motor cai no comportamento legado (tudo
em `quarters`) e o script de histórico não toca na categoria.

### D5. Contrato do `finalPlace`

Passa a guardar o topo da faixa: `5` quartas, `9` oitavas, `17` 16-avos. Participação
passa a `0` ("sem colocação de mata-mata"), liberando o `9` que hoje a representa.

Auditado antes de decidir: nenhuma superfície renderiza `finalPlace` — app
(`ranking_models.dart`) e portal do atleta (`rankings-repository.ts`) só o carregam
no modelo; o que aparece na tela é `points`. O risco é de dado, não de tela, e o
script do histórico converte os `9` antigos na mesma janela.

### D6. Histórico re-derivado pela mesma função

Script novo que, para cada categoria já encerrada, lê as partidas gravadas, chama a
função de D3, descobre em que rodada cada dupla caiu, reescreve `finalPlace` e
recalcula os pontos com a fórmula vigente (base × peso do preset × `rankingWeight` ×
fator de chave). Reaproveita a casca de I/O de `recompute-ranking-weights.js`
(PR #258): transação por doc com releitura, dry-run por padrão, `--limit`, relatório.

**Nunca chuta:** categoria cuja chave não fecha — dupla que não aparece como perdedora
em lugar nenhum, partida sem `winnerId`, rodada com contagem incoerente — é deixada
intocada e reportada. Vale a mesma disciplina do PR #258.

Projeção na Copa Goiás masculina: as 18 duplas empatadas viram 4 em quartas (83),
8 em oitavas (50) e 6 em 16-avos (33) — de 1494 para 930 pontos abaixo do pódio. O
feminino não muda (925). A distância entre as duas categorias cai de 2,4× para 1,8×,
que é a diferença legítima de uma chave com quase o dobro de duplas.

### D7. Espelhos de exibição

`nexago_app/lib/features/ranking/domain/ranking_constants.dart` já modela 1..8 (com
5–8 valendo 330) e ganha a escada completa. O editor de pontuação da liga no wizard
ganha as duas linhas novas. Ambos são exibição — o cálculo continua só no backend.

## Fora de escopo

- **Pódio**: nenhuma mudança em quem é 1º/2º/3º/4º nem em como isso é resolvido.
- **Elegibilidade**: o gate de 10 duplas pagas e o `rankingEnabled` seguem como estão;
  o histórico continua sem reavaliação de elegibilidade (decisão do PR #258).
- **Tabela customizada de liga já salva**: não é reescrita.
- **Colocação ordinal exata** (5º vs 6º): descartada em D1, não é trabalho futuro
  planejado.

## Ordem de implementação

1. Módulo puro `bracket-placement-tiers.ts` + testes contra as 25 plantas.
2. Tabelas de pontos (geral e liga) com os degraus novos + regra de piso.
3. `resolveLeaguePlacementsFromMatch` consultando o módulo, nos dois motores.
4. Espelhos de exibição (app + wizard da liga).
5. Script de re-derivação do histórico.
6. GATED: deploy dev → script no dev → conferência; prod depois, decisão do dono.

## Testes

- **Módulo puro contra as 25 plantas** (`bracket-definitions/`), provando três
  invariantes por planta: toda dupla recebe exatamente um degrau; as faixas cobrem de
  5 até N sem buraco nem sobreposição; o total distribuído nunca cresce quando a chave
  encolhe.
- **Por formato**: grupos (participação intocada), mata-mata simples de 4/8/16/32,
  DE com e sem disputa de 3º (o caminho legado continua vivo).
- **Regressão do pódio**: `league-ranking-de-brackets.test.ts` continua verde — exatamente
  um 1º/2º/3º/4º por planta.
- **Piso**: degrau nunca abaixo da participação, inclusive em chave grande hipotética.
- **Script**: categoria incoerente é reportada e não escrita.

## Riscos

- **Renumeração do `finalPlace`** (D5): o valor `9` muda de significado. Mitigado por
  nada renderizar o campo e pelo script converter na mesma janela — mas a ordem
  deploy→script é obrigatória, como foi na fase 3.
- **Plantas 20–27 sem teste de regressão de pódio hoje** (`de-plantas-20-24`): o teste
  novo do módulo passa a cobrir a estrutura das 25, o que reduz esse buraco de lado.
- **Chave torta no histórico**: torneio antigo com partida sem `winnerId` ou dupla
  fantasma não é re-derivável. Fica intocado e reportado, nunca adivinhado.
- **Chave sem fiação**: se existir torneio materializado antes de `winnerAdvance`/
  `loserAdvance` existirem, ele não ganha degrau nenhum (D4) — fica no balde
  `quarters` de hoje. Silencioso por desenho, mas o relatório do script lista a
  categoria como não tocada.
- **Janela de escala mista**: entre o deploy e o script, premiação nova nasce na
  escada nova enquanto o histórico ainda está no balde velho. O script converge
  depois (mesma propriedade do PR #258: recálculo é função pura do dado gravado).
