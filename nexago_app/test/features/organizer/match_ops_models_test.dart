import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_ops_models.dart';

void main() {
  group('TournamentMatchOpsConfig.dynamicRescheduleEnabled', () {
    test('default é false quando o campo não existe no map', () {
      final config = TournamentMatchOpsConfig.fromMap({
        'defaultMatchDurationMin': 30,
      });

      expect(config.dynamicRescheduleEnabled, isFalse);
    });

    test('lê true quando gravado no map', () {
      final config = TournamentMatchOpsConfig.fromMap({
        'dynamicRescheduleEnabled': true,
      });

      expect(config.dynamicRescheduleEnabled, isTrue);
    });

    test('toMap/fromMap fazem round-trip preservando o valor', () {
      const config = TournamentMatchOpsConfig(dynamicRescheduleEnabled: true);

      final roundTripped = TournamentMatchOpsConfig.fromMap(config.toMap());

      expect(roundTripped.dynamicRescheduleEnabled, isTrue);
    });
  });
}
