import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Guarda, por uid, que a pessoa já viu a folha "Como funciona o clube"
/// (outra conta no mesmo aparelho vê de novo). Sem o canal nativo (hot
/// restart, teste), guarda em memória até o app fechar.
class BenefitsClubOnboardingStore {
  Future<SharedPreferences?>? _prefs;
  final _memory = <String>{};

  Future<SharedPreferences?> _load() => _prefs ??= () async {
    try {
      return await SharedPreferences.getInstance();
    } on PlatformException {
      return null;
    } on MissingPluginException {
      return null;
    }
  }();

  static String _key(String uid) => 'benefits_club_how_it_works_seen_$uid';

  Future<bool> hasSeenHowItWorks(String uid) async {
    if (uid.isEmpty || _memory.contains(uid)) return true;
    final prefs = await _load();
    return prefs?.getBool(_key(uid)) ?? false;
  }

  Future<void> markHowItWorksSeen(String uid) async {
    if (uid.isEmpty) return;
    _memory.add(uid);
    final prefs = await _load();
    await prefs?.setBool(_key(uid), true);
  }
}
