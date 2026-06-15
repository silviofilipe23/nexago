import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/league_create/league_create_session.dart';

String leagueCreateLocalStoreKey(String managerUid) =>
    'organizer_league_wizard_v1_$managerUid';

/// Persistência local do wizard de liga (SharedPreferences).
class LeagueCreateLocalStore {
  LeagueCreateLocalStore._(this._prefs);

  final SharedPreferences? _prefs;

  static Future<LeagueCreateLocalStore> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return LeagueCreateLocalStore._(prefs);
    } on PlatformException {
      return LeagueCreateLocalStore._(null);
    } catch (_) {
      return LeagueCreateLocalStore._(null);
    }
  }

  bool get hasPersistence => _prefs != null;

  Future<LeagueCreateSession?> load(String managerUid) async {
    final uid = managerUid.trim();
    if (uid.isEmpty) return null;

    final prefs = _prefs;
    if (prefs == null) return null;

    try {
      final raw = prefs.getString(leagueCreateLocalStoreKey(uid));
      if (raw == null || raw.isEmpty) return null;

      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return null;

      final session = LeagueCreateSession.fromJson(json);
      if (session == null || session.managerUid != uid) return null;

      return _sanitizeSession(session);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(LeagueCreateSession session) async {
    final prefs = _prefs;
    if (prefs == null) return;

    try {
      await prefs.setString(
        leagueCreateLocalStoreKey(session.managerUid),
        jsonEncode(session.toJson()),
      );
    } on PlatformException {
      // Canal indisponível (hot restart, build sem plugin nativo).
    }
  }

  Future<void> clear(String managerUid) async {
    final uid = managerUid.trim();
    if (uid.isEmpty) return;

    final prefs = _prefs;
    if (prefs == null) return;

    try {
      await prefs.remove(leagueCreateLocalStoreKey(uid));
    } on PlatformException {
      // Canal indisponível.
    }
  }

  LeagueCreateSession _sanitizeSession(LeagueCreateSession session) {
    final draft = session.draft;
    var coverPath = draft.coverImagePath;
    if (coverPath != null &&
        coverPath.isNotEmpty &&
        !File(coverPath).existsSync()) {
      coverPath = null;
    }

    if (coverPath == draft.coverImagePath) return session;

    return session.copyWith(
      draft: draft.copyWith(
        coverImagePath: coverPath,
        clearCoverImagePath: coverPath == null && draft.coverImagePath != null,
      ),
    );
  }
}
