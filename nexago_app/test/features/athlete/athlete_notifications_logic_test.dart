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
