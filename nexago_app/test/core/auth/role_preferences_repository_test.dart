import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/role_preferences_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('RolePreferencesRepository', () {
    test('persists role and remember flag per uid', () async {
      SharedPreferences.setMockInitialValues({});
      final repo = await RolePreferencesRepository.create();

      await repo.saveRoleChoice(
        uid: 'user-a',
        role: AppMobileRole.arena,
        remember: true,
      );

      expect(repo.loadRole('user-a'), AppMobileRole.arena);
      expect(repo.loadRemember('user-a'), isTrue);
      expect(repo.loadRole('user-b'), isNull);
    });

    test('clears saved role when remember is false', () async {
      SharedPreferences.setMockInitialValues({
        'role_pref_user-a': 'athlete',
        'role_remember_user-a': true,
      });
      final repo = await RolePreferencesRepository.create();

      await repo.saveRoleChoice(
        uid: 'user-a',
        role: AppMobileRole.organizer,
        remember: false,
      );

      expect(repo.loadRole('user-a'), isNull);
      expect(repo.loadRemember('user-a'), isFalse);
    });
  });
}
