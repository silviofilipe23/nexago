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

  test('appUserHasAthleteRole prioritizes roles array over legacy role field', () {
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '1', role: 'athlete'),
      ),
      isTrue,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(
          uid: '2',
          role: 'arena',
          roles: ['arena', 'athlete'],
        ),
      ),
      isTrue,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(
          uid: '5',
          role: 'organizer',
          roles: ['athlete', 'organizer'],
        ),
      ),
      isTrue,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '3', role: 'arena', roles: ['arena']),
      ),
      isFalse,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(
          uid: '6',
          role: 'organizer',
          roles: ['organizer'],
        ),
      ),
      isFalse,
    );
    expect(
      appUserHasAthleteRole(
        const AppUserProfile(uid: '4', role: 'athlete', roles: ['arena']),
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
}
