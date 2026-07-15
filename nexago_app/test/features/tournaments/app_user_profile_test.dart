import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';

void main() {
  test('looksLikeFirestoreUid detects auth-style ids', () {
    expect(
      looksLikeFirestoreUid('PtxdjGtgbJbTxjV11uweMwfOq3U2'),
      isTrue,
    );
    expect(looksLikeFirestoreUid('Thiago'), isFalse);
    expect(looksLikeFirestoreUid('Thiago / André'), isFalse);
  });

  test('safeMatchTeamDescription rejects uid pairs', () {
    expect(
      safeMatchTeamDescription(
        'PtxdjGtgbJbTxjV11uweMwfOq3U2 / fjbiABCDEF123456789012345',
      ),
      isNull,
    );
    expect(safeMatchTeamDescription('Seed 1'), 'Seed 1');
    expect(safeMatchTeamDescription('Thiago / André'), 'Thiago / André');
  });

  test('appUserHasAthleteRole reads only the roles array', () {
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '2', roles: ['arena', 'athlete']),
      ),
      isTrue,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '5', roles: ['athlete', 'organizer']),
      ),
      isTrue,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '3', roles: ['arena']),
      ),
      isFalse,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '6', roles: ['organizer']),
      ),
      isFalse,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '4', roles: []),
      ),
      isFalse,
    );
  });

  test('resolveAppUserDisplayName ignores uid-like profile fields', () {
    const profile = AppUserProfile(
      uid: 'abc',
      fullName: 'PtxdjGtgbJbTxjV11uweMwfOq3U2',
      nickname: 'Silvio',
    );

    expect(resolveAppUserDisplayName(profile), 'Silvio');
  });

  group('AppUserProfile.fromMap sportOnboarding parsing', () {
    test(
      'parses primary sport and per-sport levels from sportOnboarding',
      () {
        final profile = AppUserProfile.fromMap('u1', {
          'fullName': 'Ana',
          'sportOnboarding': {
            'primarySportId': 'VOLEI_PRAIA',
            'levelsBySport': {
              'VOLEI_PRAIA': 'intermediario_1',
              'VOLEI_QUADRA': 'iniciante_2',
            },
          },
        });

        expect(profile.primarySportFirestoreId, 'VOLEI_PRAIA');
        expect(profile.levelsBySportFirestore, {
          'VOLEI_PRAIA': 'intermediario_1',
          'VOLEI_QUADRA': 'iniciante_2',
        });
      },
    );

    test(
      'defaults to null primary sport and empty levels when sportOnboarding '
      'is missing',
      () {
        final profile = AppUserProfile.fromMap('u2', {'fullName': 'Bruno'});
        expect(profile.primarySportFirestoreId, isNull);
        expect(profile.levelsBySportFirestore, isEmpty);
      },
    );

    test('ignores non-string level values', () {
      final profile = AppUserProfile.fromMap('u3', {
        'sportOnboarding': {
          'primarySportId': 'VOLEI_PRAIA',
          'levelsBySport': {'VOLEI_PRAIA': 42},
        },
      });
      expect(profile.levelsBySportFirestore, isEmpty);
    });
  });
}
