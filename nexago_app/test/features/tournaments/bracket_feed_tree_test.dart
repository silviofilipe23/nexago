// ignore_for_file: avoid_print

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

  test('planta de 10: convergência nas semifinais cruzadas, na final e no 3º lugar', () {
    // #15 (WB) e #16 (LB) — juntam WB com LB. Diferente da 12, #16 é LB e não WB.
    // Prova que a lista de tipos não funciona: precisa da fiação.
    expect(bracketConvergenceMatches(plants[10]!), {15, 16, 17, 18});
  });

  test('planta de 8: convergência só na final e no 3º lugar', () {
    expect(bracketConvergenceMatches(plants[8]!), {13, 14});
  });

  test('plantasConvergenciaCount derivado do fixture', () {
    final count = <int, int>{};
    for (final entry in plants.entries) {
      count[entry.key] = bracketConvergenceMatches(entry.value).length;
    }
    // Plantas com cruzamento WB×LB antes da final (10, 12, 32): 4 partidas
    // Demais plantas: 2 partidas (só final + 3º lugar)
    expect(count[10], 4, reason: 'planta 10 com cruzamento');
    expect(count[12], 4, reason: 'planta 12 com cruzamento');
    expect(count[32], 4, reason: 'planta 32 com cruzamento');
    for (final size in [4, 5, 6, 7, 8, 9, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27]) {
      expect(count[size], 2, reason: 'planta $size sem cruzamento, só final + 3º lugar');
    }
  });
}
