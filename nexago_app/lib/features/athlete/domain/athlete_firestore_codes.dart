/// Códigos do documento `users/{uid}` (campo [sportOnboarding]).
abstract final class AthleteFirestoreCodes {
  AthleteFirestoreCodes._();

  static const int sportOnboardingVersion = 1;

  static const Map<String, String> _sportAppToFirestore = {
    'beach_volleyball': 'VOLEI_PRAIA',
    'indoor_volleyball': 'VOLEI_QUADRA',
    'football': 'FUTEBOL',
    'basketball': 'BASQUETE',
    'tennis': 'TENIS',
    'beach_tennis': 'BEACH_TENNIS',
    'running': 'CORRIDA',
    'other': 'OUTROS',
  };

  static const Map<String, String> _sportFirestoreToApp = {
    'VOLEI_PRAIA': 'beach_volleyball',
    'VOLEI_QUADRA': 'indoor_volleyball',
    'FUTEBOL': 'football',
    'BASQUETE': 'basketball',
    'TENIS': 'tennis',
    'BEACH_TENNIS': 'beach_tennis',
    'CORRIDA': 'running',
    'OUTROS': 'other',
  };

  static const Map<String, String> _sportFirestoreToLabel = {
    'VOLEI_PRAIA': 'Vôlei de praia',
    'VOLEI_QUADRA': 'Vôlei de quadra',
    'FUTEBOL': 'Futebol',
    'BASQUETE': 'Basquete',
    'TENIS': 'Tênis',
    'BEACH_TENNIS': 'Beach tennis',
    'CORRIDA': 'Corrida',
    'OUTROS': 'Outros',
  };

  static const Map<String, String> _goalAppToFirestore = {
    'book_arena': 'RESERVAR_ARENA',
    'play_fun': 'JOGAR_DIVERSAO',
    'compete': 'COMPETIR',
    'improve': 'MELHORAR_DESEMPENHO',
    'meet_people': 'CONHECER_PESSOAS',
    'train_regularly': 'TREINAR_REGULARMENTE',
  };

  static const Map<String, String> _goalFirestoreToApp = {
    'RESERVAR_ARENA': 'book_arena',
    'JOGAR_DIVERSAO': 'play_fun',
    'COMPETIR': 'compete',
    'MELHORAR_DESEMPENHO': 'improve',
    'CONHECER_PESSOAS': 'meet_people',
    'TREINAR_REGULARMENTE': 'train_regularly',
  };

  static const Map<String, String> _levelLabelToFirestore = {
    'Iniciante': 'iniciante',
    'Intermediário': 'intermediario',
    'Open': 'open',
    // Escada de 5 níveis do vôlei (códigos com underscore no Firestore).
    'Iniciante 1': 'iniciante_1',
    'Iniciante 2': 'iniciante_2',
    'Intermediário 1': 'intermediario_1',
    'Intermediário 2': 'intermediario_2',
  };

  static const Map<String, String> _levelFirestoreToLabel = {
    'iniciante': 'Iniciante',
    'intermediario': 'Intermediário',
    'open': 'Open',
    'iniciante_1': 'Iniciante 1',
    'iniciante_2': 'Iniciante 2',
    'intermediario_1': 'Intermediário 1',
    'intermediario_2': 'Intermediário 2',
  };

  static String? sportAppToFirestore(String? appId) {
    if (appId == null || appId.isEmpty) return null;
    return _sportAppToFirestore[appId];
  }

  static String? sportFirestoreToLabel(String? code) {
    if (code == null || code.isEmpty) return null;
    return _sportFirestoreToLabel[code] ??
        _sportFirestoreToLabel[code.toUpperCase()];
  }

  static String? sportFirestoreToApp(String? code) {
    if (code == null || code.isEmpty) return null;
    final key = code.toUpperCase();
    return _sportFirestoreToApp[key] ?? _sportFirestoreToApp[code];
  }

  static List<String> sportFirestoreIdsToLabels(Iterable<String> codes) {
    return codes.map(sportFirestoreToLabel).whereType<String>().toList();
  }

  static String goalAppToFirestore(String appId) {
    return _goalAppToFirestore[appId] ?? appId.toUpperCase();
  }

  static List<String> goalsAppToFirestore(Iterable<String> appIds) {
    return appIds.map(goalAppToFirestore).toList();
  }

  static String goalFirestoreToApp(String code) {
    return _goalFirestoreToApp[code] ?? code.toLowerCase();
  }

  static List<String> goalsFirestoreToApp(Iterable<String> codes) {
    return codes.map(goalFirestoreToApp).toList();
  }

  static String levelLabelToFirestore(String label) {
    final trimmed = label.trim();
    return _levelLabelToFirestore[trimmed] ??
        trimmed
            .toLowerCase()
            .replaceAll('á', 'a')
            .replaceAll('ã', 'a')
            .replaceAll('é', 'e')
            .replaceAll('í', 'i')
            .replaceAll('ó', 'o')
            .replaceAll('ú', 'u')
            .replaceAll('ç', 'c');
  }

  static String levelFirestoreToLabel(String? code) {
    if (code == null || code.isEmpty) return '';
    final key = code.toLowerCase();
    return _levelFirestoreToLabel[key] ?? code;
  }

  /// `dd/mm/aaaa` → `YYYY-MM-DD`.
  static String? birthDateBrToIso(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final trimmed = raw.trim();
    final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(trimmed);
    if (iso != null) return trimmed.substring(0, 10);
    final br = RegExp(r'^(\d{2})/(\d{2})/(\d{4})$').firstMatch(trimmed);
    if (br == null) return null;
    return '${br.group(3)}-${br.group(2)}-${br.group(1)}';
  }

  /// `YYYY-MM-DD` → `dd/mm/aaaa` (UI).
  static String? birthDateIsoToBr(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    final trimmed = raw.trim();
    final iso = RegExp(r'^(\d{4})-(\d{2})-(\d{2})$').firstMatch(trimmed);
    if (iso != null) {
      return '${iso.group(3)}/${iso.group(2)}/${iso.group(1)}';
    }
    return trimmed;
  }
}
