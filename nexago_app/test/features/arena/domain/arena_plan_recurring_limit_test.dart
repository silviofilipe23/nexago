import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';

void main() {
  group('maxRecurringBookingsFor', () {
    test('Starter com titularidade limita a 3 séries ativas', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.starter, entitled: true),
        3,
      );
    });

    test('Pro com titularidade é ilimitado (null)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.pro, entitled: true),
        isNull,
      );
    });

    test('Elite com titularidade é ilimitado (null)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.elite, entitled: true),
        isNull,
      );
    });

    test('Pro sem titularidade cai para o teto de sem plano (3)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.pro, entitled: false),
        3,
      );
    });

    test('Elite sem titularidade cai para o teto de sem plano (3)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.elite, entitled: false),
        3,
      );
    });

    test('tier null (arena sem plano) limita a 3, com ou sem titularidade',
        () {
      expect(maxRecurringBookingsFor(null, entitled: true), 3);
      expect(maxRecurringBookingsFor(null, entitled: false), 3);
    });

    test('Starter sem titularidade mantém o teto de 3', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.starter, entitled: false),
        3,
      );
    });

    test('Elite titular é sempre ilimitado nos dois gates', () {
      expect(maxCourtsFor(ArenaPlanTier.elite, entitled: true), isNull);
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.elite, entitled: true),
        isNull,
      );
    });

    test('Pro titular libera recorrência mas mantém teto de quadras (5)',
        () {
      expect(maxCourtsFor(ArenaPlanTier.pro, entitled: true), 5);
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.pro, entitled: true),
        isNull,
      );
    });
  });
}
