import 'dart:convert';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/league_stage_create/league_stage_create_session.dart';

String leagueStageCreateLocalStoreKey(String managerUid, String leagueId) =>
    'organizer_stage_wizard_v1_${managerUid}_$leagueId';

class LeagueStageCreateLocalStore {
  LeagueStageCreateLocalStore._(this._prefs);

  final SharedPreferences? _prefs;

  static Future<LeagueStageCreateLocalStore> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return LeagueStageCreateLocalStore._(prefs);
    } on PlatformException {
      return LeagueStageCreateLocalStore._(null);
    } catch (_) {
      return LeagueStageCreateLocalStore._(null);
    }
  }

  bool get hasPersistence => _prefs != null;

  Future<LeagueStageCreateSession?> load(
    String managerUid,
    String leagueId,
  ) async {
    final uid = managerUid.trim();
    final lid = leagueId.trim();
    if (uid.isEmpty || lid.isEmpty) return null;

    final prefs = _prefs;
    if (prefs == null) return null;

    try {
      final raw = prefs.getString(leagueStageCreateLocalStoreKey(uid, lid));
      if (raw == null || raw.isEmpty) return null;

      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return null;

      final session = LeagueStageCreateSession.fromJson(json);
      if (session == null || session.managerUid != uid) return null;
      if (session.draft.leagueId != lid) return null;

      return session;
    } catch (_) {
      return null;
    }
  }

  Future<void> save(LeagueStageCreateSession session) async {
    final prefs = _prefs;
    if (prefs == null) return;

    try {
      await prefs.setString(
        leagueStageCreateLocalStoreKey(
          session.managerUid,
          session.draft.leagueId,
        ),
        jsonEncode(session.toJson()),
      );
    } on PlatformException {
      // Canal indisponível.
    }
  }

  Future<String?> findAnyLeagueIdWithDraft(String managerUid) async {
    final uid = managerUid.trim();
    if (uid.isEmpty) return null;

    final prefs = _prefs;
    if (prefs == null) return null;

    final prefix = 'organizer_stage_wizard_v1_${uid}_';
    for (final key in prefs.getKeys()) {
      if (key.startsWith(prefix) && (prefs.getString(key) ?? '').isNotEmpty) {
        return key.substring(prefix.length);
      }
    }
    return null;
  }

  Future<void> clear(String managerUid, String leagueId) async {
    final uid = managerUid.trim();
    final lid = leagueId.trim();
    if (uid.isEmpty || lid.isEmpty) return;

    final prefs = _prefs;
    if (prefs == null) return;

    try {
      await prefs.remove(leagueStageCreateLocalStoreKey(uid, lid));
    } on PlatformException {
      // Canal indisponível.
    }
  }
}
