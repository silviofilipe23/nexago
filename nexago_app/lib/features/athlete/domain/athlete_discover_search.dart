import '../../../core/profiles/athlete_search_results.dart';
import 'athlete_discover_logic.dart';
import 'athlete_profile.dart';

/// Teto de resultados da busca do Descobrir.
const int kDiscoverSearchResultLimit = 25;

/// Ordena por relevância e devolve só os perfis discoverable.
///
/// Recebe os documentos CRUS já lidos (`id` -> `data`) para não custar
/// round-trip nenhum: o mesmo mapa alimenta o ranqueador compartilhado e o
/// mapper de `AthleteProfile`.
List<AthleteProfile> rankDiscoverSearchProfiles(
  Map<String, Map<String, dynamic>> docsById,
  List<String> tokens, {
  int max = kDiscoverSearchResultLimit,
}) {
  if (docsById.isEmpty || tokens.isEmpty) return const [];

  final searchDocs = docsById.entries
      .map((e) => AthleteSearchDoc.fromMap(e.key, e.value))
      .toList();

  final ranked = rankAthleteSearchResults(searchDocs, tokens, max: max);

  final profiles = <AthleteProfile>[];
  for (final user in ranked) {
    final data = docsById[user.uid];
    if (data == null) continue;
    final profile = AthleteProfile.fromMap(user.uid, data);
    if (isDiscoverableProfile(profile)) profiles.add(profile);
  }
  return profiles;
}
