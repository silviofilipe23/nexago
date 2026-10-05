import '../../../core/sports/sport_catalog.dart';

/// Capa padrão do torneio quando o organizador não subiu nenhuma, pela arte
/// do esporte no catálogo (`sports/catalog.json`, campo `art`).
///
/// Aceita qualquer grafia que o catálogo conheça (`beachVolleyball`,
/// `beach_tennis`, `VOLEI_PRAIA`). O codegen recusa arte sem o arquivo em
/// `assets/images/sports/`, então o caminho sempre existe.
///
/// Esporte sem arte (ou desconhecido) devolve nulo de propósito: quem consome
/// cai no gradiente, que segue sendo o último recurso.
abstract final class TournamentCoverArt {
  TournamentCoverArt._();

  /// Caminho da arte, ou nulo quando o esporte não tem uma.
  static String? assetFor(String? sport) {
    final art = SportCatalog.artOf(sport);
    return art == null ? null : 'assets/images/sports/$art.webp';
  }

  /// Esportes que hoje têm arte — usado em teste para travar o catálogo.
  static Iterable<String> get sportsWithArt =>
      kSportCatalog.where((e) => e.art != null).map((e) => e.code);
}
