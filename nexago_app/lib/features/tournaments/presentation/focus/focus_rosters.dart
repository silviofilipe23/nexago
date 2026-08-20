import '../../domain/tournament_match_card_view_model.dart';

/// Nome e elenco de cada dupla, indexados por ID DE TIME.
///
/// Existe porque os cards vêm indexados por partida, e quase toda lista do
/// Focus precisa do contrário: dado um `teamId`, quem são os dois atletas.
/// Consultar o mapa de cards com um teamId devolve null em silêncio — foi
/// exatamente esse engano que fez todo adversário virar "A definir" uma vez.
class FocusRosters {
  const FocusRosters._(this._names, this._players);

  factory FocusRosters.fromCards(
    List<TournamentMatchCardViewModel> cards,
  ) {
    final names = <String, String>{};
    final players = <String, List<TournamentMatchCardPlayerViewModel>>{};

    for (final card in cards) {
      final a = card.match.teamAId;
      if (a.isNotEmpty) {
        names[a] = card.teamA.displayName;
        // Só sobrescreve com um elenco melhor: partidas em que o time ainda
        // era só uma descrição ("1º do Grupo A") trazem lista vazia, e elas
        // não podem apagar o elenco real vindo de outra partida.
        if (card.teamA.players.isNotEmpty || !players.containsKey(a)) {
          players[a] = card.teamA.players;
        }
      }
      final b = card.match.teamBId;
      if (b.isNotEmpty) {
        names[b] = card.teamB.displayName;
        if (card.teamB.players.isNotEmpty || !players.containsKey(b)) {
          players[b] = card.teamB.players;
        }
      }
    }

    return FocusRosters._(names, players);
  }

  final Map<String, String> _names;
  final Map<String, List<TournamentMatchCardPlayerViewModel>> _players;

  String nameOf(String teamId, [String? fallback]) =>
      _names[teamId] ?? fallback ?? 'A definir';

  List<TournamentMatchCardPlayerViewModel> playersOf(String teamId) =>
      _players[teamId] ?? const [];
}
