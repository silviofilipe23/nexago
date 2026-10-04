/// Perfil de placar (spec multiesporte, eixo 2). Só tipos e construtores
/// `const`: o catálogo gerado instancia daqui e o núcleo de regras lê.
enum DecidingSet { full, superTiebreak }

sealed class ScoringProfile {
  const ScoringProfile({required this.bestOf});

  final int bestOf;
}

final class SetsPointsProfile extends ScoringProfile {
  const SetsPointsProfile({
    required super.bestOf,
    required this.setTarget,
    required this.decidingSetTarget,
    required this.winBy,
    required this.pointCap,
  });

  final int setTarget;

  /// Alvo do set decisivo (o último possível); ignorado em MD1.
  final int decidingSetTarget;
  final int winBy;

  /// Teto: quem chega nele vence o set mesmo sem a vantagem.
  final int? pointCap;
}

final class SetsGamesProfile extends ScoringProfile {
  const SetsGamesProfile({
    required super.bestOf,
    required this.gamesPerSet,
    required this.winByGames,
    required this.tiebreakAtGames,
    required this.tiebreakTo,
    required this.noAd,
    required this.decidingSet,
    required this.superTiebreakTo,
  });

  final int gamesPerSet;
  final int winByGames;

  /// Placar de games em que o set vai a tie-break. `null` = set de vantagem.
  final int? tiebreakAtGames;
  final int tiebreakTo;
  final bool noAd;
  final DecidingSet decidingSet;
  final int superTiebreakTo;
}
