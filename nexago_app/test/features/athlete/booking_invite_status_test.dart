import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_status.dart';

void main() {
  group('resolveBookingInviteBlockedReason', () {
    test('convite pendente com reserva ativa não é bloqueado', () {
      final reason = resolveBookingInviteBlockedReason(
        inviteStatus: 'pending',
        inviteExpired: false,
        bookingExists: true,
        bookingStatus: 'confirmed',
      );
      expect(reason, isNull);
    });

    test('convite expirado é bloqueado antes de qualquer outra checagem', () {
      final reason = resolveBookingInviteBlockedReason(
        inviteStatus: 'pending',
        inviteExpired: true,
        bookingExists: true,
        bookingStatus: 'confirmed',
      );
      expect(reason, 'Este convite expirou.');
    });

    test(
      'convite já aceito (por outra pessoa) é bloqueado, sem deixar '
      'um segundo usuário aceitar o mesmo convite',
      () {
        final reason = resolveBookingInviteBlockedReason(
          inviteStatus: 'accepted',
          inviteExpired: false,
          bookingExists: true,
          bookingStatus: 'confirmed',
        );
        expect(reason, 'Este convite já foi aceito.');
      },
    );

    test('status de convite desconhecido cai no bloqueio genérico', () {
      final reason = resolveBookingInviteBlockedReason(
        inviteStatus: 'revoked',
        inviteExpired: false,
        bookingExists: true,
        bookingStatus: 'confirmed',
      );
      expect(reason, 'Este convite não está mais disponível.');
    });

    test('reserva original já não existe mais é bloqueada', () {
      final reason = resolveBookingInviteBlockedReason(
        inviteStatus: 'pending',
        inviteExpired: false,
        bookingExists: false,
        bookingStatus: null,
      );
      expect(reason, 'Esta reserva foi cancelada.');
    });

    for (final status in ['canceled', 'cancelled']) {
      test(
        'reserva com status "$status" é bloqueada (mesma checagem de '
        'grafia usada no resto do app)',
        () {
          final reason = resolveBookingInviteBlockedReason(
            inviteStatus: 'pending',
            inviteExpired: false,
            bookingExists: true,
            bookingStatus: status,
          );
          expect(reason, 'Esta reserva foi cancelada.');
        },
      );
    }
  });
}
