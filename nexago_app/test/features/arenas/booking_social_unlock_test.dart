import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/booking_social_unlock.dart';

void main() {
  group('BookingSocialUnlock.fromBooking', () {
    test('vale o que o servidor gravou', () {
      final u = BookingSocialUnlock.fromBooking({
        'status': 'confirmed',
        'amountReais': 120,
        'amountPaidOnlineReais': 120,
        'appPaidReais': 0,
        'socialUnlocked': false,
      });
      expect(u.unlocked, isFalse);
      expect(u.missingReais, 60);
    });

    test('reserva antiga sem o campo: sinal de 50% libera, menos não', () {
      Map<String, dynamic> b(num paid) => {
            'status': 'confirmed',
            'amountReais': 120,
            'amountPaidOnlineReais': paid,
          };
      expect(BookingSocialUnlock.fromBooking(b(60)).unlocked, isTrue);
      expect(BookingSocialUnlock.fromBooking(b(40)).unlocked, isFalse);
    });

    test('pago na arena, cancelada e estornada ficam bloqueadas', () {
      expect(
        BookingSocialUnlock.fromBooking({
          'status': 'active',
          'amountReais': 120,
          'amountPaidOnlineReais': 0,
        }).unlocked,
        isFalse,
      );
      for (final extra in <Map<String, dynamic>>[
        {'status': 'canceled'},
        {'status': 'expired'},
        {'status': 'confirmed', 'paymentStatus': 'refunded'},
      ]) {
        expect(
          BookingSocialUnlock.fromBooking({
            'status': 'confirmed',
            'amountReais': 120,
            'amountPaidOnlineReais': 120,
            ...extra,
          }).unlocked,
          isFalse,
          reason: '$extra',
        );
      }
    });

    test('sem doc: bloqueada', () {
      expect(BookingSocialUnlock.fromBooking(null).unlocked, isFalse);
    });
  });

  test('mensagem: dono sabe o que fazer, convidado sabe de quem depende', () {
    const u = BookingSocialUnlock(
      unlocked: false,
      appPaidReais: 0,
      totalReais: 120,
    );
    expect(
      bookingSocialLockedMessage(u, isOwner: true),
      startsWith('Pague pelo app pelo menos metade da reserva'),
    );
    expect(
      bookingSocialLockedMessage(u, isOwner: false),
      contains('quem reservou paga'),
    );
  });
}
