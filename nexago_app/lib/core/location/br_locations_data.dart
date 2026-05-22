import 'dart:convert';

import 'package:flutter/services.dart';

/// UF brasileira (sigla + nome).
class BrState {
  const BrState({required this.sigla, required this.name});

  final String sigla;
  final String name;

  String get label => '$name ($sigla)';
}

/// Municípios por UF carregados de [assetPath] (IBGE).
class BrLocationsData {
  BrLocationsData._(this._citiesByUf);

  static const assetPath = 'assets/data/br_municipalities_by_uf.json';

  final Map<String, List<String>> _citiesByUf;

  static const List<BrState> states = [
    BrState(sigla: 'AC', name: 'Acre'),
    BrState(sigla: 'AL', name: 'Alagoas'),
    BrState(sigla: 'AP', name: 'Amapá'),
    BrState(sigla: 'AM', name: 'Amazonas'),
    BrState(sigla: 'BA', name: 'Bahia'),
    BrState(sigla: 'CE', name: 'Ceará'),
    BrState(sigla: 'DF', name: 'Distrito Federal'),
    BrState(sigla: 'ES', name: 'Espírito Santo'),
    BrState(sigla: 'GO', name: 'Goiás'),
    BrState(sigla: 'MA', name: 'Maranhão'),
    BrState(sigla: 'MT', name: 'Mato Grosso'),
    BrState(sigla: 'MS', name: 'Mato Grosso do Sul'),
    BrState(sigla: 'MG', name: 'Minas Gerais'),
    BrState(sigla: 'PA', name: 'Pará'),
    BrState(sigla: 'PB', name: 'Paraíba'),
    BrState(sigla: 'PR', name: 'Paraná'),
    BrState(sigla: 'PE', name: 'Pernambuco'),
    BrState(sigla: 'PI', name: 'Piauí'),
    BrState(sigla: 'RJ', name: 'Rio de Janeiro'),
    BrState(sigla: 'RN', name: 'Rio Grande do Norte'),
    BrState(sigla: 'RS', name: 'Rio Grande do Sul'),
    BrState(sigla: 'RO', name: 'Rondônia'),
    BrState(sigla: 'RR', name: 'Roraima'),
    BrState(sigla: 'SC', name: 'Santa Catarina'),
    BrState(sigla: 'SP', name: 'São Paulo'),
    BrState(sigla: 'SE', name: 'Sergipe'),
    BrState(sigla: 'TO', name: 'Tocantins'),
  ];

  static BrLocationsData? _cache;

  static Future<BrLocationsData> load() async {
    if (_cache != null) return _cache!;
    final raw = await rootBundle.loadString(assetPath);
    final decoded = json.decode(raw) as Map<String, dynamic>;
    final map = <String, List<String>>{};
    for (final entry in decoded.entries) {
      final list = (entry.value as List<dynamic>)
          .map((e) => e.toString())
          .toList(growable: false);
      map[entry.key.toUpperCase()] = list;
    }
    _cache = BrLocationsData._(map);
    return _cache!;
  }

  List<String> citiesFor(String? uf) {
    if (uf == null || uf.trim().isEmpty) return const [];
    return _citiesByUf[uf.trim().toUpperCase()] ?? const [];
  }

  /// Busca case-insensitive e sem acento; limita resultados para performance.
  List<String> searchCities({
    required String uf,
    required String query,
    int limit = 40,
  }) {
    final q = _normalize(query);
    if (q.isEmpty) return citiesFor(uf).take(limit).toList(growable: false);

    final matches = <String>[];
    for (final city in citiesFor(uf)) {
      if (_normalize(city).contains(q)) {
        matches.add(city);
        if (matches.length >= limit) break;
      }
    }
    return matches;
  }

  BrState? stateBySigla(String? sigla) {
    if (sigla == null || sigla.trim().isEmpty) return null;
    final s = sigla.trim().toUpperCase();
    for (final st in states) {
      if (st.sigla == s) return st;
    }
    return null;
  }

  /// Formata exibição `Cidade · UF`.
  static String formatLocationLabel({
    required String city,
    required String state,
  }) {
    final c = city.trim();
    final st = state.trim().toUpperCase();
    if (c.isEmpty && st.isEmpty) return '';
    if (c.isEmpty) return st;
    if (st.isEmpty) return c;
    return '$c · $st';
  }

  /// Parse legado `"Aparecida de Goiânia · GO"` ou só cidade.
  static ({String city, String state}) parseLegacyLocation(String raw) {
    final trimmed = raw.trim();
    if (trimmed.isEmpty) return (city: '', state: '');

    final parts = trimmed.split('·');
    if (parts.length >= 2) {
      final city = parts.first.trim();
      final state = parts.last.trim().toUpperCase();
      if (state.length == 2) return (city: city, state: state);
    }

    final match = RegExp(r'\s+([A-Z]{2})\s*$').firstMatch(trimmed);
    if (match != null) {
      final state = match.group(1)!;
      final city = trimmed.substring(0, match.start).trim();
      return (city: city, state: state);
    }

    return (city: trimmed, state: '');
  }

  static String _normalize(String value) {
    const accents = 'àáâãäåèéêëìíîïòóôõöùúûüçñ';
    const plain = 'aaaaaaeeeeiiiioooooouuuucn';
    final lower = value.toLowerCase().trim();
    final buffer = StringBuffer();
    for (var i = 0; i < lower.length; i++) {
      final ch = lower[i];
      final idx = accents.indexOf(ch);
      buffer.write(idx >= 0 ? plain[idx] : ch);
    }
    return buffer.toString();
  }
}
