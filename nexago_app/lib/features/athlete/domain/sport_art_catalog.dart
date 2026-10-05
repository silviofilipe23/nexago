import '../../../core/sports/sport_catalog.dart';

/// Arte de fundo por esporte, pelo catálogo (`sports/catalog.json`, campo
/// `art`). Aceita qualquer grafia que o catálogo conheça; o uso principal é o
/// código canônico do Firestore (`VOLEI_PRAIA`).
///
/// `OUTROS` nunca terá arte, porque não é um esporte específico — quem consome
/// precisa aceitar nulo e cair num fundo sólido.
abstract final class SportArtCatalog {
  SportArtCatalog._();

  /// Caminho da arte, ou nulo quando o esporte não tem uma.
  static String? assetFor(String? firestoreCode) {
    final art = SportCatalog.artOf(firestoreCode);
    return art == null ? null : 'assets/images/sports/$art.webp';
  }

  /// Códigos que hoje têm arte — usado em teste para travar o catálogo.
  static Iterable<String> get codesWithArt =>
      kSportCatalog.where((e) => e.art != null).map((e) => e.profileCode);
}
