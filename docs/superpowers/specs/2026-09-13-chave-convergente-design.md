# Chave de dupla eliminação no padrão da tabela impressa (forma convergente)

Data: 2026-09-13
Branch: `claude/tabela-doze-duplas-goiania-108fdc`
Origem: tabela impressa "TABELAS 12 DUPLAS — GOIÂNIA OPEN VÔLEI DE PRAIA", do dono

## O que esta entrega faz

Troca a geometria do desenho da chave de dupla eliminação nas **três** superfícies que hoje
compartilham o mesmo layout: de dois trilhos empilhados (WB em cima, LB embaixo) para a **forma
convergente** da tabela impressa — a WB crescendo da esquerda para o centro, a LB espelhada
crescendo da direita para o centro, e o desfecho (semifinais quando existem, final e 3º lugar) na
faixa do meio.

**Não** muda os cards de partida, **não** muda nenhuma planta, **não** muda o que o servidor grava
e **não** desenha a queda do perdedor.

## O problema que motiva a entrega

A pergunta do dono foi "deixar no mesmo padrão da tabela", mas o motivo que ele deu foi outro e é
o que dita o desenho: **não dá para seguir o caminho de uma dupla**. Com WB em cima e LB embaixo,
quem perde o #5 some do trilho de cima e reaparece no #12, lá embaixo à esquerda, sem nada ligando
os dois.

Isso não é acidente de posicionamento: `_buildAdvanceEdges`
(`nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart:592`) só liga
`winnerAdvance` **dentro da mesma chave** (`sameTrack`), e nunca `loserAdvance`. A regra existe
porque, com os trilhos empilhados, qualquer linha WB↔LB cruzaria a figura inteira.

Na forma convergente os dois lados passam a se encarar, e a regra deixa de ser necessária.

## Decisões tomadas

| | |
|---|---|
| Geometria | **Convergente.** WB → centro ← LB espelhada; desfecho no meio |
| Queda do perdedor | **Não se desenha.** Decisão explícita do dono depois de ver o mockup |
| Ligação LB → desfecho | **Desenha.** É avanço de vencedor, não queda — sem ela a figura não fecha |
| 3º lugar sem ligação | **Aceito.** Só é alimentado por perdedores; fica no centro sem linha |
| Bye | **Como a folha:** lugar vago + linha livre esticada para a coluna anterior. Sem caixa nova |
| Entrada de perdedor na LB | Mesmo tratamento do bye — é o que a folha faz com `P 15` |
| Cards | **Inalterados.** Mantêm placar, horário e quadra de hoje |
| Largura ~2× | **Aceita**, inclusive no app (que já é pinça-para-zoom) |
| Superfícies | App Flutter, portal do organizador e portal do atleta — as três |
| Telão / versão para imprimir | **Fora de escopo** |

## 1. Por que espelhar e juntar não basta

O caminho óbvio — manter `_placeTrack` como está, inverter o X da LB e alinhar os dois trilhos
pelo centro — **não funciona**, e é importante registrar a conta para ninguém tentar de novo.

Hoje cada trilho se posiciona sozinho: elege como base a maior coluna, distribui em slots fixos
`(2i+1)·rowUnit` e deriva as demais pela média dos alimentadores. Rodando isso na planta de 12:

- **WB** — base é a R1 (4 jogos) em 1, 3, 5, 7. A R2 tem um alimentador cada, alinha reto: 1, 3, 5, 7.
  Quartas: `#16` = média(#5, #6) = **2**; `#15` = média(#7, #8) = **6**.
- **LB** — base é a R1 (4 jogos) em 1, 3, 5, 7. R2: `#13` = média(#9, #10) = 2; `#14` = média(#11, #12) = 6.
  R3: `#17` alinha reto com `#14` = **6**; `#18` alinha reto com `#13` = **2**.

As semifinais ficariam em média(#16=2, #17=6) = **4** e média(#15=6, #18=2) = **4** — as duas na
mesma altura, colidindo. A guarda de colisão salvaria do desenho ilegível empurrando uma para
baixo, mas o resultado não é a folha.

A causa é que a ordem vertical da LB sai do encadeamento dela mesma (`_orderColumnsByWiring`
ancora a última coluna por `matchNumber`), e não de **qual partida de desfecho ela alimenta**.

## 2. O motor novo: ancorar no centro e caminhar para trás

A faixa central passa a ser a âncora, e o layout caminha para trás pelos dois lados.

1. **Identificar o desfecho.** São as partidas `FINAL` e `THIRD_PLACE`, mais qualquer partida cujos
   alimentadores incluam pelo menos um jogo de `WB` e pelo menos um de `LB` — é assim que as
   semifinais cruzadas das plantas de 12 e 32 são encontradas sem depender do `matchType` delas,
   que nas duas é `WB` de propósito (ver `bracket-12-teams.ts` e `bracket-32-teams.ts`).
2. **Montar a árvore de cada bloco.** Cada partida de desfecho é a raiz; os filhos são os jogos que
   avançam para ela por `winnerAdvance`, recursivamente. Os alimentadores de `WB` formam o ramo
   esquerdo, os de `LB` o direito.
3. **Posição vertical por pós-ordem.** Percorre a árvore em pós-ordem dando um slot a cada ponta
   (jogo sem alimentador) e pondo cada jogo interno na média dos filhos. É o algoritmo padrão de
   layout de árvore; **não assume árvore binária perfeita**, que é o que quebraria nas plantas
   irregulares (play-ins de `_splitIntraColumnDeps`, e a entrada desigual na LB das plantas 20–24).
4. **Posição horizontal por profundidade.** A coluna de um jogo é a distância dele até a raiz do
   bloco: a WB recebe índices decrescentes à esquerda do centro, a LB crescentes à direita.

### Quem ocupa a coluna central

A faixa central não é sempre uma coluna só, e a regra precisa ser explícita porque as plantas
divergem:

- **Plantas com semifinal cruzada (12 e 32).** A coluna central é a das **semifinais** — são elas
  que encostam a WB na LB. A final e o 3º lugar ficam na mesma região em X, porém centralizados
  verticalmente **entre** os blocos, como na folha: o 3º lugar à esquerda do eixo, a final à
  direita.
- **Demais 23 plantas.** Não há convergência intermediária: a **final** ocupa a coluna central, com
  a final da WB imediatamente à esquerda e a da LB imediatamente à direita. O 3º lugar fica logo
  abaixo da final, no mesmo X.

Em ambos os casos vale a mesma frase: a coluna central é a primeira partida, vindo do fim para o
começo, que junta um alimentador da WB com um da LB.

A guarda de colisão de `_applyColumn` fica como rede de segurança, não como mecanismo principal.

### Altura

A figura fica **mais baixa** que a de hoje, não mais alta: os dois trilhos deixam de ser empilhados
(soma das alturas) e passam a compartilhar o espaço vertical (máximo das alturas). `wbLbGap` deixa
de existir. A largura é que cresce — de 6 para 10 colunas numa chave de 16, porque a LB tem mais
rodadas que a WB em quase toda planta (16: 5 contra 4; 24 e 32: 6 contra 5).

## 3. Lugar vago: bye e entrada de perdedor

Toda partida tem dois lados. Quando só um deles tem alimentador desenhado, o outro **ocupa um
lugar vago** na árvore e recebe uma linha livre esticada até a coluna anterior, sem caixa.

Dois casos caem aqui, e a folha trata os dois igual:

- **Bye** — o #5 recebe `WINNER #1` de um lado e o 2º do ranking direto do outro. Vale para as
  plantas 5, 6, 7, 9 a 15 e 17 a 27.
- **Entrada de perdedor** — o #17 recebe `WINNER #14` de um lado e `LOSER #15` do outro. Como a
  queda não é desenhada, o lado do perdedor é um lugar vago.

Sem isso, o jogo cola na altura do único alimentador (hoje: "conector reto quando há 1
alimentador") e o lado vago desaparece da leitura — o defeito que o dono apontou nos mockups.

## 4. Arestas

`_buildAdvanceEdges` perde a regra `sameTrack`. Passa a ligar todo `winnerAdvance` cujas duas
pontas tenham nó no layout, incluindo `LB → desfecho` e `WB → desfecho`. `loserAdvance` continua
sem gerar aresta nenhuma.

Os conectores hoje assumem fluxo esquerda→direita: saem de `position.dx + size.width` e entram em
`position.dx` (`bracket_connector_painter.dart:29-35`). Precisam derivar o sentido da posição
relativa dos dois nós, para desenhar a LB da direita para a esquerda.

## 5. Onde mexe

| Arquivo | O que muda |
|---|---|
| `nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart` | O motor. Implementação de referência |
| `nexago_app/lib/features/tournaments/presentation/widgets/bracket/bracket_connector_painter.dart` | Sentido do conector; stub do lugar vago |
| `frontend/projects/organizer/src/app/painel/chaveamento/bracket-tree.ts` | Porte do motor |
| `frontend/projects/athlete/src/app/tournaments/bracket-tree.ts` | Porte do motor |
| SCSS das duas webs | Conector no sentido inverso |

`BRACKET_MATCH_WIDTH`/`BRACKET_MATCH_HEIGHT` (280×136 nas webs) e `BracketLayoutMetrics`
(280×150 no app) continuam tendo que bater com o CSS do card, senão os conectores desalinham.

Os cards, o `bracketGroupKey`, os rótulos de coluna e a eliminatória simples
(`buildKnockoutTreeLayout`) ficam como estão.

## 6. Testes

O teste que mais protege é um **contra as 25 plantas** (4 a 27 e 32), materializadas por
`buildMatchesFromDefinition` como o teste de degraus já faz
(`functions/src/bracket-placement-tiers-plants.test.ts`), verificando invariantes de desenho:

1. nenhum par de cards se sobrepõe;
2. toda aresta liga colunas vizinhas;
3. todo jogo de `WB` fica à esquerda da faixa central e todo jogo de `LB` à direita;
4. toda partida tem os dois lugares ocupados — por alimentador ou por vago;
5. cada partida que tem dois alimentadores desenhados fica na média vertical deles — o que exclui
   a disputa de 3º lugar, que não tem nenhum.

É o que pega a planta irregular que o design não previu. Além dele, casos dirigidos em Dart para a
convergência, o espelhamento da LB e o deslocamento do bye. Os dois portes TS ganham spec própria —
hoje não têm nenhuma.

## 7. Ordem de execução

O motor Dart primeiro, validado no app com o dono, e só então os dois portes. Escrever os três de
uma vez multiplica por três qualquer erro de geometria antes de alguém olhar a tela.

1. Motor Dart + testes das 25 plantas
2. Conector Dart (sentido + stub do vago)
3. **Validação com o dono no app**
4. Porte do organizador + spec
5. Porte do atleta + spec

## Fora de escopo

- Desenhar a queda do perdedor (recusado explicitamente)
- Telão e versão para imprimir
- Mudar cards, plantas ou qualquer coisa server-side
- Eliminatória simples (`buildKnockoutTreeLayout`)
