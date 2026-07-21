import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_catalog.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_share_text.dart';

void main() {
  group('sandRankShareText', () {
    test('usa o rótulo real do degrau (elo + divisão romana)', () {
      final step = sandRankStepByTrackIndex(4)!; // Competidor II
      final text = sandRankShareText(step);

      expect(text, contains('Competidor II'));
      expect(text, contains('nexaGO'));
      expect(text, contains('https://nexago.app'));
    });

    test('degrau sem divisão (Lenda) não mostra algarismo romano vazio', () {
      final step = sandRankTrack.last; // Lenda, division 0
      final text = sandRankShareText(step);

      expect(text, contains('Lenda'));
      expect(text, isNot(contains('Lenda !')));
    });
  });
}
