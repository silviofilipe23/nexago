import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_privacy_preferences.dart';

void main() {
  group('AthletePrivacyPreferences', () {
    test('defaults match prototype', () {
      const prefs = AthletePrivacyPreferences.defaults;
      expect(prefs.profileVisibility, AthleteProfileVisibility.public);
      expect(prefs.showOthers.achievementsAndLevel, isTrue);
      expect(prefs.showOthers.upcomingBookings, isFalse);
      expect(prefs.showOthers.frequentPartners, isTrue);
      expect(prefs.publicProfileEnabled, isTrue);
    });

    test('fromFirestore merges partial maps', () {
      final prefs = AthletePrivacyPreferences.fromFirestore({
        'profileVisibility': 'private',
        'showOthers': {'upcomingBookings': true},
      });
      expect(prefs.profileVisibility, AthleteProfileVisibility.private);
      expect(prefs.showOthers.upcomingBookings, isTrue);
      expect(prefs.publicProfileEnabled, isFalse);
      expect(prefs.visibilitySettingsLabel, 'Perfil privado');
    });

    test('friends behaves as discoverable in v1', () {
      const prefs = AthletePrivacyPreferences(
        profileVisibility: AthleteProfileVisibility.friends,
      );
      expect(prefs.publicProfileEnabled, isTrue);
      expect(prefs.visibilitySettingsLabel, 'Apenas amigos');
    });

    test('toFirestore round-trip', () {
      const prefs = AthletePrivacyPreferences.defaults;
      final restored =
          AthletePrivacyPreferences.fromFirestore(prefs.toFirestore());
      expect(restored, prefs);
    });
  });
}
