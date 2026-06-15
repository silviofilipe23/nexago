import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/auth/app_mobile_role.dart';
import 'package:nexago_app/core/auth/role_preferences_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  group('RolePreferencesRepository', () {
    test('persists last selected role per uid', () async {
      SharedPreferences.setMockInitialValues({});
      final repo = await RolePreferencesRepository.create();

      await repo.saveRoleChoice(
        uid: 'user-a',
        role: AppMobileRole.arena,
      );

      expect(repo.loadRole('user-a'), AppMobileRole.arena);
      expect(repo.loadRole('user-b'), isNull);
    });

    test('overwrites previous role for same uid', () async {
      SharedPreferences.setMockInitialValues({
        'role_pref_user-a': 'athlete',
      });
      final repo = await RolePreferencesRepository.create();

      await repo.saveRoleChoice(
        uid: 'user-a',
        role: AppMobileRole.organizer,
      );

      expect(repo.loadRole('user-a'), AppMobileRole.organizer);
    });

    test('clearSavedRole removes persisted role', () async {
      SharedPreferences.setMockInitialValues({
        'role_pref_user-a': 'organizer',
      });
      final repo = await RolePreferencesRepository.create();

      await repo.clearSavedRole('user-a');

      expect(repo.loadRole('user-a'), isNull);
    });
  });
}
