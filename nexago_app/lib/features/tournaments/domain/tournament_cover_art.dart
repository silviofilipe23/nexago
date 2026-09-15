/// Capa padrão do torneio quando o organizador não subiu nenhuma, indexada
/// pelo esporte gravado em `tournaments/{id}.sport`.
///
/// A chave é o código camelCase do `TournamentSport` — o MESMO que o wizard do
/// app e o do portal gravam. Não confundir com o `SportArtCatalog` do perfil do
/// atleta, que indexa por `VOLEI_PRAIA`/`BEACH_TENNIS`: são vocabulários
/// diferentes sobre as mesmas artes, e casar um pelo outro devolve nulo mudo.
///
/// `beachTennis` não está no enum do wizard, mas aparece em torneios legados e
/// no tipo do site — tem arte porque custa zero e o app já carrega o asset.
///
/// Esporte fora do mapa devolve nulo de propósito: quem consome cai no
/// gradiente, que segue sendo o último recurso.
abstract final class TournamentCoverArt {
  TournamentCoverArt._();

  static const Map<String, String> _bySport = {
    'beachvolleyball': 'assets/images/sports/volei_praia.webp',
    'indoorvolleyball': 'assets/images/sports/volei_quadra.webp',
    'footvolley': 'assets/images/sports/futevolei.webp',
    'beachtennis': 'assets/images/sports/beach_tennis.webp',
  };

  /// Caminho da arte, ou nulo quando o esporte não tem uma.
  static String? assetFor(String? sport) {
    final code = sport?.trim().toLowerCase();
    if (code == null || code.isEmpty) return null;
    return _bySport[code];
  }

  /// Esportes que hoje têm arte — usado em teste para travar o catálogo.
  static Iterable<String> get sportsWithArt => _bySport.keys;
}
