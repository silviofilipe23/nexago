/// Opções de esporte e nível para o perfil do atleta (UI + Firestore como string).
abstract final class AthleteProfileOptions {
  AthleteProfileOptions._();

  static const List<String> sports = [
    'Vôlei de praia',
    'Vôlei de quadra',
    'Futevôlei',
    'Futebol',
    'Basquete',
    'Tênis',
    'Beach tennis',
    'Corrida',
    'Outros',
  ];

  /// Escada única de 5 níveis, a mesma para TODOS os esportes — espelho de
  /// `LEVEL_CODES` em `functions/src/category-level-eligibility.ts`.
  static const List<String> levels = [
    'Iniciante 1',
    'Iniciante 2',
    'Intermediário 1',
    'Intermediário 2',
    'Open',
  ];

  static const List<String> genders = ['Masculino', 'Feminino'];

  /// Normaliza níveis legados do Firestore.
  static String normalizeLevel(String? raw) {
    final v = raw?.trim() ?? '';
    if (v.isEmpty) return '';
    const legacy = <String, String>{
      'Open / federado': 'Open',
      'Básico': 'Iniciante 1',
      'Avançado': 'Intermediário 1',
    };
    if (legacy.containsKey(v)) return legacy[v]!;
    return v;
  }

  /// Rank unificado do nível a partir de label (`Intermediário 1`) ou código
  /// Firestore (`intermediario_1`); legados inclusos. `null` quando ausente/
  /// desconhecido.
  ///
  /// Espelho de `LEVEL_RANK` de `functions/src/category-level-eligibility.ts`:
  /// Iniciante 1 (0) < Iniciante 2 (1) < Intermediário 1 (2) <
  /// Intermediário 2 (3) < Open (5) — rank 4 sem uso; a numeração é fixa
  /// (gravada em `athleteRatings.levelRank` e nas rules). Legados se
  /// comportam como o degrau inferior do split: `iniciante`→0,
  /// `intermediario`→2, `open`→5.
  static int? levelRank(String? raw) {
    final normalized = normalizeLevel(raw)
        .toLowerCase()
        .replaceAll('á', 'a')
        .replaceAll('é', 'e')
        .replaceAll('í', 'i');
    if (normalized.isEmpty) return null;
    switch (normalized) {
      case 'iniciante':
      case 'basico':
      case 'iniciante 1':
      case 'iniciante_1':
        return 0;
      case 'iniciante 2':
      case 'iniciante_2':
        return 1;
      case 'intermediario':
      case 'intermediario 1':
      case 'intermediario_1':
        return 2;
      case 'intermediario 2':
      case 'intermediario_2':
        return 3;
      case 'open':
      case 'livre':
        return 5;
    }
    return null;
  }

  /// Label amigável para um rank unificado (escada do vôlei).
  static String labelForRank(int rank) {
    switch (rank) {
      case 0:
        return 'Iniciante 1';
      case 1:
        return 'Iniciante 2';
      case 2:
        return 'Intermediário 1';
      case 3:
        return 'Intermediário 2';
      default:
        return 'Open';
    }
  }

  /// Bucket legado de 3 níveis para exibição/filtros que não conhecem a
  /// escada de 5 (ex.: filtro de nível do Descobrir): 0-1 → Iniciante,
  /// 2-3 → Intermediário, 5 → Open.
  static String? legacyBucketLabel(String? raw) {
    final rank = levelRank(raw);
    if (rank == null) return null;
    if (rank <= 1) return 'Iniciante';
    if (rank <= 3) return 'Intermediário';
    return 'Open';
  }

  /// Normaliza esporte legado (ex.: Beach tênis). Futevôlei deixou de ser
  /// alias de Futebol — virou esporte próprio (FUTEVOLEI).
  static String normalizeSport(String? raw) {
    final v = raw?.trim() ?? '';
    if (v.isEmpty) return '';
    const legacy = <String, String>{
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
