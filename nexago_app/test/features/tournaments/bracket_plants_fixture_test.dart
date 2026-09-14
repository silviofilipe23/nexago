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

  test(
    'a conversão de slot (A/B) do gerador bate com a planta de 12 duplas',
    () {
      // Valores derivados de `bracket-12-teams.ts` (não de memória):
      // - #5:  teamB: WINNER 1  → vencedor do #1 ocupa o slot B do #5
      // - #9:  teamA: LOSER 1   → perdedor do #1 ocupa o slot A do #9
      // - #16: teamA: WINNER 5  → vencedor do #5 ocupa o slot A do #16
      // - #12: teamB: LOSER 5   → perdedor do #5 ocupa o slot B do #12
      // Juntos, #1 e #5 cobrem 'A' e 'B' tanto em winnerAdvanceSlot quanto em
      // loserAdvanceSlot — uma letra trocada em `slotLetter` quebra este teste.
      final plants = loadBracketPlants();
      final matches = {for (final m in plants[12]!) m.matchNumber: m};

      final match1 = matches[1]!;
      expect(match1.winnerAdvanceMatchNumber, 5);
      expect(match1.winnerAdvanceSlot, 'B');
      expect(match1.loserAdvanceMatchNumber, 9);
      expect(match1.loserAdvanceSlot, 'A');

      final match5 = matches[5]!;
      expect(match5.winnerAdvanceMatchNumber, 16);
      expect(match5.winnerAdvanceSlot, 'A');
      expect(match5.loserAdvanceMatchNumber, 12);
      expect(match5.loserAdvanceSlot, 'B');
    },
  );
}
