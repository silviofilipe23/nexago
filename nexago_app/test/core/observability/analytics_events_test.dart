import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/observability/analytics_events.dart';

void main() {
  group('tournamentRegistrationParams', () {
    test('includes trimmed ids', () {
      final p = tournamentRegistrationParams(
        tournamentId: '  t1 ',
        categoryId: 'c1',
      );
      expect(p, {'tournament_id': 't1', 'category_id': 'c1'});
    });

    test('omits empty fields (analytics rejects null/empty)', () {
      final p = tournamentRegistrationParams(
        tournamentId: '',
        categoryId: '   ',
      );
      expect(p, isEmpty);
    });

    test('includes amountType only when present', () {
      expect(
        tournamentRegistrationParams(
          tournamentId: 't',
          categoryId: 'c',
          amountType: 'full',
        )['amount_type'],
        'full',
      );
      expect(
        tournamentRegistrationParams(
          tournamentId: 't',
          categoryId: 'c',
          amountType: '  ',
        ).containsKey('amount_type'),
        isFalse,
      );
    });
  });
}
