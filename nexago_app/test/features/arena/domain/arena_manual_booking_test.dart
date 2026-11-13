import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manual_booking.dart';

/// Regras puras da reserva de balcão no app. Espelham o portal
/// (`manual-booking-form.ts`) e o servidor (`manualAmountAfterMemberHours`).
void main() {
  group('ArenaMemberHours.fromMap', () {
    test('lê a resposta de quoteArenaManualBooking', () {
      final mh = ArenaMemberHours.fromMap({
        'weeklyMinutes': 240,
        'availableMinutes': 120,
        'coverMinutes': 60,
        'planName': 'Mensal 4h',
        'blocked': false,
      });
      expect(mh, isNotNull);
      expect(mh!.weeklyMinutes, 240);
      expect(mh.availableMinutes, 120);
      expect(mh.coverMinutes, 60);
      expect(mh.planName, 'Mensal 4h');
      expect(mh.canCover, isTrue);
    });

    test('null ou lixo não é mensalista', () {
      expect(ArenaMemberHours.fromMap(null), isNull);
      expect(ArenaMemberHours.fromMap('x'), isNull);
    });

    test('atrasado ou sem saldo não cobre', () {
      final blocked = ArenaMemberHours.fromMap({
        'weeklyMinutes': 240,
        'availableMinutes': 120,
        'coverMinutes': 0,
        'planName': 'P',
        'blocked': true,
      })!;
      final usedUp = ArenaMemberHours.fromMap({
        'weeklyMinutes': 240,
        'availableMinutes': 0,
        'coverMinutes': 0,
        'planName': 'P',
        'blocked': false,
      })!;
      expect(blocked.canCover, isFalse);
      expect(usedUp.canCover, isFalse);
    });
  });

  group('ArenaManualBookingQuote.fromData', () {
    test('valor e banco de horas', () {
      final q = ArenaManualBookingQuote.fromData({
        'amountReais': 90,
        'memberHours': {
          'weeklyMinutes': 120,
          'availableMinutes': 120,
          'coverMinutes': 60,
          'planName': 'P',
          'blocked': false,
        },
      });
      expect(q.amountReais, 90.0);
      expect(q.memberHours?.coverMinutes, 60);
    });

    test('resposta vazia: sem valor e sem banco', () {
      final q = ArenaManualBookingQuote.fromData(null);
      expect(q.amountReais, isNull);
      expect(q.memberHours, isNull);
    });
  });

  group('amountAfterMemberHours', () {
    test('cobre tudo: nada a cobrar', () {
      expect(amountAfterMemberHours(120, '19:00', '20:00', 60), 0);
    });

    test('cobre metade: metade do valor', () {
      expect(amountAfterMemberHours(120, '19:00', '21:00', 60), 60);
    });

    test('sem cobertura: valor cheio', () {
      expect(amountAfterMemberHours(120, '19:00', '20:00', 0), 120);
    });

    test('fim à meia-noite conta como 24:00', () {
      expect(amountAfterMemberHours(100, '23:00', '00:00', 30), 50);
    });

    test('arredonda em centavos', () {
      expect(amountAfterMemberHours(100, '19:00', '20:30', 60), 33.33);
    });
  });

  group('formatMemberMinutes', () {
    test('formatos', () {
      expect(formatMemberMinutes(45), '45min');
      expect(formatMemberMinutes(60), '1h');
      expect(formatMemberMinutes(90), '1h30');
      expect(formatMemberMinutes(-5), '0min');
    });
  });

  group('parseManualBookingAmount', () {
    test('aceita formatos do balcão', () {
      expect(parseManualBookingAmount('120'), 120);
      expect(parseManualBookingAmount('120.00'), 120);
      expect(parseManualBookingAmount('120,50'), 120.5);
      expect(parseManualBookingAmount('R\$ 1.200,00'), 1200);
      expect(parseManualBookingAmount('1.200'), 1200);
      expect(parseManualBookingAmount('0'), 0);
    });

    test('vazio, negativo ou lixo é null', () {
      expect(parseManualBookingAmount(''), isNull);
      expect(parseManualBookingAmount('  '), isNull);
      expect(parseManualBookingAmount('-10'), isNull);
      expect(parseManualBookingAmount('abc'), isNull);
    });
  });
}
