/// Arte de capa do perfil de EQUIPE, indexada por esporte + tamanho do elenco.
///
/// Irmã do `SportArtCatalog` (que tem um atleta só, para o perfil do atleta):
/// aqui a arte mostra o elenco inteiro, então a chave precisa do TAMANHO além
/// do esporte — uma dupla não pode receber a arte do quarteto.
///
/// A chave do esporte é o CÓDIGO do Firestore, não o rótulo: casar por texto
/// confunde praia com quadra e depende de acento.
abstract final class TeamCoverArtCatalog {
  TeamCoverArtCatalog._();

  /// Menor e maior elenco que o app conhece: dupla e quinteto.
  static const _minRoster = 2;
  static const _maxRoster = 5;

  /// `código do esporte → tamanho do elenco → asset`.
  ///
  /// A matriz é esparsa de propósito: só entram as combinações que existem na
  /// vida real (não há quinteto de tênis). O que falta cai na escada de
  /// [assetFor].
  static const Map<String, Map<int, String>> _byCodeAndRoster = {
    'BEACH_TENNIS': {
      2: 'assets/images/team_covers/beach_tennis_dupla.webp',
    },
    'VOLEI_PRAIA': {
      2: 'assets/images/team_covers/volei_praia_dupla.webp',
      3: 'assets/images/team_covers/volei_praia_trio.webp',
      4: 'assets/images/team_covers/volei_praia_quarteto.webp',
    },
    'FUTEVOLEI': {
      2: 'assets/images/team_covers/futevolei_dupla.webp',
    },
    'TENIS': {
      2: 'assets/images/team_covers/tenis_dupla.webp',
    },
  };

  /// Caminho da arte, ou nulo quando não há nenhuma servível.
  ///
  /// Sem arte para o tamanho exato, desce para o maior elenco disponível
  /// ABAIXO do pedido — quatro silhuetas ainda leem como equipe para um
  /// quinteto. Nunca sobe: dar a arte de quarteto a uma dupla faria a capa
  /// mentir sobre o tamanho do elenco, e aí o fundo pintado é menos pior.
  static String? assetFor({
    required String? firestoreCode,
    required int rosterSize,
  }) {
    final code = firestoreCode?.trim().toUpperCase();
    if (code == null || code.isEmpty) return null;
    final bySize = _byCodeAndRoster[code];
    if (bySize == null) return null;

    // Elenco incompleto (dupla à procura de parceiro chega com 1) usa a arte
    // do que a equipe vai ser; elenco maior que o catálogo para no quinteto.
    final size = rosterSize.clamp(_minRoster, _maxRoster);
    for (var candidate = size; candidate >= _minRoster; candidate--) {
      final asset = bySize[candidate];
      if (asset != null) return asset;
    }
    return null;
  }

  /// Códigos com alguma arte de equipe — usado em teste para travar o catálogo.
  static Iterable<String> get codesWithArt => _byCodeAndRoster.keys;

  /// Todos os assets declarados — usado em teste para pegar caminho morto.
  static Iterable<String> get declaredAssets =>
      _byCodeAndRoster.values.expand((bySize) => bySize.values);
}
