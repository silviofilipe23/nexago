import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_display_name.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/app_user_profile.dart';

AthleteProfile _profile({
  String name = 'Silvio Dionizio',
  String? nickname,
}) {
  return AthleteProfile(
    id: 'u1',
    name: name,
    nickname: nickname,
    sport: 'Beach tennis',
    level: 'Intermediário',
    city: 'Goiânia',
  );
}

void main() {
  group('athleteDisplayName', () {
    test('prefers nickname over full name', () {
      expect(
        athleteDisplayName(_profile(nickname: 'Silvio')),
        'Silvio',
      );
    });

    test('strips leading @ from nickname', () {
      expect(
        athleteDisplayName(_profile(nickname: '@marcelao')),
        'marcelao',
      );
    });

    test('falls back to full name when nickname is empty', () {
      expect(
        athleteDisplayName(_profile()),
        'Silvio Dionizio',
      );
    });
  });

  group('athleteInitials', () {
    test('uses nickname for initials when present', () {
      expect(
        athleteInitials(_profile(nickname: 'Marcelão')),
        'MA',
      );
    });
  });

  group('athleteSecondaryLine', () {
    test('returns full name when different from display name', () {
      expect(
        athleteSecondaryLine(_profile(nickname: 'Silvio')),
        'Silvio Dionizio',
      );
    });

    test('returns null when nickname matches sole name token', () {
      expect(
        athleteSecondaryLine(_profile(name: 'Silvio', nickname: 'Silvio')),
        isNull,
      );
    });
  });

  group('appUserInitials', () {
    test('derives initials from nickname-first display name', () {
      const user = AppUserProfile(
        uid: 'u1',
        fullName: 'Silvio Dionizio',
        nickname: 'Silvio',
      );

      expect(appUserInitials(user), 'SI');
    });
  });
}
