/// Opções de esporte e nível para o perfil do atleta (UI + Firestore como string).
abstract final class AthleteProfileOptions {
  AthleteProfileOptions._();

  static const List<String> sports = [
    'Vôlei de praia',
    'Vôlei de quadra',
    'Futebol',
    'Basquete',
    'Tênis',
    'Beach tennis',
    'Corrida',
    'Outros',
  ];

  static const List<String> levels = [
    'Iniciante',
    'Intermediário',
    'Open',
    // 'Pro',
  ];

  static const List<String> genders = ['Masculino', 'Feminino'];

  /// Normaliza níveis legados do Firestore.
  static String normalizeLevel(String? raw) {
    final v = raw?.trim() ?? '';
    if (v.isEmpty) return '';
    const legacy = <String, String>{
      'Open / federado': 'Open',
      'Básico': 'Iniciante',
      // 'Avançado': 'Pro',
    };
    if (legacy.containsKey(v)) return legacy[v]!;
    for (final level in levels) {
      if (level == v) return v;
    }
    return v;
  }

  /// Rank do nível (Iniciante 0 < Intermediário 1 < Open 2) a partir de label
  /// (`Open`) ou código Firestore (`open`); legados inclusos. `null` quando
  /// ausente/desconhecido.
  static int? levelRank(String? raw) {
    final normalized = normalizeLevel(raw);
    if (normalized.isEmpty) return null;
    final idx = levels.indexOf(normalized);
    if (idx >= 0) return idx;
    // Fallback por código bruto (ex.: vindo do Firestore sem normalizar label).
    switch (raw?.trim().toLowerCase()) {
      case 'iniciante':
      case 'basico':
      case 'básico':
        return 0;
      case 'intermediario':
      case 'intermediário':
        return 1;
      case 'open':
      case 'livre':
        return 2;
    }
    return null;
  }

  /// Normaliza esporte legado (ex.: Futevôlei, Beach tênis).
  static String normalizeSport(String? raw) {
    final v = raw?.trim() ?? '';
    if (v.isEmpty) return '';
    const legacy = <String, String>{
      'Futevôlei': 'Futebol',
      'Beach tênis': 'Beach tennis',
      'Outro': 'Outros',
    };
    if (legacy.containsKey(v)) return legacy[v]!;
    for (final sport in sports) {
      if (sport == v) return v;
    }
    return v;
  }
}
