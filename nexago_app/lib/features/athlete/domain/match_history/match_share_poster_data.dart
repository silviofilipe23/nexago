/// Modelo do pôster de compartilhamento da partida.
///
/// Espelho de `ShareCardData`
/// (`frontend/projects/athlete/src/app/tournaments/match/match-share-card.ts`):
/// app e portal do atleta desenham a mesma arte, então os dois partem
/// exatamente dos mesmos campos. Mudou lá, muda aqui.
library;

/// Lado da partida — `'A' | 'B'` no web.
enum MatchSharePosterSide { teamA, teamB }

/// Paleta do pôster. Final e 3º lugar têm metal próprio; o resto é o laranja
/// da marca.
enum MatchSharePosterStage { finalMatch, thirdPlace, game }

/// Um atleta da dupla: a foto quando existe, senão a inicial.
class MatchSharePosterPlayer {
  const MatchSharePosterPlayer({required this.initial, this.photoUrl});

  final String initial;
  final String? photoUrl;
}

/// Dupla: nome exibido e os dois atletas, na ordem player1/player2.
///
/// [players] tem sempre dois itens — o pôster desenha duas fotos sobrepostas,
/// e sem perfil resolvido o atleta entra como inicial "—".
class MatchSharePosterTeam {
  const MatchSharePosterTeam({required this.name, required this.players});

  final String name;
  final List<MatchSharePosterPlayer> players;
}

/// Set fechado, na perspectiva neutra da partida (A × B).
class MatchSharePosterSet {
  const MatchSharePosterSet({required this.a, required this.b});

  final int a;
  final int b;
}

class MatchSharePosterData {
  const MatchSharePosterData({
    required this.tournamentName,
    required this.phaseLabel,
    required this.categoryName,
    required this.stage,
    required this.live,
    required this.finished,
    required this.teamA,
    required this.teamB,
    required this.winner,
    required this.sets,
    required this.setWinsA,
    required this.setWinsB,
    required this.liveLine,
    required this.formatLine,
    required this.dateLine,
  });

  final String? tournamentName;

  /// "Semifinal" / "Grupo A · rodada 2" — vira o selo quando a fase não tem
  /// paleta própria.
  final String phaseLabel;
  final String? categoryName;
  final MatchSharePosterStage stage;
  final bool live;
  final bool finished;
  final MatchSharePosterTeam teamA;
  final MatchSharePosterTeam teamB;
  final MatchSharePosterSide? winner;

  /// Sets já fechados.
  final List<MatchSharePosterSet> sets;
  final int setWinsA;
  final int setWinsB;

  /// "1–0 · 2º set 14-11" — só ao vivo.
  final String? liveLine;

  /// "MELHOR DE 3" / "SET ÚNICO".
  final String formatLine;

  /// "Sáb 02/08 · 17:30 · Quadra 1" — rodapé.
  final String? dateLine;

  /// URLs de foto a resolver antes de pintar (o painter é síncrono).
  List<String> get photoUrls {
    final urls = <String>{};
    for (final team in [teamA, teamB]) {
      for (final player in team.players) {
        final url = player.photoUrl?.trim() ?? '';
        if (url.isNotEmpty) urls.add(url);
      }
    }
    return urls.toList(growable: false);
  }
}
