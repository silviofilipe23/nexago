# King of the Court: plano dinâmico de fases

Data: 2026-09-24
Branch: `claude/kotc-dynamic-rounds-selection-21e88e`
Origem: pedido do dono — "com 10 equipes, chaves de 5 com 3 baterias classificando 3 de cada;
depois uma semi de 6 com 4 baterias pra formar a final; e tudo dinâmico conforme as inscritas"

## O que esta entrega faz

Troca os três números soltos que hoje configuram o King of the Court (`teamsPerCourt`,
`roundsPerBracket`, `qualifiersPerRound`) por um **plano explícito de fases**: uma lista onde cada
fase declara suas chaves, suas baterias, quantas classificam e quanto dura. O sistema **propõe** o
plano a partir da quantidade de duplas inscritas, e o organizador **ajusta fase a fase** na tela de
gerar chave.

Três consequências diretas:

1. **Baterias deixam de ser exclusividade da classificatória.** Hoje `roundsPerBracket` só vale na
   fase 1; a semifinal sempre roda uma bateria por chave. Passa a valer em qualquer fase.
2. **O teto sobe de 5 para 6 duplas por bateria**, configurável por categoria (3 a 6). Sem isso a
   semi de 6 numa chave só não existe.
3. **A proposta é derivada da contagem real de inscritas**, não das vagas do wizard.

**Não** muda a mecânica do rally, **não** muda o desempate, **não** muda o avanço de fase
(`koc-phase-advance.ts` já resolve vaga a vaga e não precisa de ajuste), **não** muda a mesa, o
telão nem o overlay além do rótulo da bateria, e **não** muda nenhum torneio existente: config sem
plano deriva o comportamento de hoje.

## O problema que motiva a entrega

Rodando o gerador atual com o pedido do dono (10 duplas, quadra de 5, 3 baterias por chave):

```
fase 1  C1 #1 (5) → #2 (4) → #3 (3)     3 classificadas
fase 1  C2 #4 (5) → #5 (4) → #6 (3)     3 classificadas
fase 2  SEMI C1 #7 (3)  |  SEMI C2 #8 (3)
fase 3  FINAL #9 (4)
```

A **fase 1 já é exatamente o que ele pediu**. O que falta é o resto:

- A fase 2 vira duas semis de 3 com uma bateria cada, porque `roundsPerBracket` está preso à fase 1
  (`functions/src/koc-bracket-builders.ts:415`, `:434`, `:487`). Ele quer **uma** semi de 6 com 4
  baterias.
- Uma bateria de 6 é ilegal: `KOC_MAX_TEAMS_PER_ROUND = 5`.
- Nada é proposto. O wizard tem steppers soltos e a contagem de inscritas só **corta** o valor pra
  baixo (`kocMaxRoundsForField`); ninguém sugere um plano.

## Decisões tomadas

| | |
|---|---|
| Teto duro por bateria | **6** (era 5). Por categoria em `maxTeamsPerRound`, faixa 3–6 |
| Padrão do teto quando ausente | **5** — torneio existente não muda de formato sozinho |
| Piso por bateria | **3**, inalterado |
| Modelagem | **Plano explícito** (`phases: KocPhaseSpec[]`), não overrides nem arrays paralelas |
| Heurística da proposta | **Máximo de jogo**: chave mais cheia possível, baterias no máximo que a chave aguenta |
| Onde se edita | **Só na tela de gerar chave**, com a contagem real de inscritas |
| Onde se grava | **No doc da categoria** — o sorteio ao vivo lê de lá e acontece antes da geração |
| Final | Sempre **uma bateria**; a tabela dela é o pódio. Inalterado |
| Wizard de criação | Perde "Rodadas por chave" e "Classificam"; mantém teto e duração como semente |
| App Flutter | Mostra o plano em **modo leitura**; edição fica no portal |

## Domínio

### Tipos

Em `functions/src/koc-bracket-builders.ts`, espelhados em
`frontend/projects/organizer/src/app/painel/data/tournament-create.model.ts` e em
`nexago_app/lib/features/organizer/domain/tournament_create/king_of_court_plan.dart`:

```ts
export interface KocPhaseSpec {
  /** Tamanho de cada chave (quadra lógica) na PRIMEIRA bateria da fase. */
  bracketSizes: number[];
  /** Baterias que cada chave joga em sequência, na mesma quadra. */
  roundsPerBracket: number;
  /** Quantas duplas cada bateria classifica. Elas saem e liberam a quadra. */
  qualifiersPerRound: number;
  /** Duração da bateria nesta fase, em segundos. */
  durationSec: number;
}

export interface KocConfig {
  // ——— campos atuais, preservados para retrocompat ———
  teamsPerCourt: number;
  qualifiersPerRound: number;
  roundsPerBracket?: number;
  roundDurationSec: number;
  phaseDurationsSec?: Record<string, number>;
  // ——— novos ———
  /** Plano explícito. Ausente ⇒ derivado dos campos acima. */
  phases?: KocPhaseSpec[];
  /** Teto de duplas numa bateria nesta categoria (3–6). Ausente ⇒ 5. */
  maxTeamsPerRound?: number;
}
```

### Constantes

```ts
export const KOC_MIN_TEAMS_PER_ROUND = 3;          // inalterado
export const KOC_MAX_TEAMS_PER_ROUND = 6;          // era 5
export const KOC_LEGACY_MAX_TEAMS_PER_ROUND = 5;   // padrão quando a categoria não escolheu
```

`KOC_MAX_PHASES = 6` fica como está.

### Quantas baterias uma chave aguenta

Hoje é `tamanho − 3 + 1`, escrito partindo do pressuposto de que cada bateria tira **uma** dupla.
Com `q` classificadas por bateria:

```ts
export function kocMaxRoundsPerBracket(bracketSize: number, qualifiersPerRound = 1): number {
  const q = Math.max(1, Math.floor(qualifiersPerRound));
  return Math.max(1, Math.floor((bracketSize - KOC_MIN_TEAMS_PER_ROUND) / q) + 1);
}
```

Com `q = 1` devolve o mesmo de hoje — chave de 4 dá 2, chave de 5 dá 3, chave de 6 dá 4.

### O planejador

`kocProposePlan(teamCount, maxPerRound): KocPhaseSpec[]` — função pura, sem Firestore, sem
dependência de tela. Por fase, com campo `F`:

1. **Parada de entrada:** se é a **fase 1** e `F <= maxPerRound`, o torneio inteiro é uma rodada só
   (uma chave, uma bateria, tabela = pódio). Campo que cabe numa quadra é a forma mais pura do
   formato; não se inventa fase pra ele.
2. Divide em chaves pelo `kocRoundCount(F, maxPerRound)` que já existe (corrige as duas pontas:
   nunca uma chave abaixo de 3, nunca acima do teto) e tira os tamanhos com `kocRoundSizes`.
3. `roundsPerBracket = kocMaxRoundsPerBracket(menor chave, 1)` e `qualifiersPerRound = 1`.
4. **Exceção:** quando a chave só aguenta uma bateria (`R === 1`), a fase volta ao formato clássico
   e `qualifiersPerRound` vira o maior `q` com `chaves × q < F` e `q <= menorChave − 1`. Sem isso,
   7 duplas dariam 2 chaves de [4,3] classificando 1 cada = 2 duplas na fase seguinte, abaixo do
   piso.
5. `próximoCampo = chaves × R × q`. Se ficar **abaixo de 3**, a fase atual vira a **final**
   (uma bateria, tabela = pódio) e o plano termina.

O passo 5 só dispara com **uma** chave, e isso não é sorte: com duas chaves ou mais, o passo 4
garante `q >= 2` sempre que `R === 1` (o piso de 3 na chave faz `menorChave − 1 >= 2`), então
`próximoCampo >= 4`. A final nunca nasce com duas quadras.

Saída para 3–20 duplas com teto 6, validada por protótipo:

| Duplas | Plano | Rodadas |
|---|---|---|
| 3–6 | rodada única (pódio direto) | 1 |
| 7 | 2×[4,3] 1bat q2 → final de 4 | 3 |
| 8 | 2×[4,4] 2bat q1 → final de 4 | 5 |
| 9 | 2×[5,4] 2bat q1 → final de 4 | 5 |
| **10** | **2×[5,5] 3bat q1 → 1×[6] 4bat q1 → final de 4** | **11** |
| 11 | 2×[6,5] 3bat q1 → 1×[6] 4bat q1 → final de 4 | 11 |
| 12 | 2×[6,6] 4bat q1 → 2×[4,4] 2bat q1 → final de 4 | 13 |
| 13 | 3×[5,4,4] 2bat q1 → 1×[6] 4bat q1 → final de 4 | 11 |
| 14 | 3×[5,5,4] 2bat q1 → 1×[6] 4bat q1 → final de 4 | 11 |
| 15 | 3×[5,5,5] 3bat q1 → 2×[5,4] 2bat q1 → final de 4 | 14 |
| 16 | 3×[6,5,5] 3bat q1 → 2×[5,4] 2bat q1 → final de 4 | 14 |
| 17 | 3×[6,6,5] 3bat q1 → 2×[5,4] 2bat q1 → final de 4 | 14 |
| 18 | 3×[6,6,6] 4bat → 2×[6,6] 4bat → 2×[4,4] 2bat → final de 4 | 25 |
| 19 | 4×[5,5,5,4] 2bat q1 → 2×[4,4] 2bat q1 → final de 4 | 13 |
| 20 | 4×[5,5,5,5] 3bat → 2×[6,6] 4bat → 2×[4,4] 2bat → final de 4 | 25 |

A linha de 10 duplas é literalmente o pedido do dono — a heurística cai nele sem caso especial.

### Restrição da contagem de chaves

O sorteio ao vivo descreve a divisão por **um número só** (o alvo da caixa) e reconstrói com
`groupCapacities(F, alvo)` (`functions/src/draw-plan.ts:19`), que faz `ceil(F / alvo)` caixas e
distribui o resto nas primeiras — idêntico ao `kocRoundSizes` do gerador. Nem toda contagem de
chaves sobrevive à ida e volta: 25 duplas em 6 chaves voltam como 5, e o código atual já normaliza
por isso (`kocBracketCountForRounds`).

Com a tabela editável isso vira validação de entrada: a fase 1 **só aceita contagens de chave `n`
com `ceil(F / ceil(F/n)) === n`**. A tela não oferece as outras. Falha na escolha, não na frente do
público.

## O gerador

`buildKingOfCourtRounds` hoje faz duas coisas: planeja as fases (linhas 405–447) e emite as
rodadas. O planejamento sai e vira `kocProposePlan`; o gerador passa a **receber o plano**. Config
sem `phases` deriva o plano antes de emitir, então existe **um caminho só** de emissão.

`emitPhaseOneWithBracketRounds` deixa de ser exclusiva da fase 1 e vira `emitPhase`, usada por todas
as fases. Somem os três `if` de "fase 1 é diferente".

### Origem do elenco

**Dentro da chave** (bateria 2 em diante): as vagas são os lugares `q+1` em diante da bateria
anterior — exatamente quem ficou na quadra depois que as classificadas saíram. Hoje o código usa
`place >= 2` fixo (`koc-bracket-builders.ts:143`); passa a ser `place > q`.

**Entre fases** (bateria 1 de cada chave): o cruzamento atual,
`kocNextRoundIndex(crossoverIndex, place, chavesDaFaseSeguinte)`, sem mudança. O
`crossoverIndex = chave + (bateria − 1)` já existente é o que impede duas classificadas da mesma
chave de caírem juntas na fase seguinte, e o que impede uma semifinal de nascer só com quem venceu
contra a chave cheia.

**Fase 1, bateria 1:** elenco fechado, vindo da semeadura em serpentina ou do sorteio ao vivo.

### Tamanho da bateria

```
size(chave b, bateria r) = bracketSizes[b] − (r − 1) × qualifiersPerRound
```

### Invariante

**Toda rodada emitida satisfaz `elenco.length + vagas.length === size`.** É o que pega semifinal
nascendo com vaga sobrando ou faltando. Validado em protótipo para 3–24 duplas.

### Doc da rodada

Ganha `kocBatteryLabel`: a posição da bateria **dentro da chave** (1, 2, 3…). O `kocRoundLabel`
atual é a posição dentro da fase e, com 20 duplas, diz "Rodada 9" — número global que não responde
nada pra quem está na areia. Com os dois campos o telão diz "Chave 4 · Bateria 3".

### Erros

`KocBracketError` com razão nomeada, recusando:

| Razão | Quando |
|---|---|
| `koc_battery_too_small` | `bracketSize − (R−1)·q < 3` |
| `koc_bracket_over_max` | chave acima do teto da categoria |
| `koc_phase_does_not_reduce` | fase que não reduz o campo (trava atual, mantida) |
| `koc_phase_size_mismatch` | soma das chaves ≠ campo da fase |
| `koc_bracket_count_not_roundtrippable` | contagem de chaves da fase 1 que o sorteio não reproduz |
| `koc_field_too_small` | menos de 3 duplas (atual, mantido) |

## Persistência

### Onde o plano mora

`tournaments/{id}.categories[i].kocPhases` e `.kocMaxTeamsPerRound`, gravados pela tela de gerar
chave com o mesmo `setDoc(..., {merge: true})` que o wizard já usa
(`frontend/projects/organizer/src/app/painel/data/tournament-create-mapper.ts:465`). As rules já
permitem que o organizador atualize o próprio torneio (`firestore.rules:2090`) — **nenhuma callable
nova**, nenhum deploy de function para essa parte.

Precisa estar na categoria porque o **sorteio ao vivo acontece antes da geração** e divide as caixas
lendo o doc, não o payload da geração.

### Congelamento na chave

Na geração, o plano inteiro entra no `kocConfig` de cada rodada, junto do snapshot de duração que já
existe (`functions/src/organizer-category-ops.ts:189`). Mexer no plano depois não altera chave
publicada. É o que o comparador de divergência do
`frontend/projects/organizer/src/app/painel/chaveamento/chaveamento.component.ts:603` passa a
comparar: plano da rodada × plano da categoria.

### Retrocompat, em três camadas

1. **`resolveKocConfig` sem `phases`** deriva o plano dos três números de hoje. Torneio existente
   gera chave idêntica.
2. **`maxTeamsPerRound` ausente vale 5**, não 6. Nenhum torneio ganha chave de 6 sozinho.
3. **O `kocConfig` da rodada grava as duas formas**: `phases` novo *e*
   `teamsPerCourt`/`roundsPerBracket`/`qualifiersPerRound` preenchidos com os valores **da fase
   daquela rodada**. O app da loja, o overlay e o LED continuam lendo o que sempre leram enquanto o
   build não sobe.

### Sorteio ao vivo

`teamsPerBox` (`functions/src/draw-sessions.ts:283`) deixa de recalcular e passa a ser
`max(phases[0].bracketSizes)`. A validação de `roundsPerBracket` que hoje recusa a sessão
(`:246`) vira validação do plano inteiro, com as mesmas mensagens em português e o mesmo
`reason` no detalhe do erro.

## A tela de gerar chave

`frontend/projects/organizer/src/app/painel/eventos/seeds.component.ts`, bloco
`@if (format() === 'king_of_court')` (linhas 171–223). Os quatro steppers viram dois controles
globais + uma tabela:

```
Formato · 10 duplas inscritas                        [ Refazer proposta ]

  Máximo por bateria  [− 6 +]        Duração padrão  [− 15 min +]

  FASE              CHAVES      BATERIAS   CLASSIFICAM   DURAÇÃO    PASSAM
  Classificatória   [2 ▾] 5,5   [− 3 +]    [− 1 +]       15 min       6
  Semifinal         [1 ▾] 6     [− 4 +]    [− 1 +]       15 min       4
  Final             [1]   4        1         —           20 min     pódio

  11 rodadas · 3h40 em 1 quadra · 1h55 em 2 quadras
```

Comportamento:

- **Editar uma fase recalcula as de baixo.** O campo cascateia: baixar a semi para 2 baterias muda
  "passam" para 2, e a final nasceria com 2 duplas — aí a tela funde semi e final numa fase só.
- **"Passam"** é quantas duplas a próxima fase recebe. É a coluna que responde "faz sentido?" sem
  ninguém fazer conta.
- **`CHAVES` é seletor, não stepper livre:** só lista as contagens que sobrevivem ao round-trip do
  sorteio.
- **"Refazer proposta"** volta ao plano automático da contagem atual. Se as inscritas mudaram desde
  o último salvamento, a tela já abre refeita, com uma linha dizendo o que mudou.
- O total usa o `kocSchedule` existente, generalizado para receber o plano em vez dos três números.
- A duração por fase passa a ter UI — ela já existe no domínio como `phaseDurationsSec` e nunca teve
  onde ser editada.

### Wizard de criação

`frontend/projects/organizer/src/app/painel/eventos/wizard/criar-torneio.component.ts:295–301`:
saem "Rodadas por chave" e "Classificam"; ficam "Máximo por bateria" (o antigo "Duplas por quadra",
renomeado) e "Duração", com a dica de que baterias e classificadas são definidas ao gerar a chave.
Os campos antigos continuam sendo **lidos** para retrocompat.

### App Flutter

`nexago_app/lib/features/organizer/presentation/category_ops/organizer_category_generate_koc_page.dart`
já não conhece `roundsPerBracket`, e funciona porque `resolveKocConfig` cai no doc da categoria
quando o `bracketConfig` não traz o campo (`pick()` em `organizer-category-ops.ts:212`). O mesmo
vale para `phases`: **a tela gera certo sem mudança nenhuma**.

O problema é de honestidade da tela, não de geração: ela mostraria "com 10 duplas, 2 classificam…"
e geraria outra coisa. Correção mínima — quando a categoria tem `phases`, o app mostra o plano em
modo leitura (fases, baterias, total) em vez dos steppers. Edição fica no portal.

## Testes

| Alvo | O que prova |
|---|---|
| `kocProposePlan`, 3–24 duplas | o plano sempre fecha, toda fase reduz o campo, a final é chave única de uma bateria |
| `kocProposePlan(10, 6)` | devolve exatamente `[2×[5,5] 3bat q1, 1×[6] 4bat q1, final de 4]` — o pedido do dono, travado |
| `emitPhase`, 3–24 duplas | o invariante `elenco + vagas === size` em toda rodada emitida |
| Cruzamento entre fases | nenhuma chave manda duas classificadas para a mesma rodada da fase seguinte enquanto houver alternativa |
| Retrocompat | config sem `phases` gera saída **idêntica** à atual, comparada contra a saída de hoje congelada no teste |
| `maxTeamsPerRound` ausente | vale 5; chave de 6 é recusada |
| `koc-draw-bracket-agreement.test.ts` | estendido para chaves de tamanhos diferentes (`[6,5]`) |
| Fiação ponta a ponta | `bracketConfig` → `resolveKocConfig` → `buildKingOfCourtRounds` → docs. Função pura testada sozinha não pega config que nunca chega na chamada |
| Portal | spec do planejador espelhado + spec da cascata de edição sobre o modelo puro, sem seam de DI de tela |
| Flutter | parse de `phases` em `koc_round_state.dart` e no `king_of_court_plan.dart` |

## Riscos assumidos

1. **O teto 6 muda a regra do formato.** `docs/business-rules/king-of-court.md` afirma "máximo 5
   duplas" em dois lugares (Restrições e Conceito). O doc é atualizado no mesmo commit, registrando
   que o teto virou configurável por categoria e que 5 continua o padrão.
2. **"Máximo de jogo" é caro na ponta de cima.** 20 duplas dão 25 rodadas, ~8h numa quadra só (~2h30
   em quatro). A tabela editável é a válvula, e o total em horas fica visível antes de publicar.
3. **Plano gravado × inscritas que mudam.** A tela sempre repropõe pela contagem do momento, mas
   quem gerar a chave sem reabrir a tela usa o plano salvo. O gerador recusa o que não fecha, então
   a falha é alta e nomeada — não gera chave torta.
4. **Superfícies de leitura.** Overlay, LED, telão, mesa do portal, mesa do app e card do Focus leem
   `kocConfig`. A camada 3 da retrocompat mantém todos funcionando sem alteração; o que muda por
   escolha é o rótulo ("Chave 4 · Bateria 3"), e só onde o `kocBatteryLabel` for adotado.

## Fora de escopo

- Editar o plano pelo app Flutter (só leitura).
- Alvo de tempo ("quero que caiba em 3h") — a heurística é uma só, "máximo de jogo".
- Baterias na final: a final continua sendo uma bateria cuja tabela é o pódio.
- Mudar a mecânica do rally, o desempate ou o avanço de fase.
