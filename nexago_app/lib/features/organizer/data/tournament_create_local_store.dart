import 'dart:convert';
import 'dart:io';

import 'package:flutter/services.dart';
import 'package:shared_preferences/shared_preferences.dart';

import '../domain/tournament_create/tournament_create_session.dart';

String tournamentCreateLocalStoreKey(String managerUid) =>
    'organizer_tournament_wizard_v1_$managerUid';

/// Persistência local do wizard (SharedPreferences).
class TournamentCreateLocalStore {
  TournamentCreateLocalStore._(this._prefs);

  final SharedPreferences? _prefs;

  static Future<TournamentCreateLocalStore> create() async {
    try {
      final prefs = await SharedPreferences.getInstance();
      return TournamentCreateLocalStore._(prefs);
    } on PlatformException {
      return TournamentCreateLocalStore._(null);
    } catch (_) {
      return TournamentCreateLocalStore._(null);
    }
  }

  bool get hasPersistence => _prefs != null;

  Future<TournamentCreateSession?> load(String managerUid) async {
    final uid = managerUid.trim();
    if (uid.isEmpty) return null;

    final prefs = _prefs;
    if (prefs == null) return null;

    try {
      final raw = prefs.getString(tournamentCreateLocalStoreKey(uid));
      if (raw == null || raw.isEmpty) return null;

      final json = jsonDecode(raw);
      if (json is! Map<String, dynamic>) return null;

      final session = TournamentCreateSession.fromJson(json);
      if (session == null || session.managerUid != uid) return null;

      return _sanitizeSession(session);
    } catch (_) {
      return null;
    }
  }

  Future<void> save(TournamentCreateSession session) async {
    final prefs = _prefs;
    if (prefs == null) return;

    try {
      await prefs.setString(
        tournamentCreateLocalStoreKey(session.managerUid),
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
      await prefs.remove(tournamentCreateLocalStoreKey(uid));
    } on PlatformException {
      // Canal indisponível.
    }
  }

  TournamentCreateSession _sanitizeSession(TournamentCreateSession session) {
    final draft = session.draft;
    var coverPath = draft.coverImagePath;
    if (coverPath != null && coverPath.isNotEmpty && !File(coverPath).existsSync()) {
      coverPath = null;
    }

    var pdfPath = draft.regulationPdfPath;
    if (pdfPath != null && pdfPath.isNotEmpty && !File(pdfPath).existsSync()) {
      pdfPath = null;
    }

    if (coverPath == draft.coverImagePath &&
        pdfPath == draft.regulationPdfPath) {
      return session;
    }

    return session.copyWith(
      draft: draft.copyWith(
        coverImagePath: coverPath,
        clearCoverImagePath: coverPath == null && draft.coverImagePath != null,
        regulationPdfPath: pdfPath,
        clearRegulationPdfPath: pdfPath == null && draft.regulationPdfPath != null,
      ),
    );
  }
}
