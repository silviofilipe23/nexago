import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/theme/app_theme_mode_preference.dart';

void main() {
  group('AppThemeModePreference', () {
    test('maps to ThemeMode', () {
      expect(
        AppThemeModePreference.dark.themeMode,
        ThemeMode.dark,
      );
      expect(
        AppThemeModePreference.light.themeMode,
        ThemeMode.light,
      );
      expect(
        AppThemeModePreference.system.themeMode,
        ThemeMode.system,
      );
    });

    test('fromStorage defaults to dark', () {
      expect(
        AppThemeModePreference.fromStorage(null),
        AppThemeModePreference.dark,
      );
      expect(
        AppThemeModePreference.fromStorage('unknown'),
        AppThemeModePreference.dark,
      );
    });
  });
}
