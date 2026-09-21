/// Arte de fundo por esporte, indexada pelo código canônico do Firestore.
///
/// A chave é o CÓDIGO, não o rótulo: casar por texto (`contains('vôlei')`)
/// confunde praia com quadra, e depende de acento.
///
/// Oito dos nove esportes do app têm arte. Falta só `OUTROS`, que nunca terá,
/// porque não é um esporte específico — quem consome precisa aceitar nulo e
/// cair num fundo sólido.
abstract final class SportArtCatalog {
  SportArtCatalog._();

  static const Map<String, String> _byCode = {
    'VOLEI_PRAIA': 'assets/images/sports/volei_praia.webp',
    'VOLEI_QUADRA': 'assets/images/sports/volei_quadra.webp',
    'FUTEBOL': 'assets/images/sports/futebol.webp',
    'BASQUETE': 'assets/images/sports/basquete.webp',
    'TENIS': 'assets/images/sports/tenis.webp',
    'BEACH_TENNIS': 'assets/images/sports/beach_tennis.webp',
    'FUTEVOLEI': 'assets/images/sports/futevolei.webp',
    'CORRIDA': 'assets/images/sports/corrida.webp',
  };

  /// Caminho da arte, ou nulo quando o esporte não tem uma.
  static String? assetFor(String? firestoreCode) {
    final code = firestoreCode?.trim().toUpperCase();
    if (code == null || code.isEmpty) return null;
    return _byCode[code];
  }

  /// Códigos que hoje têm arte — usado em teste para travar o catálogo.
  static Iterable<String> get codesWithArt => _byCode.keys;
}
