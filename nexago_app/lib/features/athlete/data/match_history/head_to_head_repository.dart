import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

/// Uma partida recente entre os dois atletas de um confronto direto.
class HeadToHeadRecentMatch {
  const HeadToHeadRecentMatch({
    required this.matchId,
    required this.tournamentId,
    this.tournamentName,
    this.playedAt,
    required this.scoreLabel,
    required this.athleteAWon,
  });

  final String matchId;
  final String tournamentId;
  final String? tournamentName;
  final DateTime? playedAt;
  final String scoreLabel;

  /// `true` se o atleta A (o primeiro id passado a [HeadToHeadRepository.fetchRecord])
  /// venceu essa partida.
  final bool athleteAWon;
}

/// Placar agregado de confronto direto entre dois atletas específicos
/// (contagem por atleta, mesmo em partidas de dupla — não é H2H de dupla).
class HeadToHeadRecord {
  const HeadToHeadRecord({
    required this.wins,
    required this.losses,
    required this.recentMatches,
  });

  static const empty = HeadToHeadRecord(wins: 0, losses: 0, recentMatches: []);

  final int wins;
  final int losses;
  final List<HeadToHeadRecentMatch> recentMatches;

  int get totalMatches => wins + losses;
  bool get hasHistory => totalMatches > 0;
}

abstract class HeadToHeadDataSource {
  Future<HeadToHeadRecord> fetchRecord({
    required String athleteIdA,
    required String athleteIdB,
    String? sportCode,
  });
}

/// Chama a callable `getHeadToHeadRecord` (`functions/src/head-to-head.ts`).
class FirebaseFunctionsHeadToHeadDataSource implements HeadToHeadDataSource {
  FirebaseFunctionsHeadToHeadDataSource({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  @override
  Future<HeadToHeadRecord> fetchRecord({
    required String athleteIdA,
    required String athleteIdB,
    String? sportCode,
  }) async {
    final a = athleteIdA.trim();
    final b = athleteIdB.trim();
    if (a.isEmpty || b.isEmpty || a == b) return HeadToHeadRecord.empty;

    final callable = _functions.httpsCallable('getHeadToHeadRecord');
    final result = await callable.call<Map<String, dynamic>>({
      'athleteIdA': a,
      'athleteIdB': b,
      if (sportCode != null && sportCode.trim().isNotEmpty)
        'sportCode': sportCode.trim(),
    });
    return _fromResponse(result.data);
  }

  HeadToHeadRecord _fromResponse(Map<dynamic, dynamic>? data) {
    if (data == null) return HeadToHeadRecord.empty;
    final wins = (data['wins'] as num?)?.toInt() ?? 0;
    final losses = (data['losses'] as num?)?.toInt() ?? 0;
    final rawRecent = data['recentMatches'];
    final recentMatches = <HeadToHeadRecentMatch>[];
    if (rawRecent is List) {
      for (final entry in rawRecent) {
        if (entry is! Map) continue;
        final map = Map<String, dynamic>.from(entry);
        recentMatches.add(
          HeadToHeadRecentMatch(
            matchId: (map['matchId'] as String?)?.trim() ?? '',
            tournamentId: (map['tournamentId'] as String?)?.trim() ?? '',
            tournamentName: (map['tournamentName'] as String?)?.trim(),
            playedAt: _parseMillis(map['playedAt']),
            scoreLabel: (map['scoreLabel'] as String?)?.trim() ?? '-',
            athleteAWon: map['athleteAWon'] == true,
          ),
        );
      }
    }
    return HeadToHeadRecord(
      wins: wins,
      losses: losses,
      recentMatches: recentMatches,
    );
  }

  DateTime? _parseMillis(dynamic value) {
    if (value is num) {
      return DateTime.fromMillisecondsSinceEpoch(value.toInt());
    }
    return null;
  }
}

final headToHeadRepositoryProvider = Provider<HeadToHeadRepository>((ref) {
  return HeadToHeadRepository(
    dataSource: FirebaseFunctionsHeadToHeadDataSource(),
  );
});

class HeadToHeadRepository {
  HeadToHeadRepository({required HeadToHeadDataSource dataSource})
      : _dataSource = dataSource;

  final HeadToHeadDataSource _dataSource;

  Future<HeadToHeadRecord> fetchRecord({
    required String athleteIdA,
    required String athleteIdB,
    String? sportCode,
  }) {
    return _dataSource.fetchRecord(
      athleteIdA: athleteIdA,
      athleteIdB: athleteIdB,
      sportCode: sportCode,
    );
  }
}

/// Chave de cache do [headToHeadRecordProvider] — par de atletas (+ esporte
/// opcional). `athleteIdA` é sempre "eu" na tela de detalhe da partida.
class HeadToHeadQuery {
  const HeadToHeadQuery({
    required this.athleteIdA,
    required this.athleteIdB,
    this.sportCode,
  });

  final String athleteIdA;
  final String athleteIdB;
  final String? sportCode;

  @override
  bool operator ==(Object other) {
    return other is HeadToHeadQuery &&
        other.athleteIdA == athleteIdA &&
        other.athleteIdB == athleteIdB &&
        other.sportCode == sportCode;
  }

  @override
  int get hashCode => Object.hash(athleteIdA, athleteIdB, sportCode);
}

final headToHeadRecordProvider = FutureProvider.autoDispose
    .family<HeadToHeadRecord, HeadToHeadQuery>((ref, query) {
  final a = query.athleteIdA.trim();
  final b = query.athleteIdB.trim();
  if (a.isEmpty || b.isEmpty || a == b) {
    return Future.value(HeadToHeadRecord.empty);
  }
  final repo = ref.watch(headToHeadRepositoryProvider);
  return repo.fetchRecord(
    athleteIdA: a,
    athleteIdB: b,
    sportCode: query.sportCode,
  );
});
