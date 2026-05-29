/// Time em `artifacts/{projectId}/public/data/teams`.
class TournamentTeam {
  const TournamentTeam({
    required this.id,
    required this.player1Id,
    required this.player2Id,
  });

  final String id;
  final String player1Id;
  final String player2Id;

  bool containsPlayer(String uid) {
    final id = uid.trim();
    if (id.isEmpty) return false;
    return player1Id == id || player2Id == id;
  }
}
