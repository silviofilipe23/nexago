import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import 'app_mobile_role.dart';

/// Persistência local da escolha de papel e toggle «Lembrar minha escolha».
class RolePreferencesRepository {
  RolePreferencesRepository._(this._prefs);

  final SharedPreferences? _prefs;

  static String _roleKey(String uid) => 'role_pref_$uid';
  static String _rememberKey(String uid) => 'role_remember_$uid';

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

  bool loadRemember(String uid) {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return false;
    return prefs.getBool(_rememberKey(uid)) ?? false;
  }

  Future<void> saveRoleChoice({
    required String uid,
    required AppMobileRole role,
    required bool remember,
  }) async {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return;
    try {
      if (remember) {
        await prefs.setString(_roleKey(uid), role.name);
        await prefs.setBool(_rememberKey(uid), true);
      } else {
        await prefs.remove(_roleKey(uid));
        await prefs.setBool(_rememberKey(uid), false);
      }
    } on PlatformException {
      // Canal indisponível (hot restart).
    }
  }

  Future<void> clearRemember(String uid) async {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return;
    try {
      await prefs.remove(_roleKey(uid));
      await prefs.setBool(_rememberKey(uid), false);
    } on PlatformException {
      // Canal indisponível.
    }
  }
}
