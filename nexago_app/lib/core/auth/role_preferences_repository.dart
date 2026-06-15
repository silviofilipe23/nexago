import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_mobile_role.dart';

/// Persistência local do último papel escolhido pelo usuário.
class RolePreferencesRepository {
  RolePreferencesRepository._(this._prefs);

  final SharedPreferences? _prefs;

  static String _roleKey(String uid) => 'role_pref_$uid';

  static Future<RolePreferencesRepository> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return RolePreferencesRepository._(prefs);
    } on PlatformException {
      return RolePreferencesRepository._(null);
    } catch (_) {
      return RolePreferencesRepository._(null);
    }
  }

  AppMobileRole? loadRole(String uid) {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return null;
    return AppMobileRole.fromStorage(prefs.getString(_roleKey(uid)));
  }

  Future<void> saveRoleChoice({
    required String uid,
    required AppMobileRole role,
  }) async {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return;
    try {
      await prefs.setString(_roleKey(uid), role.name);
    } on PlatformException {
      // Canal indisponível (hot restart).
    }
  }

  Future<void> clearSavedRole(String uid) async {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return;
    try {
      await prefs.remove(_roleKey(uid));
    } on PlatformException {
      // Canal indisponível.
    }
  }
}
