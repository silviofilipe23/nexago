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
