import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/league_ranking_logic.dart';
import '../domain/league_ranking_models.dart';
import 'nexago_artifacts_paths.dart';

class LeagueRankingsRepository {
  LeagueRankingsRepository(this._firestore);

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _teamCollection =>
      _firestore.collection(NexagoArtifactsPaths.leagueTeamRankingsCollection());

  CollectionReference<Map<String, dynamic>> get _athleteCollection =>
      _firestore.collection(NexagoArtifactsPaths.leagueAthleteRankingsCollection());

  Stream<List<LeagueTeamRankingEntry>> watchTeamsByLeague(
    String leagueId, {
    LeaguePointsCountingMode fallbackMode = LeaguePointsCountingMode.best4Of6,
  }) {
    return _watchByLeague(
      leagueId: leagueId,
      collection: _teamCollection,
      fallbackMode: fallbackMode,
      parse: _teamFromSnapshot,
    );
  }

  Stream<List<LeagueAthleteRankingEntry>> watchAthletesByLeague(
    String leagueId, {
    LeaguePointsCountingMode fallbackMode = LeaguePointsCountingMode.best4Of6,
  }) {
    return _watchByLeague(
      leagueId: leagueId,
      collection: _athleteCollection,
      fallbackMode: fallbackMode,
      parse: _athleteFromSnapshot,
    );
  }

  Stream<List<T>> _watchByLeague<T>({
    required String leagueId,
    required CollectionReference<Map<String, dynamic>> collection,
    required LeaguePointsCountingMode fallbackMode,
    required T? Function(
      QueryDocumentSnapshot<Map<String, dynamic>> doc,
      LeaguePointsCountingMode fallbackMode,
    ) parse,
  }) {
    final id = leagueId.trim();
    if (id.isEmpty) return Stream<List<T>>.value([]);

    return collection.where('leagueId', isEqualTo: id).snapshots().map((snap) {
      return snap.docs
          .map((doc) => parse(doc, fallbackMode))
          .whereType<T>()
          .toList();
    });
  }

  LeagueTeamRankingEntry? _teamFromSnapshot(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    LeaguePointsCountingMode fallbackMode,
  ) {
    final parsed = _parseRankingSnapshot(doc, fallbackMode);
    if (parsed == null) return null;
    final teamId = _str(doc.data()['teamId']);
    if (teamId == null) return null;
    return LeagueTeamRankingEntry(
      id: doc.id,
      leagueId: parsed.leagueId,
      categoryId: parsed.categoryId,
      teamId: teamId,
      stageResults: parsed.stageResults,
      effectivePoints: parsed.effectivePoints,
      rawPoints: parsed.rawPoints,
      countingMode: parsed.countingMode,
    );
  }

  LeagueAthleteRankingEntry? _athleteFromSnapshot(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    LeaguePointsCountingMode fallbackMode,
  ) {
    final parsed = _parseRankingSnapshot(doc, fallbackMode);
    if (parsed == null) return null;
    final athleteId = _str(doc.data()['athleteId']);
    if (athleteId == null) return null;
    return LeagueAthleteRankingEntry(
      id: doc.id,
      leagueId: parsed.leagueId,
      categoryId: parsed.categoryId,
      athleteId: athleteId,
      stageResults: parsed.stageResults,
      effectivePoints: parsed.effectivePoints,
      rawPoints: parsed.rawPoints,
      countingMode: parsed.countingMode,
    );
  }

  ({
    String leagueId,
    String categoryId,
    List<LeagueStageResult> stageResults,
    int effectivePoints,
    int rawPoints,
    LeaguePointsCountingMode countingMode,
  })? _parseRankingSnapshot(
    QueryDocumentSnapshot<Map<String, dynamic>> doc,
    LeaguePointsCountingMode fallbackMode,
  ) {
    final data = doc.data();
    final leagueId = _str(data['leagueId']);
    final categoryId = _str(data['categoryId']);
    if (leagueId == null || categoryId == null) return null;

    final stageResults = _parseStageResults(data['stageResults']);
    final countingMode = data['countingStagesMode'] is String
        ? parseLeagueCountingMode(data['countingStagesMode'] as String)
        : fallbackMode;

    final rawPoints = _int(data['rawPoints']) ??
        stageResults.fold<int>(0, (sum, row) => sum + row.points);
    final effectivePoints = _int(data['effectivePoints']) ??
        _int(data['totalPoints']) ??
        effectivePointsForMode(stageResults, countingMode);

    return (
      leagueId: leagueId,
      categoryId: categoryId,
      stageResults: stageResults,
      effectivePoints: effectivePoints,
      rawPoints: rawPoints,
      countingMode: countingMode,
    );
  }

  static List<LeagueStageResult> _parseStageResults(dynamic raw) {
    if (raw is! List) return const [];
    final results = <LeagueStageResult>[];
    for (final item in raw) {
      if (item is! Map) continue;
      final map = Map<String, dynamic>.from(item);
      final tournamentId = _str(map['tournamentId']);
      if (tournamentId == null) continue;
      results.add(
        LeagueStageResult(
          tournamentId: tournamentId,
          place: _int(map['place']) ?? 0,
          points: _int(map['points']) ?? 0,
          stageOrder: _int(map['stageOrder']) ?? 0,
          placementBucket: _str(map['placementBucket']),
        ),
      );
    }
    return results;
  }

  static String? _str(dynamic value) {
    if (value is String && value.trim().isNotEmpty) return value.trim();
    return null;
  }

  static int? _int(dynamic value) {
    if (value is int) return value;
    if (value is num) return value.toInt();
    return null;
  }
}
