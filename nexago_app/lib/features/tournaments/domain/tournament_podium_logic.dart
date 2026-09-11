import 'tournament_discovery_models.dart';
import 'tournament_listing_status.dart';
import 'tournament_match.dart';

/// Entrada mínima para calcular o pódio — desacopla a lógica do modelo
/// completo de partida (mantém os testes enxutos).
typedef PodiumMatch = ({
  String matchType,
  String? winnerId,
  String teamAId,
  String teamBId,
  bool isCompleted,
});

PodiumMatch podiumMatchFromMatch(TournamentMatch m) => (
      matchType: m.matchType,
      winnerId: m.winnerId,
      teamAId: m.teamAId,
      teamBId: m.teamBId,
      isCompleted: m.isCompleted,
    );

/// Pódio de uma categoria, derivado dos resultados das partidas decisivas.
class CategoryPodium {
  const CategoryPodium({
    this.championTeamId,
    this.runnerUpTeamId,
    this.thirdPlaceTeamId,
  });

  final String? championTeamId;
  final String? runnerUpTeamId;
  final String? thirdPlaceTeamId;

  /// A final foi decidida (já há campeão e vice).
  bool get isDecided => championTeamId != null && runnerUpTeamId != null;

  static const empty = CategoryPodium();
}

bool _isFinalType(String matchType) =>
    matchType.trim().toLowerCase() == 'final';

bool _isThirdPlaceType(String matchType) {
  final t = matchType.trim().toLowerCase();
  return t == 'third place' || t == '3rd place' || t.contains('third');
}

String? _other(PodiumMatch m, String teamId) {
  if (m.teamAId == teamId) return m.teamBId.isNotEmpty ? m.teamBId : null;
  if (m.teamBId == teamId) return m.teamAId.isNotEmpty ? m.teamAId : null;
  return null;
}

/// Calcula o pódio a partir das partidas da categoria. Campeão e vice vêm da
/// partida "Final" (grande final); o 3º lugar, da partida "Third Place" quando
/// existe. Retorna [CategoryPodium.empty] enquanto a final não foi decidida.
CategoryPodium computeCategoryPodium(Iterable<PodiumMatch> matches) {
  PodiumMatch? finalMatch;
  PodiumMatch? thirdMatch;
  for (final m in matches) {
    if (_isFinalType(m.matchType)) {
      finalMatch = m;
    } else if (_isThirdPlaceType(m.matchType)) {
      thirdMatch = m;
    }
  }

  final winner = finalMatch?.winnerId?.trim() ?? '';
  if (finalMatch == null || !finalMatch.isCompleted || winner.isEmpty) {
    return CategoryPodium.empty;
  }

  final third = thirdMatch?.winnerId?.trim() ?? '';
  return CategoryPodium(
    championTeamId: winner,
    runnerUpTeamId: _other(finalMatch, winner),
    thirdPlaceTeamId:
        thirdMatch != null && thirdMatch.isCompleted && third.isNotEmpty
            ? third
            : null,
  );
}

/// Conveniência para chamadores que têm a lista de [TournamentMatch].
CategoryPodium computeCategoryPodiumFromMatches(
        Iterable<TournamentMatch> matches) =>
    computeCategoryPodium(matches.map(podiumMatchFromMatch));

/// Um degrau do pódio já resolvido para a tela: colocação, equipe e prêmio.
class TournamentPodiumPlace {
  const TournamentPodiumPlace({
    required this.place,
    required this.teamId,
    required this.teamName,
    this.prizeValue = 0,
  });

  /// 1, 2 ou 3.
  final int place;
  final String teamId;

  /// Nome da dupla/equipe; cai no id quando a partida não trouxe descrição.
  final String teamName;

  /// Prêmio configurado para a colocação, em reais. 0 = sem prêmio declarado.
  final double prizeValue;
}

/// Pódio de UMA categoria do torneio, pronto para renderizar.
///
/// Categoria sem final decidida vem com [places] vazio em vez de sumir da
/// lista: o atleta precisa ver que a categoria dele existiu e ainda não tem
/// resultado, e não a ausência silenciosa dela.
class TournamentCategoryPodium {
  const TournamentCategoryPodium({
    required this.categoryId,
    required this.categoryName,
    required this.places,
  });

  final String categoryId;
  final String categoryName;
  final List<TournamentPodiumPlace> places;

  bool get isDecided => places.isNotEmpty;
}

double _prizeValueFor(List<TournamentCategoryPrize> prizes, int place) {
  for (final p in prizes) {
    if (p.position.trim() == '$place') return p.value;
  }
  return 0;
}

/// Nome da equipe a partir das descrições que as partidas já carregam.
String _teamNameIn(Iterable<TournamentMatch> matches, String teamId) {
  for (final m in matches) {
    if (m.teamAId == teamId) {
      final d = m.teamADescription?.trim() ?? '';
      if (d.isNotEmpty) return d;
    }
    if (m.teamBId == teamId) {
      final d = m.teamBDescription?.trim() ?? '';
      if (d.isNotEmpty) return d;
    }
  }
  return teamId;
}

/// O pódio de cada categoria do torneio, na ordem em que as categorias são
/// oferecidas.
///
/// O agrupamento por `categoryId` é o ponto crítico: rodar
/// [computeCategoryPodium] sobre as partidas do torneio inteiro faria a final
/// de uma categoria sobrescrever a da outra (ver [computeCategoryPodium], que
/// guarda só a última partida "Final" que encontra).
List<TournamentCategoryPodium> tournamentPodiumsByCategory({
  required List<TournamentCategoryOffer> categories,
  required List<TournamentMatch> matches,
}) {
  return [
    for (final category in categories)
      _podiumForCategory(
        category,
        matches.where((m) => m.categoryId == category.id).toList(),
      ),
  ];
}

TournamentCategoryPodium _podiumForCategory(
  TournamentCategoryOffer category,
  List<TournamentMatch> categoryMatches,
) {
  final podium = computeCategoryPodiumFromMatches(categoryMatches);
  final byPlace = <int, String?>{
    1: podium.championTeamId,
    2: podium.runnerUpTeamId,
    3: podium.thirdPlaceTeamId,
  };

  return TournamentCategoryPodium(
    categoryId: category.id,
    categoryName: category.name,
    places: [
      for (final entry in byPlace.entries)
        if ((entry.value?.trim() ?? '').isNotEmpty)
          TournamentPodiumPlace(
            place: entry.key,
            teamId: entry.value!.trim(),
            teamName: _teamNameIn(categoryMatches, entry.value!.trim()),
            prizeValue: _prizeValueFor(category.prizes, entry.key),
          ),
    ],
  );
}

/// A tela de pódio está liberada?
///
/// Torneio terminal (concluído/encerrado) abre o pódio mesmo sem nada decidido
/// — é o resultado que ficou registrado. E uma final já decidida abre antes
/// disso, porque o organizador que esquece de fechar o evento no painel é
/// rotina, e o pódio não pode ficar refém desse clique.
///
/// [isCancelled] é a exceção: cancelado também cai em `ended`, mas torneio
/// cancelado não tem pódio — só aparece se alguma final chegou a ser jogada.
bool tournamentPodiumAvailable({
  required TournamentListingStatus status,
  required List<TournamentCategoryPodium> podiums,
  bool isCancelled = false,
}) {
  final anyDecided = podiums.any((p) => p.isDecided);
  if (isCancelled) return anyDecided;
  return isTournamentTerminal(status) || anyDecided;
}
