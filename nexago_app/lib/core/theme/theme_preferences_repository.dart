import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_theme_mode_preference.dart';

const _themeModeKey = 'theme_mode_preference';

/// Persistência local da preferência de tema.
///
/// Se o canal nativo falhar (ex.: hot restart sem plugin recarregado), usa
/// fallback em memória para a sessão atual.
class ThemePreferencesRepository {
  ThemePreferencesRepository._(this._prefs);

  final SharedPreferences? _prefs;
  AppThemeModePreference? _sessionFallback;

  static Future<ThemePreferencesRepository> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return ThemePreferencesRepository._(prefs);
    } on PlatformException {
      return ThemePreferencesRepository._(null);
    } catch (_) {
      return ThemePreferencesRepository._(null);
    }
  }

  /// `true` quando [SharedPreferences] está disponível nesta sessão.
  bool get hasPersistence => _prefs != null;

  AppThemeModePreference load() {
    final session = _sessionFallback;
    if (session != null) return session;
    final prefs = _prefs;
    if (prefs == null) return AppThemeModePreference.dark;
    return AppThemeModePreference.fromStorage(prefs.getString(_themeModeKey));
  }

  Future<void> save(AppThemeModePreference preference) async {
    _sessionFallback = preference;
    final prefs = _prefs;
    if (prefs == null) return;
    try {
      await prefs.setString(_themeModeKey, preference.storageValue);
    } on PlatformException {
      // Canal indisponível (hot restart, build sem plugin nativo).
    }
  }
}
