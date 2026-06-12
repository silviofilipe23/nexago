/// Categorias de produto da cantina/bar da arena.
enum ArenaProductCategory { bebidas, alimentacao, equipamentos, servicos }

extension ArenaProductCategoryX on ArenaProductCategory {
  String get firestoreValue => name;

  String get label => switch (this) {
    ArenaProductCategory.bebidas => 'Bebidas',
    ArenaProductCategory.alimentacao => 'Alimentação',
    ArenaProductCategory.equipamentos => 'Equipamentos',
    ArenaProductCategory.servicos => 'Serviços',
  };

  /// Chip curto na lista (mockup: Alimentação, Equipamentos).
  String get filterChipLabel => switch (this) {
    ArenaProductCategory.bebidas => 'Bebidas',
    ArenaProductCategory.alimentacao => 'Alimentação',
    ArenaProductCategory.equipamentos => 'Equipamentos',
    ArenaProductCategory.servicos => 'Serviços',
  };

  static ArenaProductCategory fromFirestore(String? raw) {
    final value = raw?.trim();
    if (value == null || value.isEmpty) return ArenaProductCategory.bebidas;
    for (final c in ArenaProductCategory.values) {
      if (c.name == value) return c;
    }
    return ArenaProductCategory.bebidas;
  }
}
