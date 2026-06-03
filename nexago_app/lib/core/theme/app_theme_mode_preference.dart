import 'package:flutter/material.dart';

/// Preferência de aparência persistida localmente.
enum AppThemeModePreference {
  system,
  light,
  dark;

  String get label => switch (this) {
        AppThemeModePreference.system => 'Automático',
        AppThemeModePreference.light => 'Claro',
        AppThemeModePreference.dark => 'Escuro',
      };

  ThemeMode get themeMode => switch (this) {
        AppThemeModePreference.system => ThemeMode.system,
        AppThemeModePreference.light => ThemeMode.light,
        AppThemeModePreference.dark => ThemeMode.dark,
      };

  static AppThemeModePreference fromStorage(String? raw) {
    switch (raw) {
      case 'system':
        return AppThemeModePreference.system;
      case 'light':
        return AppThemeModePreference.light;
      case 'dark':
        return AppThemeModePreference.dark;
      default:
        return AppThemeModePreference.dark;
    }
  }

  String get storageValue => name;
}
