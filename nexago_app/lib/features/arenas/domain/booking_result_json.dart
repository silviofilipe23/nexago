import 'booking_result.dart';

/// Times e jogos do placar no formato dos rascunhos do aparelho (marcação ao
/// vivo e placar digitado). Não é o formato do Firestore.
Map<String, Object?> bookingResultToJson(BookingResult r) => {
      'teams': [
        for (final t in r.teams)
          {
            'id': t.id,
            'customName': t.customName,
            'players': [
              for (final p in t.players)
                {'id': p.id, 'name': p.name, 'avatarUrl': p.avatarUrl},
            ],
          },
      ],
      'games': [
        for (final g in r.games)
          {'a': g.teamA, 'b': g.teamB, 'sa': g.scoreA, 'sb': g.scoreB},
      ],
    };

/// Lê [bookingResultToJson]. Jogo de time que não existe é descartado.
BookingResult bookingResultFromJson(Map<Object?, Object?> raw) {
  int? id(Object? v) => v is int ? v : null;
  final teams = <ResultTeam>[];
  final rawTeams = raw['teams'];
  if (rawTeams is List) {
    for (final t in rawTeams) {
      if (t is! Map) continue;
      final teamId = id(t['id']);
      if (teamId == null) continue;
      final custom = t['customName'];
      teams.add(
        ResultTeam(
          id: teamId,
          players: _players(t['players']),
          customName: custom is String ? custom : null,
        ),
      );
    }
  }
  final known = {for (final t in teams) t.id};
  final games = <ResultGame>[];
  final rawGames = raw['games'];
  if (rawGames is List) {
    for (final g in rawGames) {
      if (g is! Map) continue;
      final a = id(g['a']);
      final b = id(g['b']);
      if (a == null || b == null || !known.contains(a) || !known.contains(b)) {
        continue;
      }
      games.add(
        ResultGame(
          teamA: a,
          teamB: b,
          scoreA: id(g['sa']) ?? 0,
          scoreB: id(g['sb']) ?? 0,
        ),
      );
    }
  }
  return BookingResult(teams: teams, games: games);
}

List<ResultPlayer> _players(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final p in raw)
      if (p is Map && p['id'] is String && p['name'] is String)
        ResultPlayer(
          id: p['id'] as String,
          name: p['name'] as String,
          avatarUrl: p['avatarUrl'] is String ? p['avatarUrl'] as String : null,
        ),
  ];
}
