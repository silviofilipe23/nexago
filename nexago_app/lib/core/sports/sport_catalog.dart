import 'sport_catalog_data.dart';

export 'sport_catalog_data.dart';

/// Catálogo de esportes (spec multiesporte 2026-10-03, eixo 1). Os dados vêm de
/// `sport_catalog_data.dart` (gerado de `sports/catalog.json`); a lógica é a
/// MESMA de `functions/src/sports/catalog.ts` e `frontend/shared/sports` — os
/// vetores em `test/core/sports/sport_vectors_data.dart` provam a paridade.
abstract final class SportCatalog {
  SportCatalog._();

  static const Map<String, String> _fold = {
    'á': 'a',
    'à': 'a',
    'â': 'a',
    'ã': 'a',
    'ä': 'a',
    'é': 'e',
    'è': 'e',
    'ê': 'e',
    'ë': 'e',
    'í': 'i',
    'ì': 'i',
    'î': 'i',
    'ï': 'i',
    'ó': 'o',
    'ò': 'o',
    'ô': 'o',
    'õ': 'o',
    'ö': 'o',
    'ú': 'u',
    'ù': 'u',
    'û': 'u',
    'ü': 'u',
    'ç': 'c',
    'ñ': 'n',
  };

  static final RegExp _keyChar = RegExp(r'^[a-z0-9]$');

  static final Map<String, SportCatalogEntry> _byCode = {
    for (final e in kSportCatalog) e.code: e,
  };

  static String normalizeKey(String? raw) {
    if (raw == null) return '';
    final out = StringBuffer();
    for (final rune in raw.toLowerCase().runes) {
      final ch = String.fromCharCode(rune);
      final c = _fold[ch] ?? ch;
      if (_keyChar.hasMatch(c)) out.write(c);
    }
    return out.toString();
  }

  /// Qualquer grafia conhecida (código, código de perfil, id do app, rótulo,
  /// alias) → entrada do catálogo. `null` para desconhecido ou vazio.
  static SportCatalogEntry? resolve(String? raw) {
    final code = kSportIndex[normalizeKey(raw)];
    return code == null ? null : _byCode[code];
  }

  static SportCatalogEntry? byAppId(String? appId) {
    for (final e in kSportCatalog) {
      if (e.appId == appId) return e;
    }
    return null;
  }

  static SportCatalogEntry? byProfileCode(String? code) {
    final key = code?.trim().toUpperCase();
    for (final e in kSportCatalog) {
      if (e.profileCode == key) return e;
    }
    return null;
  }

  static String? profileCodeOf(String? raw) => resolve(raw)?.profileCode;

  static String? artOf(String? raw) => resolve(raw)?.art;

  static String titleCase(String raw) {
    return raw
        .trim()
        .replaceAllMapped(
          RegExp(r'([a-z0-9])([A-Z])'),
          (m) => '${m[1]} ${m[2]}',
        )
        .split(RegExp(r'[\s_-]+'))
        .where((w) => w.isNotEmpty)
        .map((w) => w[0].toUpperCase() + w.substring(1).toLowerCase())
        .join(' ');
  }

  /// Conhecido → rótulo do catálogo; desconhecido → o código em title case;
  /// vazio → `null`.
  static String? labelOf(String? raw) {
    if (raw == null || raw.trim().isEmpty) return null;
    return resolve(raw)?.label ?? titleCase(raw);
  }

  static Iterable<SportCatalogEntry> withSupport(SportSupport support) =>
      kSportCatalog.where((e) => e.support == support);
}
