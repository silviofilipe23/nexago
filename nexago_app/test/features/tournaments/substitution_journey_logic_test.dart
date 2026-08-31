import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/substitution_journey_logic.dart';

void main() {
  group('substitutionReasonLabels', () {
    test('cobre os 5 motivos do backend', () {
      expect(substitutionReasonLabels, {
        'lesao': 'Lesão',
        'imprevisto': 'Imprevisto pessoal',
        'trabalho': 'Trabalho',
        'viagem': 'Viagem',
        'outro': 'Outro',
      });
    });
  });

  group('substitutionCountdownLabel', () {
    test('>=1 dia: "1d 04h"', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = now.add(const Duration(days: 1, hours: 4));
      expect(substitutionCountdownLabel(expiresAt, now), '1d 04h');
    });

    test('>=1 hora, <1 dia: "05h 12min"', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = now.add(const Duration(hours: 5, minutes: 12));
      expect(substitutionCountdownLabel(expiresAt, now), '05h 12min');
    });

    test('<1 hora: "Xmin" sem zero à esquerda', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = now.add(const Duration(minutes: 12));
      expect(substitutionCountdownLabel(expiresAt, now), '12min');

      final expiresAtSingleDigit = now.add(const Duration(minutes: 5));
      expect(substitutionCountdownLabel(expiresAtSingleDigit, now), '5min');
    });

    test('vencido (now >= expiresAt): null', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      expect(
        substitutionCountdownLabel(
            now.subtract(const Duration(minutes: 1)), now),
        isNull,
      );
      expect(substitutionCountdownLabel(now, now), isNull);
    });

    test('fronteira exata de 1 dia soma 00h', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = now.add(const Duration(days: 1));
      expect(substitutionCountdownLabel(expiresAt, now), '1d 00h');
    });

    test('fronteira exata de 1 hora soma 00min', () {
      final now = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = now.add(const Duration(hours: 1));
      expect(substitutionCountdownLabel(expiresAt, now), '01h 00min');
    });
  });

  group('substitutionTtlProgress', () {
    test('no início (now == createdAt): 0', () {
      final createdAt = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = createdAt.add(const Duration(hours: 48));
      expect(substitutionTtlProgress(createdAt, expiresAt, createdAt), 0.0);
    });

    test('no fim (now == expiresAt): 1', () {
      final createdAt = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = createdAt.add(const Duration(hours: 48));
      expect(substitutionTtlProgress(createdAt, expiresAt, expiresAt), 1.0);
    });

    test('na metade: 0.5', () {
      final createdAt = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = createdAt.add(const Duration(hours: 48));
      final now = createdAt.add(const Duration(hours: 24));
      expect(substitutionTtlProgress(createdAt, expiresAt, now), 0.5);
    });

    test('clamp: antes de createdAt não fica negativo', () {
      final createdAt = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = createdAt.add(const Duration(hours: 48));
      final now = createdAt.subtract(const Duration(hours: 1));
      expect(substitutionTtlProgress(createdAt, expiresAt, now), 0.0);
    });

    test('clamp: depois de expiresAt não passa de 1', () {
      final createdAt = DateTime.utc(2026, 8, 31, 10, 0);
      final expiresAt = createdAt.add(const Duration(hours: 48));
      final now = expiresAt.add(const Duration(hours: 10));
      expect(substitutionTtlProgress(createdAt, expiresAt, now), 1.0);
    });
  });

  group('substitutionViewedLabel', () {
    test('sem viewedAt: null', () {
      expect(substitutionViewedLabel(null, DateTime.utc(2026, 8, 31)), isNull);
    });

    test('<1 min: "visualizado agora"', () {
      final viewedAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = viewedAt.add(const Duration(seconds: 30));
      expect(substitutionViewedLabel(viewedAt, now), 'visualizado agora');
    });

    test('<60 min: "visualizado há 3 min"', () {
      final viewedAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = viewedAt.add(const Duration(minutes: 3));
      expect(substitutionViewedLabel(viewedAt, now), 'visualizado há 3 min');
    });

    test('>=1h: "visualizado há 2 h"', () {
      final viewedAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = viewedAt.add(const Duration(hours: 2, minutes: 10));
      expect(substitutionViewedLabel(viewedAt, now), 'visualizado há 2 h');
    });
  });

  group('substitutionOutcomeOf', () {
    test('pending + vencido => expired', () {
      final expiresAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = expiresAt.add(const Duration(minutes: 1));
      expect(
        substitutionOutcomeOf('pending', expiresAt, now),
        SubstitutionInviteOutcome.expired,
      );
    });

    test('pending + dentro do prazo => pending', () {
      final expiresAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = expiresAt.subtract(const Duration(minutes: 1));
      expect(
        substitutionOutcomeOf('pending', expiresAt, now),
        SubstitutionInviteOutcome.pending,
      );
    });

    test('status manda nos demais, mesmo vencido', () {
      final expiresAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = expiresAt.add(const Duration(days: 1));
      expect(
        substitutionOutcomeOf('accepted', expiresAt, now),
        SubstitutionInviteOutcome.accepted,
      );
      expect(
        substitutionOutcomeOf('declined', expiresAt, now),
        SubstitutionInviteOutcome.declined,
      );
      expect(
        substitutionOutcomeOf('cancelled', expiresAt, now),
        SubstitutionInviteOutcome.cancelled,
      );
      expect(
        substitutionOutcomeOf('expired', expiresAt, now),
        SubstitutionInviteOutcome.expired,
      );
    });

    test('status desconhecido => stale', () {
      final expiresAt = DateTime.utc(2026, 8, 31, 10, 0);
      final now = expiresAt.subtract(const Duration(minutes: 1));
      expect(
        substitutionOutcomeOf('qualquer-coisa', expiresAt, now),
        SubstitutionInviteOutcome.stale,
      );
    });
  });
}
