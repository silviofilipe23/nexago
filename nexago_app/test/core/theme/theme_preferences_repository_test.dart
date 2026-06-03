import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme_mode_preference.dart';
import 'package:nexago_app/core/theme/theme_preferences_repository.dart';
import 'package:shared_preferences/shared_preferences.dart';

void main() {
  TestWidgetsFlutterBinding.ensureInitialized();

  group('ThemePreferencesRepository', () {
    test('load returns dark when unset', () async {
      SharedPreferences.setMockInitialValues({});
      final repo = await ThemePreferencesRepository.create();
      expect(repo.load(), AppThemeModePreference.dark);
    });

    test('save and load round-trip', () async {
      SharedPreferences.setMockInitialValues({});
      final repo = await ThemePreferencesRepository.create();
      expect(repo.hasPersistence, isTrue);
      await repo.save(AppThemeModePreference.light);
      expect(repo.load(), AppThemeModePreference.light);
      await repo.save(AppThemeModePreference.system);
      expect(repo.load(), AppThemeModePreference.system);
    });

  });
}
