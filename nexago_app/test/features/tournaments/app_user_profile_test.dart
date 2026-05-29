import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/app_user_profile.dart';

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

  test('resolveAppUserDisplayName ignores uid-like profile fields', () {
    const profile = AppUserProfile(
      uid: 'abc',
      fullName: 'PtxdjGtgbJbTxjV11uweMwfOq3U2',
      nickname: 'Silvio',
    );

    expect(resolveAppUserDisplayName(profile), 'Silvio');
  });
}
