import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_plan.dart';

void main() {
  group('maxRecurringBookingsFor', () {
    test('Essencial com titularidade limita a 3 séries ativas', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.essencial, entitled: true),
        3,
      );
    });

    test('Pro com titularidade é ilimitado (null)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.pro, entitled: true),
        isNull,
      );
    });

    test('Parceiro com titularidade é ilimitado (null)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.parceiro, entitled: true),
        isNull,
      );
    });

    test('Pro sem titularidade cai para o teto do Essencial (3)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.pro, entitled: false),
        3,
      );
    });

    test('Parceiro sem titularidade cai para o teto do Essencial (3)', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.parceiro, entitled: false),
        3,
      );
    });

    test('tier null (arena sem plano) limita a 3, com ou sem titularidade', () {
      expect(maxRecurringBookingsFor(null, entitled: true), 3);
      expect(maxRecurringBookingsFor(null, entitled: false), 3);
    });

    test('Essencial sem titularidade mantém o teto de 3', () {
      expect(
        maxRecurringBookingsFor(ArenaPlanTier.essencial, entitled: false),
        3,
      );
    });

    test('mesmo shape de maxCourtsFor: pago entitled ilimitado, resto com teto',
        () {
      for (final tier in ArenaPlanTier.values) {
        for (final entitled in [true, false]) {
          final courts = maxCourtsFor(tier, entitled: entitled);
          final recurring = maxRecurringBookingsFor(tier, entitled: entitled);
          expect(
            recurring == null,
            courts == null,
            reason:
                'tier=$tier entitled=$entitled deve ser ilimitado nos dois gates ou em nenhum',
          );
        }
      }
    });
  });
}
