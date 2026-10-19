import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_model.dart';
import 'package:nexago_app/features/athlete/domain/booking_invite_providers.dart';
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

  group('respostas do convite novo', () {
    for (final entry in const {
      'declined': 'Você recusou este convite.',
      'canceled': 'Este convite foi cancelado.',
      'left': 'Você saiu deste jogo.',
      'removed': 'Você não está mais neste jogo.',
    }.entries) {
      test('status "${entry.key}" explica o bloqueio', () {
        expect(
          resolveBookingInviteBlockedReason(
            inviteStatus: entry.key,
            inviteExpired: false,
            bookingExists: true,
            bookingStatus: 'confirmed',
          ),
          entry.value,
        );
      });
    }

    test('link multiuso aberto não é bloqueado', () {
      expect(
        resolveBookingInviteBlockedReason(
          inviteStatus: 'open',
          inviteExpired: false,
          bookingExists: true,
          bookingStatus: 'active',
        ),
        isNull,
      );
    });
  });

  group('resolveBookingInviteGate', () {
    final now = DateTime(2026, 10, 24, 10);

    BookingInvite invite({
      String id = 'b1_ana',
      String status = 'pending',
      String kind = 'direct',
      String? inviteeUid = 'ana',
      DateTime? expiresAt,
    }) =>
        BookingInvite(
          id: id,
          bookingId: 'b1',
          arenaId: 'arena1',
          arenaName: 'Arena Sol',
          courtName: 'Quadra 2',
          date: '2026-10-24',
          startTime: '19:00',
          endTime: '20:00',
          invitedByUid: 'owner',
          invitedByName: 'Dono',
          status: status,
          createdAt: now,
          expiresAt: expiresAt ?? DateTime(2026, 10, 24, 20),
          kind: kind,
          inviteeUid: inviteeUid,
        );

    Map<String, dynamic> booking({
      String status = 'confirmed',
      List<String> participantUids = const [],
    }) =>
        {
          'athleteId': 'owner',
          'status': status,
          'participantUids': participantUids,
        };

    BookingInviteGate gateOf(
      BookingInvite i,
      Map<String, dynamic>? b,
      String? viewer,
    ) =>
        resolveBookingInviteGate(
          invite: i,
          booking: b,
          viewerUid: viewer,
          now: now,
        ).gate;

    test('convidado com convite pendente pode responder', () {
      expect(gateOf(invite(), booking(), 'ana'), BookingInviteGate.respond);
    });

    test('quem já está na lista vê "você está no jogo", mesmo pelo link', () {
      final b = booking(participantUids: ['ana']);
      expect(
        gateOf(invite(status: 'accepted'), b, 'ana'),
        BookingInviteGate.joined,
      );
      expect(
        gateOf(
          invite(id: 'link_b1', status: 'open', kind: 'link', inviteeUid: null),
          b,
          'ana',
        ),
        BookingInviteGate.joined,
      );
    });

    test('dono abrindo o próprio link', () {
      expect(
        gateOf(
          invite(id: 'link_b1', status: 'open', kind: 'link', inviteeUid: null),
          booking(),
          'owner',
        ),
        BookingInviteGate.owner,
      );
    });

    test('link vale para qualquer atleta; convite direto só para o convidado',
        () {
      expect(
        gateOf(
          invite(id: 'link_b1', status: 'open', kind: 'link', inviteeUid: null),
          booking(),
          'bia',
        ),
        BookingInviteGate.respond,
      );
      final other = resolveBookingInviteGate(
        invite: invite(),
        booking: booking(),
        viewerUid: 'bia',
        now: now,
      );
      expect(other.gate, BookingInviteGate.blocked);
      expect(other.message, 'Este convite é para outro atleta.');
    });

    test('reserva cancelada ou apagada bloqueia antes de tudo', () {
      final canceled = resolveBookingInviteGate(
        invite: invite(),
        booking: booking(status: 'cancelled', participantUids: ['ana']),
        viewerUid: 'ana',
        now: now,
      );
      expect(canceled.gate, BookingInviteGate.blocked);
      expect(canceled.message, 'Esta reserva foi cancelada.');
      expect(gateOf(invite(), null, 'ana'), BookingInviteGate.blocked);
    });

    test('quadra completa e convite vencido', () {
      final full = resolveBookingInviteGate(
        invite: invite(),
        booking: booking(participantUids: ['bia', 'caio', 'duda']),
        viewerUid: 'ana',
        now: now,
      );
      expect(full.message, 'A quadra já está completa.');
      final expired = resolveBookingInviteGate(
        invite: invite(expiresAt: DateTime(2026, 10, 24, 9)),
        booking: booking(),
        viewerUid: 'ana',
        now: now,
      );
      expect(expired.message, 'Este convite expirou.');
    });

    test('sem sessão pede login (bloqueio geral vem antes)', () {
      expect(gateOf(invite(), booking(), null), BookingInviteGate.signIn);
      expect(
        gateOf(invite(status: 'canceled'), booking(), null),
        BookingInviteGate.blocked,
      );
    });
  });

  group('liveReceivedBookingInvites', () {
    BookingInvite received(String id, String status, DateTime createdAt,
            {DateTime? expiresAt, String kind = 'direct', String? invitee = 'me'}) =>
        BookingInvite(
          id: id,
          bookingId: 'b',
          arenaId: 'a',
          arenaName: 'Arena',
          courtName: 'Q',
          date: '2026-10-24',
          startTime: '19:00',
          endTime: '20:00',
          invitedByUid: 'owner',
          invitedByName: 'Dono',
          status: status,
          createdAt: createdAt,
          expiresAt: expiresAt ?? DateTime(2026, 10, 24, 20),
          kind: kind,
          inviteeUid: invitee,
        );

    test('só pendentes que ainda valem, do mais novo ao mais antigo', () {
      final now = DateTime(2026, 10, 24, 10);
      final live = liveReceivedBookingInvites(
        [
          received('old', 'pending', DateTime(2026, 10, 20)),
          received('new', 'pending', DateTime(2026, 10, 23)),
          received('answered', 'accepted', DateTime(2026, 10, 23)),
          received('expired', 'pending', DateTime(2026, 10, 23),
              expiresAt: DateTime(2026, 10, 24, 9)),
        ],
        now: now,
      );
      expect(live.map((i) => i.id), ['new', 'old']);
    });
  });
}

