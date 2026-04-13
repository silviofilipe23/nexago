/// Tag única para [Hero] entre lista e detalhe (mesma arena).
abstract final class ArenaHeroTags {
  ArenaHeroTags._();

  /// Imagem principal do card → primeiro slide do carrossel no detalhe.
  static String coverImage(String arenaId) => 'arena-hero-cover-$arenaId';
}
