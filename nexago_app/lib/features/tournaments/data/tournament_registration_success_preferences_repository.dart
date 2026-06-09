import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

/// Persistência local de inscrições cuja tela de confirmação já foi exibida.
class TournamentRegistrationSuccessPreferencesRepository {
  TournamentRegistrationSuccessPreferencesRepository._(this._prefs);

  final SharedPreferences? _prefs;

  static String _handledKey(String uid) =>
      'tournament_reg_success_handled_$uid';

  static Future<TournamentRegistrationSuccessPreferencesRepository> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return TournamentRegistrationSuccessPreferencesRepository._(prefs);
    } on PlatformException {
      return TournamentRegistrationSuccessPreferencesRepository._(null);
    } catch (_) {
      return TournamentRegistrationSuccessPreferencesRepository._(null);
    }
  }

  Set<String> loadHandledIds(String uid) {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return <String>{};
    final raw = prefs.getStringList(_handledKey(uid)) ?? const <String>[];
    return raw.map((id) => id.trim()).where((id) => id.isNotEmpty).toSet();
  }

  Future<void> saveHandledIds(String uid, Set<String> ids) async {
    final prefs = _prefs;
    if (prefs == null || uid.isEmpty) return;
    try {
      await prefs.setStringList(_handledKey(uid), ids.toList()..sort());
    } on PlatformException {
      // Canal indisponível (hot restart).
    }
  }

  Future<void> addHandledId(String uid, String registrationId) async {
    final id = registrationId.trim();
    if (id.isEmpty) return;
    final current = loadHandledIds(uid);
    if (current.contains(id)) return;
    await saveHandledIds(uid, {...current, id});
  }
}
