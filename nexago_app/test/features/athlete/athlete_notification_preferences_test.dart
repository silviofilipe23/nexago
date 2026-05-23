import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_notification_preferences.dart';

void main() {
  group('AthleteNotificationPreferences', () {
    test('defaults match prototype', () {
      const prefs = AthleteNotificationPreferences.defaults;
      expect(prefs.channels.push, isTrue);
      expect(prefs.channels.whatsapp, isTrue);
      expect(prefs.channels.email, isFalse);
      expect(prefs.topics.availableSlots, isFalse);
      expect(prefs.topics.promotions, isFalse);
      expect(prefs.quietHours.enabled, isTrue);
      expect(prefs.quietHours.start, '22:00');
      expect(prefs.quietHours.end, '07:00');
    });

    test('fromFirestore merges partial maps', () {
      final prefs = AthleteNotificationPreferences.fromFirestore({
        'channels': {'email': true},
        'topics': {'promotions': true},
        'quietHours': {'start': '23:30', 'end': '08:05'},
      });
      expect(prefs.channels.push, isTrue);
      expect(prefs.channels.email, isTrue);
      expect(prefs.topics.promotions, isTrue);
      expect(prefs.quietHours.start, '23:30');
      expect(prefs.quietHours.end, '08:05');
    });

    test('fromFirestore ignores invalid input', () {
      expect(
        AthleteNotificationPreferences.fromFirestore(null),
        AthleteNotificationPreferences.defaults,
      );
      expect(
        AthleteNotificationPreferences.fromFirestore('x'),
        AthleteNotificationPreferences.defaults,
      );
    });

    test('quietHours label', () {
      const prefs = AthleteNotificationPreferences(
        quietHours: AthleteNotificationQuietHours(
          start: '22:00',
          end: '07:00',
        ),
      );
      expect(prefs.quietHours.label, 'Das 22:00 às 07:00');
    });

    test('channelsSummaryForSettings', () {
      const allOn = AthleteNotificationPreferences(
        channels: AthleteNotificationChannels(
          push: true,
          whatsapp: true,
          email: true,
        ),
      );
      expect(
        allOn.channelsSummaryForSettings(),
        'Push · WhatsApp · Email',
      );

      const none = AthleteNotificationPreferences(
        channels: AthleteNotificationChannels(
          push: false,
          whatsapp: false,
          email: false,
        ),
      );
      expect(none.channelsSummaryForSettings(), 'Nenhum canal ativo');
    });

    test('toFirestore round-trip keys', () {
      const prefs = AthleteNotificationPreferences.defaults;
      final map = prefs.toFirestore();
      expect(map['channels'], isA<Map>());
      expect(map['topics'], isA<Map>());
      expect(map['quietHours'], isA<Map>());
      final restored = AthleteNotificationPreferences.fromFirestore(map);
      expect(restored, prefs);
    });
  });
}
