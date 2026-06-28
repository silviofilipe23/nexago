import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/formatting/app_date_format.dart';

void main() {
  group('calendarDateKey', () {
    test('formata com zero-padding em ano/mês/dia', () {
      expect(calendarDateKey(DateTime(2026, 6, 7)), '2026-06-07');
    });

    test('usa os campos de calendário como estão (sem conversão de fuso)', () {
      // Mesmo com hora/min, a chave reflete apenas o dia local do DateTime.
      expect(calendarDateKey(DateTime(2026, 1, 31, 23, 59)), '2026-01-31');
    });

    test('preserva dia de Timestamp.toDate() equivalente (local)', () {
      final d = DateTime(2025, 12, 1, 0, 0);
      expect(calendarDateKey(d), '2025-12-01');
    });
  });
}
