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
