import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notifications_logic.dart';

AthleteInboxNotification _notification({
  required String id,
  required DateTime createdAt,
  String type = 'general',
  bool read = false,
  bool dismissed = false,
}) {
  return AthleteInboxNotification(
    id: id,
    title: 'Título',
    body: 'Corpo',
    type: type,
    data: const {},
    read: read,
    dismissed: dismissed,
    createdAt: createdAt,
  );
}

void main() {
  final now = DateTime(2026, 5, 26, 14, 0);

  group('countUnreadNotifications', () {
    test('counts only unread and not dismissed', () {
      final items = [
        _notification(id: '1', createdAt: now, read: false),
        _notification(id: '2', createdAt: now, read: true),
        _notification(id: '3', createdAt: now, dismissed: true),
      ];
      expect(countUnreadNotifications(items), 1);
    });
  });

  group('filterNotifications', () {
    test('unreadOnly hides read and dismissed', () {
      final items = [
        _notification(id: '1', createdAt: now),
        _notification(id: '2', createdAt: now, read: true),
        _notification(id: '3', createdAt: now, dismissed: true),
      ];
      expect(
        filterNotifications(items: items, unreadOnly: true).length,
        1,
      );
    });
  });

  group('groupNotificationsByDay', () {
    test('groups into HOJE and ONTEM', () {
      final items = [
        _notification(id: '1', createdAt: now),
        _notification(
          id: '2',
          createdAt: now.subtract(const Duration(days: 1)),
        ),
      ];
      final sections = groupNotificationsByDay(items, now);
      expect(sections.length, 2);
      expect(sections.first.label, 'HOJE');
      expect(sections.last.label, 'ONTEM');
    });
  });

  group('notificationRelativeTimeLabel', () {
    test('returns Agora for recent', () {
      expect(
        notificationRelativeTimeLabel(
          now.subtract(const Duration(seconds: 30)),
          now,
        ),
        'Agora',
      );
    });

    test('returns minutes for under an hour', () {
      expect(
        notificationRelativeTimeLabel(
          now.subtract(const Duration(minutes: 5)),
          now,
        ),
        '5 min',
      );
    });
  });

  group('notificationPresentation', () {
    // Aviso da aba Comunicação do organizador: caía no default (sino cinza,
    // sem rota), então tocar na notificação não levava a lugar nenhum.
    test('tournament_communication routes to the tournament', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Mensagem do organizador',
        body: 'Cheguem 30min antes',
        type: 'tournament_communication',
        data: const {'tournamentId': 't1', 'categoryId': 'catA'},
        read: false,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.routePath, '/torneios/t1');
      expect(p.icon, Icons.campaign_rounded);
      expect(p.actions.single.label, 'Ver torneio');
    });

    test('tournament_communication prefers the url from the payload', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Mensagem do organizador',
        body: 'Cheguem 30min antes',
        type: 'tournament_communication',
        data: const {'tournamentId': 't1', 'url': '/torneios/t1/hoje'},
        read: false,
        dismissed: false,
        createdAt: now,
      );
      expect(notificationPresentation(n).routePath, '/torneios/t1/hoje');
    });

    test('tournament_communication without ids has no route', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Mensagem do organizador',
        body: 'Cheguem 30min antes',
        type: 'tournament_communication',
        data: const {},
        read: false,
        dismissed: false,
        createdAt: now,
      );
      expect(notificationPresentation(n).routePath, isNull);
    });

    test('tournament invite has accept actions and route', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Convite',
        body: 'Body',
        type: 'tournament_partner_invite',
        data: const {'inviteId': 'inv1'},
        read: false,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.actions.length, 2);
      expect(p.routePath, '/torneios-convite/inv1');
      expect(p.icon, Icons.emoji_events_outlined);
      expect(p.statusLine, isNull);
    });

    test('tournament invite declined hides actions and shows status', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Convite',
        body: 'Body',
        type: 'tournament_partner_invite',
        data: const {'inviteId': 'inv1', 'inviteResponse': 'declined'},
        read: true,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.actions, isEmpty);
      expect(p.statusLine, 'Você recusou o convite');
      expect(p.routePath, isNull);
      expect(p.icon, Icons.block_rounded);
    });

    test('tournament invite accepted hides actions and routes to inscription', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Convite',
        body: 'Body',
        type: 'tournament_partner_invite',
        data: const {
          'inviteId': 'inv1',
          'inviteResponse': 'accepted',
          'tournamentId': 't1',
          'registrationId': 'r1',
          'categoryId': 'catA',
        },
        read: true,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.actions, isEmpty);
      expect(p.statusLine, 'Você aceitou o convite');
      expect(
        p.routePath,
        '/torneios/t1/inscricao'
            '?registrationId=r1'
            '&categoryId=catA'
            '&inviteId=inv1',
      );
      expect(p.icon, Icons.check_circle_outline_rounded);
    });

    test('tournament invite accepted routes to payment', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Parceiro confirmou',
        body: 'Body',
        type: 'tournament_partner_invite_accepted',
        data: const {
          'tournamentId': 't1',
          'registrationId': 'r1',
          'categoryId': 'catA',
          'inviteId': 'inv1',
        },
        read: false,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.actions.single.label, 'Ir para pagamento');
      expect(
        p.routePath,
        '/torneios/t1/inscricao'
            '?registrationId=r1'
            '&categoryId=catA'
            '&inviteId=inv1'
            '&step=payment',
      );
    });

    test('tournament payment reminder routes to payment', () {
      final n = AthleteInboxNotification(
        id: 'x',
        title: 'Cobrança',
        body: 'Body',
        type: 'tournament_payment_reminder',
        data: const {
          'tournamentId': 't1',
          'registrationId': 'r1',
          'categoryId': 'catA',
        },
        read: false,
        dismissed: false,
        createdAt: now,
      );
      final p = notificationPresentation(n);
      expect(p.actions.single.label, 'Pagar agora');
      expect(p.icon, Icons.payments_outlined);
      expect(
        p.routePath,
        '/torneios/t1/inscricao'
            '?registrationId=r1'
            '&categoryId=catA'
            '&step=payment',
      );
    });

    test('booking reminder uses clock icon', () {
      final n = _notification(
        id: '1',
        createdAt: now,
        type: 'arena_booking_15m_reminder',
      );
      final p = notificationPresentation(n);
      expect(p.icon, Icons.schedule_rounded);
      expect(p.routePath, '/my-bookings');
    });
  });
}
