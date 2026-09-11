/// Uma colocação de pódio do atleta num torneio.
///
/// "Conquista" aqui é RESULTADO DE TORNEIO, não gamificação. A diferença
/// importa: `users/{uid}/gamification/**` só é legível pelo dono, enquanto
/// `tournamentCategoryResults` e `teams` são `allow read: if true`. Por isso
/// esta lista pode aparecer no perfil público e a de conquistas não.
class AthletePodium {
  const AthletePodium({
    required this.tournamentId,
    required this.tournamentName,
    required this.place,
    required this.year,
    this.categoryName,
    this.sportCode,
    this.completedAt,
  });

  final String tournamentId;
  final String tournamentName;

  /// 1, 2 ou 3. Fora dessa faixa não é pódio.
  final int place;

  final int year;
  final String? categoryName;
  final String? sportCode;
  final DateTime? completedAt;
}

/// Colocação máxima que conta como pódio. Quarto lugar não entra.
const int kPodiumMaxPlace = 3;

bool isPodiumPlace(int place) => place >= 1 && place <= kPodiumMaxPlace;

/// Ordena as conquistas para exibição: melhor colocação primeiro e, no empate,
/// a mais recente na frente.
///
/// O critério é esse porque a aba é uma vitrine — o título vem antes do
/// terceiro lugar, mesmo que o terceiro seja de ontem. Dentro da mesma
/// colocação, o mais novo ganha por ser o que a pessoa quer mostrar agora.
List<AthletePodium> sortPodiumsForDisplay(List<AthletePodium> podiums) {
  final out = [...podiums];
  out.sort((a, b) {
    final byPlace = a.place.compareTo(b.place);
    if (byPlace != 0) return byPlace;

    final da = a.completedAt;
    final db = b.completedAt;
    if (da != null && db != null) return db.compareTo(da);
    if (da != null) return -1;
    if (db != null) return 1;
    return b.year.compareTo(a.year);
  });
  return out;
}

/// Quantas vezes o atleta chegou em cada degrau, para o resumo do topo da aba.
Map<int, int> podiumCounts(List<AthletePodium> podiums) {
  final out = <int, int>{};
  for (final p in podiums) {
    if (!isPodiumPlace(p.place)) continue;
    out[p.place] = (out[p.place] ?? 0) + 1;
  }
  return out;
}
