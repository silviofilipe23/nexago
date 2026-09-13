# Chave convergente de dupla eliminação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trocar a geometria do desenho da chave de dupla eliminação — de dois trilhos empilhados para a forma convergente da tabela impressa — no app Flutter e nos dois portais web.

**Architecture:** A faixa central vira a âncora do layout. Para cada partida de convergência (a que junta um alimentador da WB com um da LB) monta-se uma árvore de alimentação por chave, na qual todo lado sem alimentador desenhado vira um **lugar vago** — é o que reserva espaço para o bye e para a entrada do perdedor. A posição vertical sai de um percurso que dá um lugar a cada ponta e põe cada jogo na média dos filhos; a horizontal, da profundidade em relação ao centro, com a WB à esquerda e a LB à direita.

**Tech Stack:** Dart/Flutter (motor de referência), TypeScript/Angular (dois portes), Node (gerador de fixture a partir das plantas em `functions/src/bracket-definitions`).

**Spec:** `docs/superpowers/specs/2026-09-13-chave-convergente-design.md`

## Global Constraints

- **Não desenhar queda do perdedor.** `loserAdvance` não gera aresta em nenhuma superfície. Decisão explícita do dono.
- **Cards inalterados.** Largura/altura continuam 280×150 no app (`BracketLayoutMetrics`) e 280×136 nas webs (`BRACKET_MATCH_WIDTH`/`BRACKET_MATCH_HEIGHT`), e têm que bater com o CSS do card, senão os conectores desalinham.
- **Lugar vago recebe linha livre, sem caixa** — opção "como a folha". Vale igual para bye e para entrada de perdedor.
- **Nada server-side muda.** Plantas, Cloud Functions e Firestore ficam como estão.
- **Eliminatória simples fora de escopo.** `buildKnockoutTreeLayout` não é tocado.
- **`winnerAdvanceSlot` é `'A'` ou `'B'`** no modelo Dart (ver `_orderColumnsByWiring`, `double_elimination_bracket_layout.dart:309`). Qualquer outro valor ordena por último.
- **O conjunto de plantas tem buraco:** 4 a 27 e 32, sem 28 a 31. Nunca descrever como faixa min-a-max.

---

### Task 1: Fixture das 25 plantas materializadas

As invariantes de desenho só protegem de verdade se rodarem contra todas as plantas reais, que vivem em TypeScript. Este fixture é gerado uma vez e consumido pelos testes Dart e TS.

**Files:**
- Create: `functions/scripts/export-bracket-fixtures.js`
- Create: `nexago_app/test/fixtures/bracket_plants.json` (gerado)
- Test: `nexago_app/test/features/tournaments/bracket_plants_fixture_test.dart`

**Interfaces:**
- Consumes: `buildMatchesFromDefinition` e `BRACKET_DEFINITIONS` de `functions/src/category-bracket-builders` e `functions/src/bracket-definitions/bracket-definitions`.
- Produces: JSON `{"12": [{"matchNumber":1,"matchType":"WB","round":1,"winnerAdvanceMatchNumber":5,"winnerAdvanceSlot":"B","loserAdvanceMatchNumber":9,"loserAdvanceSlot":"A"}, …], …}` e, no Dart, `List<TournamentMatch> bracketPlantFixture(int teamCount)`.

- [ ] **Step 1: Escrever o gerador**

```javascript
// functions/scripts/export-bracket-fixtures.js
//
// Exporta TODAS as plantas materializadas para um fixture consumido pelos
// testes de layout do app e dos portais. Roda depois de `npm run build` em
// functions/, porque lê o JS compilado em lib/.
//
// Uso: node scripts/export-bracket-fixtures.js
const fs = require('node:fs');
const path = require('node:path');

const {BRACKET_DEFINITIONS} = require('../lib/bracket-definitions/bracket-definitions');
const {buildMatchesFromDefinition} = require('../lib/category-bracket-builders');

/** 'teamAId' → 'A' — o modelo do app usa a letra, a CF grava o nome do campo. */
function slotLetter(slot) {
  if (slot === 'teamAId') return 'A';
  if (slot === 'teamBId') return 'B';
  return null;
}

const out = {};
for (const [teamCount, definition] of Object.entries(BRACKET_DEFINITIONS)) {
  const n = Number(teamCount);
  const teamIds = Array.from({length: n}, (_, i) => `t${i + 1}`);
  out[teamCount] = buildMatchesFromDefinition(definition, teamIds)
    .sort((a, b) => a.matchNumber - b.matchNumber)
    .map((m) => ({
      matchNumber: m.matchNumber,
      matchType: m.matchType,
      round: m.round,
      winnerAdvanceMatchNumber: m.winnerAdvance?.matchNumber ?? null,
      winnerAdvanceSlot: slotLetter(m.winnerAdvance?.teamSlot) ?? null,
      loserAdvanceMatchNumber: m.loserAdvance?.matchNumber ?? null,
      loserAdvanceSlot: slotLetter(m.loserAdvance?.teamSlot) ?? null,
    }));
}

const dest = path.join(
  __dirname, '..', '..', 'nexago_app', 'test', 'fixtures', 'bracket_plants.json',
);
fs.mkdirSync(path.dirname(dest), {recursive: true});
fs.writeFileSync(dest, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(out).length} plantas exportadas para ${dest}`);
```

- [ ] **Step 2: Gerar o fixture**

```bash
cd functions && npm run build && node scripts/export-bracket-fixtures.js
```

Esperado: `25 plantas exportadas para .../nexago_app/test/fixtures/bracket_plants.json`

- [ ] **Step 3: Escrever o carregador Dart e o teste que prova que ele lê**

```dart
// nexago_app/test/features/tournaments/bracket_plants_fixture.dart
import 'dart:convert';
import 'dart:io';

import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';

/// As 25 plantas materializadas, geradas por
/// `functions/scripts/export-bracket-fixtures.js`. Regerar depois de mexer em
/// qualquer `bracket-N-teams.ts`.
Map<int, List<TournamentMatch>> loadBracketPlants() {
  final raw = File('test/fixtures/bracket_plants.json').readAsStringSync();
  final decoded = jsonDecode(raw) as Map<String, dynamic>;
  return {
    for (final entry in decoded.entries)
      int.parse(entry.key): [
        for (final m in entry.value as List<dynamic>)
          TournamentMatch(
            id: 'm${(m as Map<String, dynamic>)['matchNumber']}',
            tournamentId: 't1',
            categoryId: 'cat-a',
            round: m['round'] as int,
            matchType: m['matchType'] as String,
            poolId: '',
            teamAId: '',
            teamBId: '',
            status: 'Scheduled',
            resultA: '',
            resultB: '',
            isGroupMatch: false,
            matchNumber: m['matchNumber'] as int,
            winnerAdvanceMatchNumber: m['winnerAdvanceMatchNumber'] as int?,
            winnerAdvanceSlot: m['winnerAdvanceSlot'] as String?,
            loserAdvanceMatchNumber: m['loserAdvanceMatchNumber'] as int?,
            loserAdvanceSlot: m['loserAdvanceSlot'] as String?,
          ),
      ],
  };
}
```

```dart
// nexago_app/test/features/tournaments/bracket_plants_fixture_test.dart
import 'package:flutter_test/flutter_test.dart';

import 'bracket_plants_fixture.dart';

void main() {
  test('o fixture traz as 25 plantas, com o buraco de 28 a 31', () {
    final plants = loadBracketPlants();
    expect(plants.keys.toList()..sort(), [
      ...List.generate(24, (i) => i + 4), // 4 a 27
      32,
    ]);
    // A de 12 é a do Goiânia Open: 22 partidas, semifinais cruzadas em #19/#20.
    expect(plants[12], hasLength(22));
    final semi = plants[12]!.firstWhere((m) => m.matchNumber == 19);
    expect(semi.matchType, 'WB');
  });
}
```

- [ ] **Step 4: Rodar o teste**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_plants_fixture_test.dart`
Esperado: PASS

- [ ] **Step 5: Commit**

```bash
git add functions/scripts/export-bracket-fixtures.js nexago_app/test/fixtures/bracket_plants.json nexago_app/test/features/tournaments/bracket_plants_fixture.dart nexago_app/test/features/tournaments/bracket_plants_fixture_test.dart
git commit -m "test: fixture das 25 plantas materializadas para os testes de layout"
```

---

### Task 2: Identificar a faixa central

**Files:**
- Create: `nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart`
- Test: `nexago_app/test/features/tournaments/bracket_feed_tree_test.dart`

**Interfaces:**
- Consumes: `TournamentMatch` (`winnerAdvanceMatchNumber`, `winnerAdvanceSlot`, `matchType`, `matchNumber`).
- Produces: `Set<int> bracketConvergenceMatches(List<TournamentMatch> matches)`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// nexago_app/test/features/tournaments/bracket_feed_tree_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/bracket_feed_tree.dart';

import 'bracket_plants_fixture.dart';

void main() {
  final plants = loadBracketPlants();

  test('planta de 12: convergência nas semifinais, na final e no 3º lugar', () {
    // #19 e #20 são as semifinais cruzadas — juntam WB com LB. Elas têm
    // matchType "WB" de propósito (ver bracket-12-teams.ts), então a
    // identificação NÃO pode sair do matchType.
    expect(bracketConvergenceMatches(plants[12]!), {19, 20, 21, 22});
  });

  test('planta de 8: convergência só na final e no 3º lugar', () {
    expect(bracketConvergenceMatches(plants[8]!), {13, 14});
  });

  test('toda planta tem ao menos uma partida de convergência', () {
    for (final entry in plants.entries) {
      expect(
        bracketConvergenceMatches(entry.value),
        isNotEmpty,
        reason: 'planta de ${entry.key} sem faixa central',
      );
    }
  });
}
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: FAIL — `bracket_feed_tree.dart` não existe.

- [ ] **Step 3: Implementar**

```dart
// nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart
import 'tournament_match.dart';

/// Partidas da FAIXA CENTRAL da chave convergente: as que juntam um alimentador
/// da WB com um da LB, mais a Final e a disputa de 3º lugar.
///
/// A identificação sai da FIAÇÃO, nunca do `matchType`: nas plantas de 12 e 32
/// as semifinais cruzadas são gravadas como "WB" de propósito (marcá-las LB
/// faria o resolvedor de colocação premiar o perdedor antes do 3º lugar), então
/// procurar por um tipo "semifinal" não acharia nada.
Set<int> bracketConvergenceMatches(List<TournamentMatch> matches) {
  final typeByNumber = <int, String>{
    for (final m in matches) m.matchNumber: m.matchType.trim().toLowerCase(),
  };
  final feeders = <int, List<int>>{};
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    (feeders[dest] ??= <int>[]).add(m.matchNumber);
  }

  final result = <int>{};
  for (final m in matches) {
    final type = m.matchType.trim().toLowerCase();
    if (type == 'final' || type == 'third place') {
      result.add(m.matchNumber);
      continue;
    }
    final sources = feeders[m.matchNumber] ?? const <int>[];
    final hasWb = sources.any((n) => typeByNumber[n] == 'wb');
    final hasLb = sources.any((n) => typeByNumber[n] == 'lb');
    if (hasWb && hasLb) result.add(m.matchNumber);
  }
  return result;
}
```

- [ ] **Step 4: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: PASS (3 testes)

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart nexago_app/test/features/tournaments/bracket_feed_tree_test.dart
git commit -m "feat: identificar a faixa central da chave pela fiação"
```

---

### Task 3: Árvore de alimentação com lugar vago

O coração da entrega. Sem o lugar vago, o jogo com bye cola na altura do único alimentador e o lado vazio some — o defeito que o dono apontou.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart`
- Test: `nexago_app/test/features/tournaments/bracket_feed_tree_test.dart`

**Interfaces:**
- Produces: `class BracketFeedNode {int? matchNumber; List<BracketFeedNode> children; int span; bool get isEmptySlot;}` e `BracketFeedNode? buildBracketFeedTree(List<TournamentMatch> matches, int rootMatchNumber, String track)`.

- [ ] **Step 1: Escrever os testes que falham**

```dart
  group('árvore de alimentação', () {
    test('planta de 12, lado WB da semifinal #19: o bye vira lugar vago', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      expect(tree.matchNumber, 16); // a quarta que alimenta a semifinal
      expect(tree.children.map((c) => c.matchNumber), [5, 6]);

      // #5 é seed 2 (bye) contra o vencedor do #1: um lado só tem alimentador.
      final jogo5 = tree.children.first;
      expect(jogo5.children, hasLength(2));
      expect(jogo5.children.where((c) => c.isEmptySlot), hasLength(1));
      expect(jogo5.span, 2, reason: 'o bye ocupa um lugar');
    });

    test('planta de 12, lado LB: a entrada do perdedor também vira lugar vago', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'lb')!;
      expect(tree.matchNumber, 17); // #17 = V14 x P15
      expect(tree.children.where((c) => c.isEmptySlot), hasLength(1),
          reason: 'o lado de P15 não tem alimentador desenhado');
      expect(tree.children.map((c) => c.matchNumber), contains(14));
      expect(tree.span, 3);
    });

    test('a ponta da WB não ganha lugar vago — os dois lados são seeds', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final jogo1 = tree.children.first.children
          .firstWhere((c) => c.matchNumber == 1);
      expect(jogo1.children, isEmpty);
      expect(jogo1.span, 1);
    });

    test('devolve null quando a chave não alimenta aquela partida', () {
      // O 3º lugar só recebe perdedores: nenhum lado tem alimentador desenhado.
      expect(buildBracketFeedTree(plants[12]!, 21, 'wb'), isNull);
      expect(buildBracketFeedTree(plants[12]!, 21, 'lb'), isNull);
    });
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: FAIL — `buildBracketFeedTree` não definido.

- [ ] **Step 3: Implementar**

```dart
/// Um jogo e os LUGARES que a sua subárvore de alimentação ocupa.
class BracketFeedNode {
  const BracketFeedNode({
    required this.matchNumber,
    required this.children,
    required this.span,
  });

  /// `null` é LUGAR VAGO: o lado da partida que não tem alimentador desenhado —
  /// o bye na WB e a entrada do perdedor na LB. Ocupa espaço e não vira card;
  /// é ele que empurra o jogo para a altura certa, como na tabela impressa.
  final int? matchNumber;
  final List<BracketFeedNode> children;

  /// Lugares ocupados pela subárvore. Uma ponta (ou um vago) ocupa 1.
  final int span;

  bool get isEmptySlot => matchNumber == null;
}

const _emptySlot = BracketFeedNode(
  matchNumber: null,
  children: <BracketFeedNode>[],
  span: 1,
);

int _slotRank(TournamentMatch m) {
  if (m.winnerAdvanceSlot == 'A') return 0;
  if (m.winnerAdvanceSlot == 'B') return 1;
  return 2;
}

/// Árvore de alimentação que entra em [rootMatchNumber] pelo lado de [track]
/// (`'wb'` ou `'lb'`), descendo só por jogos daquela chave. `null` quando a
/// chave não alimenta aquela partida.
///
/// Toda partida tem DOIS lados: o que não tem alimentador desenhado vira lugar
/// vago. Sem isso o jogo se alinha em linha reta com o único alimentador e o
/// lado vazio desaparece da leitura — some o bye e some a entrada do perdedor.
BracketFeedNode? buildBracketFeedTree(
  List<TournamentMatch> matches,
  int rootMatchNumber,
  String track,
) {
  final feeders = <int, List<TournamentMatch>>{};
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    if (m.matchType.trim().toLowerCase() != track) continue;
    (feeders[dest] ??= <TournamentMatch>[]).add(m);
  }
  for (final list in feeders.values) {
    list.sort((a, b) {
      final cmp = _slotRank(a).compareTo(_slotRank(b));
      if (cmp != 0) return cmp;
      return a.matchNumber.compareTo(b.matchNumber);
    });
  }

  BracketFeedNode build(int number, Set<int> seen) {
    if (!seen.add(number)) return _emptySlot; // fiação cíclica: não trava
    final sources = feeders[number] ?? const <TournamentMatch>[];
    if (sources.isEmpty) {
      return BracketFeedNode(
        matchNumber: number,
        children: const <BracketFeedNode>[],
        span: 1,
      );
    }
    final children = <BracketFeedNode>[
      for (final s in sources) build(s.matchNumber, seen),
    ];
    if (children.length < 2) {
      // O alimentador que entra pelo slot B fica EMBAIXO; o vago, em cima.
      if (sources.first.winnerAdvanceSlot == 'B') {
        children.insert(0, _emptySlot);
      } else {
        children.add(_emptySlot);
      }
    }
    return BracketFeedNode(
      matchNumber: number,
      children: children,
      span: children.fold<int>(0, (sum, c) => sum + c.span),
    );
  }

  final entry = feeders[rootMatchNumber];
  if (entry == null || entry.isEmpty) return null;
  return build(entry.first.matchNumber, <int>{});
}
```

- [ ] **Step 4: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: PASS (7 testes)

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart nexago_app/test/features/tournaments/bracket_feed_tree_test.dart
git commit -m "feat: árvore de alimentação com lugar vago para bye e entrada de perdedor"
```

---

### Task 4: Centros verticais e profundidades

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart`
- Test: `nexago_app/test/features/tournaments/bracket_feed_tree_test.dart`

**Interfaces:**
- Produces: `void assignFeedCenters(BracketFeedNode node, double slotStart, Map<int, double> out)`, `void assignEmptySlotCenters(BracketFeedNode node, double slotStart, Map<int, List<double>> out)` e `void assignFeedDepths(BracketFeedNode node, int depth, Map<int, int> out)`. Centros são medidos em LUGARES (a primeira ponta fica em 0.5); profundidade 1 é a coluna encostada no centro.

- [ ] **Step 1: Escrever os testes que falham**

```dart
  group('centros e profundidades', () {
    test('as pontas ocupam meio lugar cada, o jogo fica na média dos filhos', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final centers = <int, double>{};
      assignFeedCenters(tree, 0, centers);

      // Lado WB de #19: [#5[ vago, #1 ], #6[ vago, #2 ]] — 4 lugares.
      expect(centers[1], 1.5);
      expect(centers[5], 1.0); // média entre o vago (0.5) e o #1 (1.5)
      expect(centers[2], 3.5);
      expect(centers[6], 3.0);
      expect(centers[16], 2.0); // média de #5 e #6
    });

    test('profundidade cresce ao se afastar do centro', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final depths = <int, int>{};
      assignFeedDepths(tree, 1, depths);
      expect(depths[16], 1); // quarta: encostada na faixa central
      expect(depths[5], 2);
      expect(depths[1], 3);
    });

    test('o lugar vago tem centro próprio, para o conector achar a ponta', () {
      final tree = buildBracketFeedTree(plants[12]!, 19, 'wb')!;
      final vagos = <int, List<double>>{};
      assignEmptySlotCenters(tree, 0, vagos);
      // O bye do #5 ocupa o primeiro lugar do bloco.
      expect(vagos[5], [0.5]);
      expect(vagos[6], [2.5]);
      expect(vagos.containsKey(1), isFalse, reason: 'ponta não tem lado vago');
    });
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: FAIL — `assignFeedCenters` não definido.

- [ ] **Step 3: Implementar**

```dart
/// Centro vertical de cada jogo, em LUGARES, a partir de [slotStart].
///
/// Percorre a árvore dando um lugar a cada ponta e pondo cada jogo interno na
/// MÉDIA dos filhos. Lugares vagos entram na conta e não viram entrada no mapa,
/// que é o que reserva o espaço do bye sem criar card. Medir por extensão de
/// subárvore (e não dobrar por rodada) é o que mantém as plantas irregulares
/// de pé — play-ins e a entrada desigual na LB das plantas 20 a 24.
void assignFeedCenters(
  BracketFeedNode node,
  double slotStart,
  Map<int, double> out,
) {
  if (node.children.isEmpty) {
    if (node.matchNumber != null) out[node.matchNumber!] = slotStart + 0.5;
    return;
  }
  var cursor = slotStart;
  final childCenters = <double>[];
  for (final child in node.children) {
    assignFeedCenters(child, cursor, out);
    childCenters.add(cursor + child.span / 2);
    cursor += child.span;
  }
  if (node.matchNumber != null) {
    out[node.matchNumber!] =
        childCenters.reduce((a, b) => a + b) / childCenters.length;
  }
}

/// Centro (em lugares) dos LUGARES VAGOS de cada partida. É daqui que sai a
/// ponta da linha livre que a tabela impressa desenha no lado do bye e no lado
/// da entrada do perdedor.
void assignEmptySlotCenters(
  BracketFeedNode node,
  double slotStart,
  Map<int, List<double>> out,
) {
  var cursor = slotStart;
  for (final child in node.children) {
    if (child.isEmptySlot) {
      if (node.matchNumber != null) {
        (out[node.matchNumber!] ??= <double>[]).add(cursor + child.span / 2);
      }
    } else {
      assignEmptySlotCenters(child, cursor, out);
    }
    cursor += child.span;
  }
}

/// Profundidade de cada jogo: [depth] na raiz da árvore (a coluna encostada na
/// faixa central), crescendo ao se afastar do centro.
void assignFeedDepths(BracketFeedNode node, int depth, Map<int, int> out) {
  if (node.matchNumber != null) out[node.matchNumber!] = depth;
  for (final child in node.children) {
    assignFeedDepths(child, depth + 1, out);
  }
}
```

- [ ] **Step 4: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_feed_tree_test.dart`
Esperado: PASS (10 testes)

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart nexago_app/test/features/tournaments/bracket_feed_tree_test.dart
git commit -m "feat: centros verticais por extensão de subárvore e profundidades"
```

---

### Task 5: Montar o layout convergente

Troca o miolo de `buildDoubleEliminationBracketLayout`. Os testes que existem hoje descrevem a geometria ANTIGA e vão falhar de propósito — reescrevê-los faz parte da tarefa.

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart`
- Test: `nexago_app/test/features/tournaments/double_elimination_bracket_layout_test.dart`

**Interfaces:**
- Consumes: tudo da Task 4.
- Produces: `buildDoubleEliminationBracketLayout` com a mesma assinatura e o mesmo `DoubleEliminationBracketLayout`. `BracketLayoutNode` ganha `final bool isEmptySlot` (default `false`) para o conector saber onde desenhar linha livre.

- [ ] **Step 1: Escrever os testes que falham**

```dart
  test('WB à esquerda do centro, LB à direita, convergência no meio', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);

    double xOf(int n) => layout.nodes
        .firstWhere((node) => node.matchId == 'm$n')
        .position
        .dx;

    // #16 (quarta da WB) → #19 (semifinal) ← #17 (LB)
    expect(xOf(16), lessThan(xOf(19)));
    expect(xOf(17), greaterThan(xOf(19)));
    // A LB corre da direita para o centro: a R1 fica na ponta direita.
    expect(xOf(11), greaterThan(xOf(14)));
    expect(xOf(14), greaterThan(xOf(17)));
  });

  test('a semifinal fica na média vertical dos seus dois alimentadores', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }
    expect(cy(19), closeTo((cy(16) + cy(17)) / 2, 0.01));
    expect(cy(20), closeTo((cy(15) + cy(18)) / 2, 0.01));
  });

  test('as duas semifinais não colidem', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    final a = layout.nodes.firstWhere((n) => n.matchId == 'm19');
    final b = layout.nodes.firstWhere((n) => n.matchId == 'm20');
    expect((a.position.dy - b.position.dy).abs(),
        greaterThanOrEqualTo(a.size.height));
  });

  test('o jogo com bye desloca — não cola na altura do alimentador', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    double cy(int n) {
      final node = layout.nodes.firstWhere((x) => x.matchId == 'm$n');
      return node.position.dy + node.size.height / 2;
    }
    // #5 recebe o seed 2 (bye) e o vencedor do #1. Se colasse no #1, os dois
    // teriam o mesmo centro — o bug que o desenho antigo tinha.
    expect(cy(5), isNot(closeTo(cy(1), 0.01)));
    expect(cy(5), lessThan(cy(1)));
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/double_elimination_bracket_layout_test.dart`
Esperado: FAIL nos quatro novos, e também nos antigos `columns follow the DE track order` e `LB track is placed below WB track` — eles descrevem a geometria que está sendo trocada.

- [ ] **Step 3: Implementar o novo miolo**

Substituir o corpo de `buildDoubleEliminationBracketLayout` (de `final byColumn = <String, List<TournamentMatch>>{};` até o `return`) por:

```dart
  final convergence = bracketConvergenceMatches(matches);
  final byNumber = {for (final m in matches) m.matchNumber: m};

  // Centros (em lugares) e colunas de cada jogo, montados bloco a bloco.
  final centerSlot = <int, double>{};
  final columnOf = <int, int>{};
  /// Centros dos lados sem alimentador, por partida — viram a linha livre.
  final vagos = <int, List<double>>{};

  // Profundidade máxima da WB decide onde fica o centro: a WB começa na
  // coluna 0 e a faixa central fica logo depois da coluna mais funda dela.
  var wbDepth = 0;
  final trees = <int, Map<String, BracketFeedNode?>>{};
  for (final root in convergence) {
    final wb = buildBracketFeedTree(matches, root, 'wb');
    final lb = buildBracketFeedTree(matches, root, 'lb');
    trees[root] = {'wb': wb, 'lb': lb};
    if (wb != null) {
      final depths = <int, int>{};
      assignFeedDepths(wb, 1, depths);
      for (final d in depths.values) {
        if (d > wbDepth) wbDepth = d;
      }
    }
  }
  final centerColumn = wbDepth;

  // Cada bloco ocupa uma faixa vertical própria, empilhadas de cima para baixo.
  var slotCursor = 0.0;
  final rootsInOrder = convergence.toList()..sort();
  for (final root in rootsInOrder) {
    final wb = trees[root]!['wb'];
    final lb = trees[root]!['lb'];
    if (wb == null && lb == null) continue; // 3º lugar: posicionado depois

    final span = math.max(wb?.span ?? 0, lb?.span ?? 0);
    for (final entry in <MapEntry<String, BracketFeedNode?>>[
      MapEntry('wb', wb),
      MapEntry('lb', lb),
    ]) {
      final tree = entry.value;
      if (tree == null) continue;
      // Blocos de spans diferentes ficam centralizados um sobre o outro.
      final inicio = slotCursor + (span - tree.span) / 2;
      final centers = <int, double>{};
      assignFeedCenters(tree, inicio, centers);
      centerSlot.addAll(centers);
      assignEmptySlotCenters(tree, inicio, vagos);
      final depths = <int, int>{};
      assignFeedDepths(tree, 1, depths);
      depths.forEach((number, d) {
        columnOf[number] = entry.key == 'wb' ? centerColumn - d : centerColumn + d;
      });
    }

    final wbCenter = wb?.matchNumber != null ? centerSlot[wb!.matchNumber!] : null;
    final lbCenter = lb?.matchNumber != null ? centerSlot[lb!.matchNumber!] : null;
    final both = [wbCenter, lbCenter].whereType<double>().toList();
    centerSlot[root] = both.reduce((a, b) => a + b) / both.length;
    columnOf[root] = centerColumn;
    slotCursor += span;
  }

  // Final e 3º lugar que NÃO convergem direto (plantas 12 e 32, onde quem
  // converge são as semifinais): centro vertical do conjunto, na MESMA coluna
  // central das semifinais — é o que a folha faz, com a final no meio e as
  // semifinais acima e abaixo. Dar coluna própria a elas empurraria a LB para
  // longe e roubaria o lugar da LB R3.
  final middle = slotCursor / 2;
  for (final root in rootsInOrder) {
    if (centerSlot.containsKey(root)) continue;
    centerSlot[root] = middle;
    columnOf[root] = centerColumn;
  }

  // Materializa nós e colunas.
  final nodes = <BracketLayoutNode>[];
  final columns = <BracketLayoutColumn>[];
  final nodeByMatchNumber = <int, BracketLayoutNode>{};
  const top = BracketLayoutMetrics.canvasPadding +
      BracketLayoutMetrics.columnHeaderHeight;

  final byColumnIndex = <int, List<TournamentMatch>>{};
  for (final m in matches) {
    final col = columnOf[m.matchNumber];
    if (col == null) continue;
    (byColumnIndex[col] ??= []).add(m);
  }

  final columnKeys = byColumnIndex.keys.toList()..sort();
  for (final col in columnKeys) {
    final columnMatches = byColumnIndex[col]!
      ..sort((a, b) =>
          centerSlot[a.matchNumber]!.compareTo(centerSlot[b.matchNumber]!));
    final x = _columnX(col);
    columns.add(
      BracketLayoutColumn(
        key: bracketGroupKey(columnMatches.first),
        label: bracketColumnHeaderLabel(columnMatches),
        matchIds: [for (final m in columnMatches) m.id],
        headerPosition: Offset(x, BracketLayoutMetrics.canvasPadding),
      ),
    );
    var prev = double.negativeInfinity;
    for (var i = 0; i < columnMatches.length; i++) {
      final match = columnMatches[i];
      final wanted = top +
          centerSlot[match.matchNumber]! * 2 * BracketLayoutMetrics.rowUnit;
      final minCenter = prev + BracketLayoutMetrics.cardHeight + _adjacentGap;
      final centerY = math.max(wanted, minCenter);
      prev = centerY;
      final node = BracketLayoutNode(
        matchId: match.id,
        columnKey: bracketGroupKey(match),
        slotIndex: i,
        position: Offset(
          x,
          centerY - BracketLayoutMetrics.cardHeight / 2,
        ),
        size: const Size(
          BracketLayoutMetrics.cardWidth,
          BracketLayoutMetrics.cardHeight,
        ),
        isFinal: match.matchType.trim().toLowerCase() == 'final',
      );
      nodes.add(node);
      nodeByMatchNumber[match.matchNumber] = node;
    }
  }

  final edges = _buildAdvanceEdges(matches, nodeByMatchNumber);

  // Linha livre de cada lado vago, correndo para FORA do centro — para a
  // esquerda na WB, para a direita na LB, ocupando a largura da coluna vizinha.
  final freeLines = <BracketLayoutEmptySlot>[];
  vagos.forEach((number, centros) {
    final col = columnOf[number];
    final match = byNumber[number];
    if (col == null || match == null) return;
    final paraEsquerda = col <= centerColumn;
    for (final c in centros) {
      final y = top + c * 2 * BracketLayoutMetrics.rowUnit;
      freeLines.add(
        BracketLayoutEmptySlot(
          matchId: match.id,
          from: Offset(
            paraEsquerda
                ? _columnX(col)
                : _columnX(col) + BracketLayoutMetrics.cardWidth,
            y,
          ),
          to: Offset(
            paraEsquerda
                ? _columnX(col - 1)
                : _columnX(col + 1) + BracketLayoutMetrics.cardWidth,
            y,
          ),
        ),
      );
    }
  });

  var maxX = BracketLayoutMetrics.canvasPadding;
  var maxY = BracketLayoutMetrics.canvasPadding;
  for (final node in nodes) {
    maxX = math.max(maxX, node.position.dx + node.size.width);
    maxY = math.max(maxY, node.position.dy + node.size.height);
  }
  for (final line in freeLines) {
    maxX = math.max(maxX, math.max(line.from.dx, line.to.dx));
  }

  return DoubleEliminationBracketLayout(
    nodes: nodes,
    edges: edges,
    columns: columns,
    emptySlots: freeLines,
    canvasSize: Size(
      maxX + BracketLayoutMetrics.canvasPadding,
      maxY + BracketLayoutMetrics.canvasPadding,
    ),
  );
```

Adicionar no topo do arquivo: `import 'bracket_feed_tree.dart';`

Adicionar a classe e o campo novo do layout:

```dart
/// Um lado de partida sem alimentador desenhado — o bye da WB e a entrada do
/// perdedor na LB. Não vira card: vira a linha livre que a tabela impressa
/// estica até a coluna vizinha, e é ela que mostra que aquele lado existe.
class BracketLayoutEmptySlot {
  const BracketLayoutEmptySlot({
    required this.matchId,
    required this.from,
    required this.to,
  });

  /// A partida DONA do lado vago.
  final String matchId;
  final Offset from;
  final Offset to;
}
```

Em `DoubleEliminationBracketLayout`, acrescentar `required this.emptySlots` ao construtor e
`final List<BracketLayoutEmptySlot> emptySlots;` ao corpo. O construtor é `const` e usado nos
testes — atualizar as chamadas existentes com `emptySlots: const []`.

Remover, por terem ficado sem uso: `_placeTrack`, `_placeFixedColumn`, `_placeFinalColumn`, `_applyColumn`, `_orderColumnsByWiring`, `_sortedKeysForType`, `_uniqueColumnKey`, `_splitIntraColumnDeps` e `BracketLayoutMetrics.wbLbGap`. O analisador acusa cada um — não deixar código morto para trás.

- [ ] **Step 4: Reescrever os testes antigos de geometria**

Trocar `columns follow the DE track order (WB, 3º lugar, Final, LB)` por uma versão que afirme a ordem NOVA (WB, centro, LB da direita para a esquerda) e remover `LB track is placed below WB track and Final is centered on WB`, que descreve o empilhamento que deixou de existir. Manter sem mudança `edges follow the real advance wiring`, `legacy matches without wiring still lay out` e `returns empty layout for no matches`.

- [ ] **Step 5: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/`
Esperado: PASS

- [ ] **Step 6: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart nexago_app/test/features/tournaments/double_elimination_bracket_layout_test.dart
git commit -m "feat: layout da chave ancorado na faixa central, WB e LB convergindo"
```

---

### Task 6: Arestas cruzando as chaves

**Files:**
- Modify: `nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart:592-620`
- Test: `nexago_app/test/features/tournaments/double_elimination_bracket_layout_test.dart`

**Interfaces:**
- Produces: `_buildAdvanceEdges` sem a regra `sameTrack`.

- [ ] **Step 1: Escrever o teste que falha**

```dart
  test('a LB liga na faixa central; a queda continua sem linha', () {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    bool hasEdge(int from, int to) => layout.edges
        .any((e) => e.fromMatchId == 'm$from' && e.toMatchId == 'm$to');

    expect(hasEdge(17, 19), isTrue, reason: 'vencedor da LB entra na semifinal');
    expect(hasEdge(18, 20), isTrue);
    expect(hasEdge(16, 19), isTrue);
    expect(hasEdge(19, 22), isTrue, reason: 'semifinal entra na final');
    // Queda: #15 perde e desce pro #17 — sem linha, por decisão do dono.
    expect(hasEdge(15, 17), isFalse);
    // O 3º lugar só recebe perdedores: nenhuma aresta chega nele.
    expect(layout.edges.any((e) => e.toMatchId == 'm21'), isFalse);
  });
```

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/double_elimination_bracket_layout_test.dart`
Esperado: FAIL — `hasEdge(17, 19)` é `false` por causa do `sameTrack`.

- [ ] **Step 3: Implementar**

Trocar o corpo do laço de `_buildAdvanceEdges` por:

```dart
  for (final m in matches) {
    final dest = m.winnerAdvanceMatchNumber;
    if (dest == null) continue;
    if (!byNumber.containsKey(dest)) continue;
    if (!nodeByMatchNumber.containsKey(m.matchNumber) ||
        !nodeByMatchNumber.containsKey(dest)) {
      continue;
    }
    edges.add(
      BracketLayoutEdge(fromMatchId: m.id, toMatchId: byNumber[dest]!.id),
    );
  }
```

E trocar o comentário de cabeçalho da função por:

```dart
/// Conectores pelos ponteiros reais de avanço (`winnerAdvance`), em qualquer
/// direção — inclusive LB→faixa central, que na forma convergente é o que faz
/// os dois lados se encontrarem. `loserAdvance` NÃO gera aresta: a queda do
/// perdedor não se desenha (decisão do dono, ver a spec de 13/09), do mesmo
/// jeito que a tabela impressa escreve "P 15" em vez de puxar uma linha.
```

- [ ] **Step 4: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/`
Esperado: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/domain/double_elimination_bracket_layout.dart nexago_app/test/features/tournaments/double_elimination_bracket_layout_test.dart
git commit -m "feat: ligar vencedor da LB à faixa central"
```

---

### Task 7: Invariantes contra as 25 plantas

O teste que pega a planta irregular que o design não previu.

**Files:**
- Create: `nexago_app/test/features/tournaments/bracket_layout_plants_test.dart`

**Interfaces:**
- Consumes: `loadBracketPlants` (Task 1), `buildDoubleEliminationBracketLayout`, `bracketConvergenceMatches`.

- [ ] **Step 1: Escrever o teste**

```dart
// nexago_app/test/features/tournaments/bracket_layout_plants_test.dart
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/bracket_feed_tree.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';

import 'bracket_plants_fixture.dart';

/// As plantas são a fonte da verdade da chave, e um desenho que colide ou
/// inverte lados numa planta irregular não aparece em teste sintético — o caso
/// que morde é o play-in com o MESMO round da rodada que alimenta (planta 25) e
/// a entrada desigual na LB das plantas 20 a 24.
void main() {
  final plants = loadBracketPlants();

  for (final entry in plants.entries) {
    final teamCount = entry.key;
    final matches = entry.value;

    test('planta de $teamCount: nenhum card se sobrepõe', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      for (var i = 0; i < layout.nodes.length; i++) {
        for (var j = i + 1; j < layout.nodes.length; j++) {
          final a = layout.nodes[i];
          final b = layout.nodes[j];
          final separados = a.position.dx + a.size.width <= b.position.dx ||
              b.position.dx + b.size.width <= a.position.dx ||
              a.position.dy + a.size.height <= b.position.dy ||
              b.position.dy + b.size.height <= a.position.dy;
          expect(separados, isTrue,
              reason: '${a.matchId} e ${b.matchId} se sobrepõem');
        }
      }
    });

    test('planta de $teamCount: WB à esquerda do centro, LB à direita', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final convergencia = bracketConvergenceMatches(matches);
      final xPorId = {for (final n in layout.nodes) n.matchId: n.position.dx};
      // Centro = o X da partida de convergência mais à esquerda.
      final centroX = convergencia
          .map((n) => xPorId['m$n'])
          .whereType<double>()
          .reduce((a, b) => a < b ? a : b);

      for (final m in matches) {
        final x = xPorId['m${m.matchNumber}'];
        if (x == null) continue;
        if (convergencia.contains(m.matchNumber)) continue;
        final tipo = m.matchType.trim().toLowerCase();
        if (tipo == 'wb') {
          expect(x, lessThan(centroX),
              reason: 'WB #${m.matchNumber} não está à esquerda do centro');
        } else if (tipo == 'lb') {
          expect(x, greaterThan(centroX),
              reason: 'LB #${m.matchNumber} não está à direita do centro');
        }
      }
    });

    test('planta de $teamCount: toda aresta liga colunas vizinhas', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final xPorId = {for (final n in layout.nodes) n.matchId: n.position.dx};
      final tipoPorId = {
        for (final m in matches) 'm${m.matchNumber}': m.matchType.trim().toLowerCase(),
      };
      const passo = BracketLayoutMetrics.cardWidth +
          BracketLayoutMetrics.columnGap;
      for (final e in layout.edges) {
        final de = xPorId[e.fromMatchId]!;
        final para = xPorId[e.toMatchId]!;
        final destino = tipoPorId[e.toMatchId];
        if (destino == 'final' || destino == 'third place') {
          // A final mora na coluna central junto das semifinais: a ligação é
          // vertical, dentro da mesma coluna. É o que a folha desenha.
          expect((de - para).abs(), anyOf(closeTo(0, 0.01), closeTo(passo, 0.01)),
              reason: '${e.fromMatchId} → ${e.toMatchId} pula coluna');
          continue;
        }
        expect((de - para).abs(), closeTo(passo, 0.01),
            reason: '${e.fromMatchId} → ${e.toMatchId} pula coluna');
      }
    });

    test('planta de $teamCount: partida com dois alimentadores fica na média', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final cyPorId = <String, double>{
        for (final n in layout.nodes)
          n.matchId: n.position.dy + n.size.height / 2,
      };
      final alimentadores = <String, List<String>>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        (alimentadores['m$dest'] ??= <String>[]).add('m${m.matchNumber}');
      }
      alimentadores.forEach((destino, fontes) {
        if (fontes.length != 2) return;
        final media = (cyPorId[fontes[0]]! + cyPorId[fontes[1]]!) / 2;
        expect(cyPorId[destino]!, closeTo(media, 0.5),
            reason: '$destino não está entre $fontes');
      });
    });

    test('planta de $teamCount: todo lado sem alimentador vira linha livre', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final desenhados = <int, int>{};
      for (final m in matches) {
        final dest = m.winnerAdvanceMatchNumber;
        if (dest == null) continue;
        desenhados[dest] = (desenhados[dest] ?? 0) + 1;
      }
      final livresPorId = <String, int>{};
      for (final slot in layout.emptySlots) {
        livresPorId[slot.matchId] = (livresPorId[slot.matchId] ?? 0) + 1;
      }
      for (final m in matches) {
        final entradas = desenhados[m.matchNumber] ?? 0;
        if (entradas == 0) continue; // ponta da WB: dois seeds, sem lado vago
        final tipo = m.matchType.trim().toLowerCase();
        if (tipo == 'final' || tipo == 'third place') continue;
        expect(entradas + (livresPorId['m${m.matchNumber}'] ?? 0), 2,
            reason: '#${m.matchNumber} não tem os dois lados ocupados');
      }
    });

    test('planta de $teamCount: todo jogo aparece uma vez só', () {
      final layout = buildDoubleEliminationBracketLayout(matches);
      final ids = layout.nodes.map((n) => n.matchId).toList();
      expect(ids.toSet(), hasLength(ids.length));
      expect(ids, hasLength(matches.length));
    });
  }
}
```

- [ ] **Step 2: Rodar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_layout_plants_test.dart`
Esperado: 175 testes (25 plantas × 7). Se alguma planta falhar, o defeito é do motor — corrigir o motor, nunca afrouxar a invariante.

- [ ] **Step 3: Commit**

```bash
git add nexago_app/test/features/tournaments/bracket_layout_plants_test.dart
git commit -m "test: invariantes de desenho contra as 25 plantas"
```

---

### Task 8: Conector com sentido e linha livre

**Files:**
- Modify: `nexago_app/lib/features/tournaments/presentation/widgets/bracket/bracket_connector_painter.dart`
- Test: `nexago_app/test/features/tournaments/bracket_connector_painter_test.dart`

**Interfaces:**
- Consumes: `DoubleEliminationBracketLayout` (com `emptySlots`, da Task 5), `BracketLayoutNode`, `BracketLayoutEmptySlot`.
- Produces: `BracketConnectorPainter` com `debugStartFor`/`debugEndFor`, desenhando da direita para a esquerda quando o destino está à esquerda, e traçando cada `emptySlots` como linha livre.

- [ ] **Step 1: Escrever o teste que falha**

```dart
// nexago_app/test/features/tournaments/bracket_connector_painter_test.dart
import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/double_elimination_bracket_layout.dart';
import 'package:nexago_app/features/tournaments/presentation/widgets/bracket/bracket_connector_painter.dart';

void main() {
  testWidgets('conector da LB sai pela esquerda do card de origem',
      (tester) async {
    // Origem à DIREITA do destino: é o sentido da LB na forma convergente.
    const origem = BracketLayoutNode(
      matchId: 'lb', columnKey: 'LB:1', slotIndex: 0,
      position: Offset(600, 100), size: Size(280, 150), isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'centro', columnKey: 'WB:4', slotIndex: 0,
      position: Offset(200, 100), size: Size(280, 150), isFinal: false,
    );
    final layout = DoubleEliminationBracketLayout(
      nodes: const [origem, destino],
      edges: const [BracketLayoutEdge(fromMatchId: 'lb', toMatchId: 'centro')],
      columns: const [],
      emptySlots: const [],
      canvasSize: const Size(1000, 400),
    );
    final painter = BracketConnectorPainter(
      layout: layout,
      nodeByMatchId: {'lb': origem, 'centro': destino},
    );

    final recorder = PictureRecorder();
    painter.paint(Canvas(recorder), const Size(1000, 400));
    final picture = recorder.endRecording();
    expect(picture, isNotNull);

    // O contrato observável: a linha começa na borda ESQUERDA da origem (600)
    // e termina na borda DIREITA do destino (200 + 280 = 480).
    expect(painter.debugStartFor(origem, destino).dx, 600);
    expect(painter.debugEndFor(origem, destino).dx, 480);
  });

  testWidgets('conector padrão (WB) continua saindo pela direita',
      (tester) async {
    const origem = BracketLayoutNode(
      matchId: 'wb', columnKey: 'WB:1', slotIndex: 0,
      position: Offset(20, 100), size: Size(280, 150), isFinal: false,
    );
    const destino = BracketLayoutNode(
      matchId: 'wb2', columnKey: 'WB:2', slotIndex: 0,
      position: Offset(356, 100), size: Size(280, 150), isFinal: false,
    );
    final painter = BracketConnectorPainter(
      layout: const DoubleEliminationBracketLayout(
        nodes: [], edges: [], columns: [], emptySlots: [],
        canvasSize: Size.zero,
      ),
      nodeByMatchId: const {},
    );
    expect(painter.debugStartFor(origem, destino).dx, 300);
    expect(painter.debugEndFor(origem, destino).dx, 356);
  });

  testWidgets('a linha livre do bye é desenhada na chave de 12',
      (tester) async {
    final plants = loadBracketPlants();
    final layout = buildDoubleEliminationBracketLayout(plants[12]!);
    // #5 recebe o seed 2 (bye): tem um lado livre, e ele corre para a ESQUERDA
    // porque #5 está na WB.
    final doJogo5 = layout.emptySlots.where((s) => s.matchId == 'm5').toList();
    expect(doJogo5, hasLength(1));
    expect(doJogo5.single.to.dx, lessThan(doJogo5.single.from.dx));

    // #17 recebe P15: lado livre correndo para a DIREITA, porque está na LB.
    final doJogo17 = layout.emptySlots.where((s) => s.matchId == 'm17').toList();
    expect(doJogo17, hasLength(1));
    expect(doJogo17.single.to.dx, greaterThan(doJogo17.single.from.dx));
  });
}
```

O arquivo de teste importa `bracket_plants_fixture.dart` (Task 1) e
`double_elimination_bracket_layout.dart`.

- [ ] **Step 2: Rodar para ver falhar**

Run: `cd nexago_app && flutter test test/features/tournaments/bracket_connector_painter_test.dart`
Esperado: FAIL — `debugStartFor` não definido.

- [ ] **Step 3: Implementar**

Substituir o `paint` de `BracketConnectorPainter` por:

```dart
  /// Ponto de saída da linha: borda DIREITA quando o destino está à direita,
  /// borda ESQUERDA quando está à esquerda. Na forma convergente a LB corre da
  /// direita para o centro, então o sentido não pode ser fixo.
  @visibleForTesting
  Offset debugStartFor(BracketLayoutNode from, BracketLayoutNode to) {
    final paraDireita = to.position.dx >= from.position.dx;
    return Offset(
      paraDireita ? from.position.dx + from.size.width : from.position.dx,
      from.position.dy + from.size.height / 2,
    );
  }

  @visibleForTesting
  Offset debugEndFor(BracketLayoutNode from, BracketLayoutNode to) {
    final paraDireita = to.position.dx >= from.position.dx;
    return Offset(
      paraDireita ? to.position.dx : to.position.dx + to.size.width,
      to.position.dy + to.size.height / 2,
    );
  }

  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.85)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round
      ..strokeJoin = StrokeJoin.round;

    for (final edge in layout.edges) {
      final from = nodeByMatchId[edge.fromMatchId];
      final to = nodeByMatchId[edge.toMatchId];
      if (from == null || to == null) continue;

      final start = debugStartFor(from, to);
      final end = debugEndFor(from, to);

      if ((start.dx - end.dx).abs() < 1) {
        // Mesma coluna — é a semifinal entrando na final, que na folha mora no
        // meio. Contorna pela direita em vez de degenerar num traço vertical
        // em cima dos dois cards.
        final desvio = start.dx + BracketLayoutMetrics.columnGap / 2;
        canvas.drawPath(
          Path()
            ..moveTo(start.dx, start.dy)
            ..lineTo(desvio, start.dy)
            ..lineTo(desvio, end.dy)
            ..lineTo(end.dx, end.dy),
          paint,
        );
        continue;
      }

      final midX = start.dx + (end.dx - start.dx) / 2;
      canvas.drawPath(
        Path()
          ..moveTo(start.dx, start.dy)
          ..lineTo(midX, start.dy)
          ..lineTo(midX, end.dy)
          ..lineTo(end.dx, end.dy),
        paint,
      );
    }

    // Linha livre do lado sem alimentador (bye e entrada de perdedor): traço
    // horizontal até a coluna vizinha, sem card na ponta — como na folha.
    final livre = Paint()
      ..color = AppColors.brand.withValues(alpha: 0.35)
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    for (final slot in layout.emptySlots) {
      canvas.drawLine(slot.from, slot.to, livre);
    }
  }
```

Adicionar `import 'package:flutter/foundation.dart';` para `@visibleForTesting`.

- [ ] **Step 4: Rodar até passar**

Run: `cd nexago_app && flutter test test/features/tournaments/`
Esperado: PASS

- [ ] **Step 5: Commit**

```bash
git add nexago_app/lib/features/tournaments/presentation/widgets/bracket/bracket_connector_painter.dart nexago_app/test/features/tournaments/bracket_connector_painter_test.dart
git commit -m "feat: conector segue o sentido real entre os dois cards"
```

---

### Task 9: CHECKPOINT — validar no app com o dono

Não portar nada antes disso. Escrever os três motores de uma vez multiplica por três qualquer erro de geometria antes de alguém olhar a tela.

- [ ] **Step 1: Rodar a suíte inteira do app**

Run: `cd nexago_app && flutter test`
Esperado: PASS

- [ ] **Step 2: Abrir a chave de uma categoria de 12 duplas no simulador**

Usar a skill `run` para subir o app, navegar até uma categoria com chave de dupla eliminação publicada e capturar a tela da chave.

- [ ] **Step 3: Comparar com a folha e mostrar ao dono**

Conferir contra `TABELAS 12 DUPLAS GOIANIA OPEN.pdf`: WB à esquerda, LB espelhada à direita, semifinais no meio de cada bloco, 3º lugar e final na faixa central, jogos com bye deslocados com o lado livre.

**PARAR aqui e esperar o aval do dono antes da Task 10.**

---

### Task 10: Porte do painel do organizador

**Files:**
- Modify: `frontend/projects/organizer/src/app/painel/chaveamento/bracket-tree.ts`
- Create: `frontend/projects/organizer/src/app/painel/chaveamento/bracket-tree.spec.ts`
- Modify: SCSS do conector em `chaveamento.component.ts`

**Interfaces:**
- Consumes: o algoritmo validado nas Tasks 2 a 8, em `nexago_app/lib/features/tournaments/domain/bracket_feed_tree.dart` e `double_elimination_bracket_layout.dart` — a versão aprovada na Task 9 é a referência, não o texto deste plano. As constantes web são `BRACKET_MATCH_WIDTH = 280`, `BRACKET_MATCH_HEIGHT = 136`, `ROW_UNIT = 80`.
- Produces, em `bracket-tree.ts`, com os mesmos nomes do Dart para as duas árvores ficarem comparáveis linha a linha:

```typescript
export interface BracketFeedNode {
  /** null = LUGAR VAGO: o lado sem alimentador desenhado (bye, entrada de perdedor). */
  readonly matchNumber: number | null;
  readonly children: readonly BracketFeedNode[];
  /** Lugares ocupados pela subárvore; uma ponta (ou um vago) ocupa 1. */
  readonly span: number;
}

export interface BracketEmptySlot {
  readonly matchId: string;
  readonly from: {x: number; y: number};
  readonly to: {x: number; y: number};
}

export function bracketConvergenceMatches(matches: readonly TournamentMatch[]): Set<number>;
export function buildBracketFeedTree(
  matches: readonly TournamentMatch[],
  rootMatchNumber: number,
  track: 'wb' | 'lb',
): BracketFeedNode | null;
export function assignFeedCenters(
  node: BracketFeedNode, slotStart: number, out: Map<number, number>,
): void;
export function assignEmptySlotCenters(
  node: BracketFeedNode, slotStart: number, out: Map<number, number[]>,
): void;
export function assignFeedDepths(
  node: BracketFeedNode, depth: number, out: Map<number, number>,
): void;
```

A saída pública de `bracket-tree.ts` mantém a assinatura de hoje, acrescida de `emptySlots: BracketEmptySlot[]`.

- [ ] **Step 1: Portar `bracketConvergenceMatches`, `buildBracketFeedTree`, `assignFeedCenters`, `assignEmptySlotCenters` e `assignFeedDepths`**

Tradução direta do Dart aprovado na Task 9, preservando os comentários — eles explicam decisões que o código não mostra (por que a convergência sai da fiação e não do `matchType`, por que o lugar vago existe). Antes de portar, conferir em `matches-repository.ts` o formato de `winnerAdvanceSlot`: se lá for `'teamAId'`/`'teamBId'` em vez de `'A'`/`'B'`, normalizar na entrada da função, nunca duplicar a regra de ordenação.

- [ ] **Step 2: Escrever a spec com os mesmos casos do Dart**

Portar os testes das Tasks 2 a 6, usando as plantas do fixture (`nexago_app/test/fixtures/bracket_plants.json` — importar por caminho relativo ou copiar para `frontend/projects/organizer/src/testing/`). Specs Angular deste repo são zoneless: seguir o padrão de `agendamento.component.spec.ts`.

- [ ] **Step 3: Rodar**

Run: `cd frontend && npx ng test organizer --watch=false`
Esperado: PASS

- [ ] **Step 4: Ajustar o SCSS do conector para o sentido invertido**

- [ ] **Step 5: Verificar no navegador**

Subir o painel e conferir a chave contra a captura aprovada na Task 9.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/organizer/src/app/painel/chaveamento/
git commit -m "feat: chave convergente no painel do organizador"
```

---

### Task 11: Porte do portal do atleta

**Files:**
- Modify: `frontend/projects/athlete/src/app/tournaments/bracket-tree.ts`
- Create: `frontend/projects/athlete/src/app/tournaments/bracket-tree.spec.ts`
- Modify: SCSS do conector em `category-bracket.component.ts`

**Interfaces:**
- Consumes: o porte da Task 10, em `frontend/projects/organizer/src/app/painel/chaveamento/bracket-tree.ts`. O do atleta é porte do organizador, e as duas árvores devem ficar idênticas — mesmos nomes (`bracketConvergenceMatches`, `buildBracketFeedTree`, `assignFeedCenters`, `assignEmptySlotCenters`, `assignFeedDepths`), mesmos tipos (`BracketFeedNode`, `BracketEmptySlot`) e mesmos comentários da Task 10.
- Produces: a assinatura pública de hoje acrescida de `emptySlots: BracketEmptySlot[]`.

- [ ] **Step 1: Portar o mesmo algoritmo da Task 10**

Copiar do organizador, adaptando só os imports e o tipo `TournamentMatch` local (o do atleta vem de `frontend/projects/athlete/src/app/data/matches-repository.ts`). Divergir do organizador aqui é o defeito clássico deste par de arquivos: eles já são portes um do outro e precisam continuar comparáveis linha a linha.

- [ ] **Step 2: Escrever a spec com os mesmos casos**

Portar a spec da Task 10 inteira. Specs Angular deste repo são zoneless.

- [ ] **Step 3: Rodar**

Run: `cd frontend && npx ng test athlete --watch=false`
Esperado: PASS

- [ ] **Step 4: Ajustar o SCSS do conector**

- [ ] **Step 5: Verificar no navegador, inclusive em viewport mobile**

A chave ficou ~2× mais larga; conferir que o pan lateral funciona na largura de celular.

- [ ] **Step 6: Commit**

```bash
git add frontend/projects/athlete/src/app/tournaments/
git commit -m "feat: chave convergente no portal do atleta"
```

---

## Notas de execução

- **Regerar o fixture** (`node functions/scripts/export-bracket-fixtures.js`, depois de `npm run build`) sempre que qualquer planta mudar. Um fixture velho faz os testes protegerem a chave errada.
- **Nunca afrouxar uma invariante da Task 7** para fazer uma planta passar. Se a planta de 25 colide, o defeito é do motor.
- Este worktree tem o PR #431 aberto com a planta de 12 ajustada. Este trabalho é independente dela — a planta define quem joga contra quem, este plano define onde o jogo é desenhado.
