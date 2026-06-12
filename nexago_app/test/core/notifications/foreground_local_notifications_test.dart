import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/notifications/foreground_local_notifications.dart';

void main() {
  group('foregroundNotificationContent', () {
    test('uses notification payload title and body', () {
      final content = foregroundNotificationContent(
        RemoteMessage(
          notification: const RemoteNotification(
            title: 'Convite',
            body: 'Você foi convidado',
          ),
          data: const {},
        ),
      );

      expect(content?.title, 'Convite');
      expect(content?.body, 'Você foi convidado');
    });

    test('falls back to data fields for data-only messages', () {
      final content = foregroundNotificationContent(
        RemoteMessage(
          data: const {
            'title': 'Lembrete',
            'body': 'Sua reserva começa em 15 min',
          },
        ),
      );

      expect(content?.title, 'Lembrete');
      expect(content?.body, 'Sua reserva começa em 15 min');
    });

    test('returns null when there is no displayable text', () {
      final content = foregroundNotificationContent(
        RemoteMessage(data: const {'type': 'arena_booking_15m_reminder'}),
      );

      expect(content, isNull);
    });
  });

  group('decodeNotificationPayload', () {
    test('decodes json map payload', () {
      final data = decodeNotificationPayload(
        '{"type":"booking_invite","inviteId":"inv-1"}',
      );

      expect(data?['type'], 'booking_invite');
      expect(data?['inviteId'], 'inv-1');
    });

    test('returns null for invalid payload', () {
      expect(decodeNotificationPayload(null), isNull);
      expect(decodeNotificationPayload('not-json'), isNull);
    });
  });
}
