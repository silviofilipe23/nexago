/// Metadados de busca do atleta — rótulos alinhados aos filtros da aba Reservar.
abstract final class ArenaSearchMetadata {
  ArenaSearchMetadata._();

  /// Superfícies (`arenas.surfaces` + filtro "Superfície").
  static const List<String> surfaceOptions = [
    'Areia',
    'Saibro',
    'Sintética',
    'Grama',
    'Concreto',
  ];

  /// Esportes no perfil da arena (`courtTypes` — só esportes, não superfície).
  static const List<String> sportLabels = [
    'Vôlei de praia',
    'Beach tennis',
    'Vôlei indoor',
    'Tênis',
    'Padel',
    'Futebol',
    'Futevôlei',
    'Pickleball',
  ];

  static final Set<String> _surfaceSet =
      surfaceOptions.map((s) => s.toLowerCase()).toSet();

  static bool isSurfaceLabel(String label) =>
      _surfaceSet.contains(label.trim().toLowerCase());

  /// Separa `courtTypes` legado (misturava esporte + superfície).
  static ({List<String> sports, List<String> surfaces}) splitCourtTypes(
    List<String> courtTypes, {
    List<String> surfacesFromDoc = const [],
  }) {
    final surfaces = <String>[];
    if (surfacesFromDoc.isNotEmpty) {
      surfaces.addAll(surfacesFromDoc);
    } else {
      for (final t in courtTypes) {
        if (isSurfaceLabel(t)) surfaces.add(t);
      }
    }

    final sports = <String>[];
    for (final t in courtTypes) {
      if (!isSurfaceLabel(t) && t.trim().isNotEmpty) sports.add(t.trim());
    }

    return (sports: sports, surfaces: surfaces);
  }

  static List<String> uniqueLabels(Iterable<String> labels) {
    final out = <String>[];
    for (final raw in labels) {
      final s = raw.trim();
      if (s.isEmpty) continue;
      if (!out.any((e) => e.toLowerCase() == s.toLowerCase())) out.add(s);
    }
    return out;
  }

  static List<String> mergeSportLabels({
    required Iterable<String> profileSports,
    required Iterable<String> courtTypeLabels,
  }) {
    return uniqueLabels([...profileSports, ...courtTypeLabels]);
  }
}
