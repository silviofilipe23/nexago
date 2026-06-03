import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'app_theme_mode_preference.dart';
import 'theme_preferences_repository.dart';

final themePreferencesRepositoryProvider =
    Provider<ThemePreferencesRepository>((ref) {
  throw UnimplementedError(
    'themePreferencesRepositoryProvider must be overridden in main()',
  );
});

/// Preferência escolhida pelo usuário (system / light / dark).
final appThemeModePreferenceProvider =
    NotifierProvider<AppThemeModePreferenceNotifier, AppThemeModePreference>(
  AppThemeModePreferenceNotifier.new,
);

class AppThemeModePreferenceNotifier extends Notifier<AppThemeModePreference> {
  @override
  AppThemeModePreference build() {
    return ref.watch(themePreferencesRepositoryProvider).load();
  }

  Future<void> setPreference(AppThemeModePreference preference) async {
    state = preference;
    await ref.read(themePreferencesRepositoryProvider).save(preference);
  }
}

/// [ThemeMode] aplicado ao [MaterialApp].
final resolvedThemeModeProvider = Provider<ThemeMode>((ref) {
  return ref.watch(appThemeModePreferenceProvider).themeMode;
});
