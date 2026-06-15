import 'package:cloud_firestore/cloud_firestore.dart';

import '../domain/league_ranking_logic.dart';
import '../domain/league_ranking_models.dart';
import '../domain/tournament_discovery_models.dart';

abstract final class LeagueDocumentMapper {
  LeagueDocumentMapper._();

  static DiscoveryLeague? fromSnapshot(DocumentSnapshot<Map<String, dynamic>> doc) {
    if (!doc.exists) return null;
    final data = doc.data();
    if (data == null) return null;
    return fromMap(doc.id, data);
  }

  static DiscoveryLeague fromMap(String id, Map<String, dynamic> data) {
    final stagesRaw = data['stages'];
    final stages = <DiscoveryLeagueStage>[];
    if (stagesRaw is List) {
      for (final item in stagesRaw) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        final stageId = _str(map['id']) ?? 'stage-${stages.length}';
        final idsRaw = map['tournamentIds'];
        final ids = <String>[];
        if (idsRaw is List) {
          for (final e in idsRaw) {
            if (e is String && e.isNotEmpty) ids.add(e);
          }
        }
        stages.add(
          DiscoveryLeagueStage(
            id: stageId,
            name: _str(map['name']) ?? 'Etapa',
            order: _int(map['order']) ?? stages.length + 1,
            dateLabel: _str(map['dateLabel']),
            tournamentIds: ids,
          ),
        );
      }
    }
    stages.sort((a, b) => a.order.compareTo(b.order));

    final categories = <DiscoveryLeagueCategory>[];
    final categoriesRaw = data['categories'];
    if (categoriesRaw is List) {
      for (final item in categoriesRaw) {
        if (item is! Map) continue;
        final map = Map<String, dynamic>.from(item);
        final categoryId = _str(map['id']) ?? _str(map['name']);
        final categoryName = _str(map['name']) ?? categoryId;
        if (categoryId == null || categoryName == null) continue;
        categories.add(
          DiscoveryLeagueCategory(id: categoryId, name: categoryName),
        );
      }
    }

    return DiscoveryLeague(
      id: id,
      name: _str(data['name']) ?? 'Liga',
      seasonLabel: _str(data['seasonLabel'] ?? data['season']),
      city: _str(data['city']),
      stages: stages,
      coverUrl: _str(data['coverUrl'] ?? data['imageUrl']),
      listingStatus: _str(data['listingStatus'] ?? data['status']),
      seasonStartAt: _timestamp(data['seasonStartAt']),
      seasonEndAt: _timestamp(data['seasonEndAt']),
      categories: categories,
      countingStagesMode: parseLeagueCountingMode(
        data['countingStagesMode'] as String?,
      ),
    );
  }

  static String? _str(dynamic v) {
    if (v is String && v.trim().isNotEmpty) return v.trim();
    return null;
  }

  static int? _int(dynamic v) {
    if (v is int) return v;
    if (v is num) return v.toInt();
    return null;
  }

  static DateTime? _timestamp(dynamic raw) {
    if (raw is Timestamp) return raw.toDate();
    if (raw is DateTime) return raw;
    return null;
  }
}
