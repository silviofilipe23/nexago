import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import '../domain/match_ops/match_ops_logic.dart';
import '../domain/match_ops/match_ops_models.dart';
import '../../tournaments/data/nexago_artifacts_paths.dart';

class OrganizerMatchOpsRepository {
  OrganizerMatchOpsRepository();

  FirebaseFirestore get _firestore => FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _tournaments =>
      _firestore.collection('tournaments');

  Stream<TournamentMatchOpsConfig> watchMatchOpsConfig(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const TournamentMatchOpsConfig());
    return _tournaments.doc(id).snapshots().map((snap) {
      if (!snap.exists) return const TournamentMatchOpsConfig();
      final data = snap.data();
      final raw = data?['matchOps'];
      if (raw is Map) {
        return TournamentMatchOpsConfig.fromMap(
          Map<String, dynamic>.from(raw),
        );
      }
      return const TournamentMatchOpsConfig();
    });
  }

  Stream<List<TournamentCourt>> watchCourts(String tournamentId) {
    final id = tournamentId.trim();
    if (id.isEmpty) return Stream.value(const []);
    return _tournaments.doc(id).snapshots().map((snap) {
      if (!snap.exists) return const <TournamentCourt>[];
      final data = snap.data();
      final courtsRaw = data?['courts'];
      if (courtsRaw is List && courtsRaw.isNotEmpty) {
        return courtsRaw
            .whereType<Map>()
            .map((e) => TournamentCourt.fromMap(Map<String, dynamic>.from(e)))
            .where((c) => c.id.isNotEmpty)
            .toList()
          ..sort((a, b) => a.order.compareTo(b.order));
      }
      final count = (data?['courtsCount'] as num?)?.toInt() ?? 2;
      return MatchOpsLogic.defaultCourtsFromCount(count);
    });
  }

  Future<void> ensureCourtsInitialized({
    required String tournamentId,
    int courtsCount = 2,
  }) async {
    final id = tournamentId.trim();
    if (id.isEmpty) return;
    final snap = await _tournaments.doc(id).get();
    if (!snap.exists) return;
    final data = snap.data();
    final courtsRaw = data?['courts'];
    if (courtsRaw is List && courtsRaw.isNotEmpty) return;

    final courts = MatchOpsLogic.defaultCourtsFromCount(courtsCount);
    await _tournaments.doc(id).set(
      {
        'courts': courts.map((c) => c.toMap()).toList(),
        'matchOps': const TournamentMatchOpsConfig().toMap(),
        'updatedAt': FieldValue.serverTimestamp(),
      },
      SetOptions(merge: true),
    );
  }

  Stream<List<MatchAuditLogEntry>> watchAuditLog(String matchId) {
    final id = matchId.trim();
    if (id.isEmpty) return Stream.value(const []);

    return _firestore
        .collection(NexagoArtifactsPaths.matchAuditLogCollection(id))
        .orderBy('at', descending: true)
        .snapshots()
        .map((snap) {
      return snap.docs.map((doc) {
        final data = doc.data();
        return MatchAuditLogEntry(
          id: doc.id,
          type: (data['type'] as String?)?.trim() ?? '',
          at: _ts(data['at']) ?? DateTime.now(),
          byUid: (data['byUid'] as String?)?.trim() ?? '',
          byRole: (data['byRole'] as String?)?.trim() ?? '',
          meta: data['meta'] is Map
              ? Map<String, dynamic>.from(data['meta'] as Map)
              : const {},
        );
      }).toList();
    });
  }

  Future<void> appendAuditLog({
    required String matchId,
    required String type,
    Map<String, dynamic>? meta,
    String byRole = 'manager',
  }) async {
    final uid = FirebaseAuth.instance.currentUser?.uid ?? '';
    final id = matchId.trim();
    if (id.isEmpty || uid.isEmpty) return;

    await _firestore
        .collection(NexagoArtifactsPaths.matchAuditLogCollection(id))
        .add({
      'type': type,
      'at': FieldValue.serverTimestamp(),
      'byUid': uid,
      'byRole': byRole,
      if (meta != null) 'meta': meta,
    });
  }

  DateTime? _ts(dynamic v) {
    if (v is Timestamp) return v.toDate();
    if (v is DateTime) return v;
    return null;
  }
}
