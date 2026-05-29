// Constantes e helpers de ranking (paridade com `ranking.types.ts`).

const pointsByPlace = <int, int>{
  1: 100,
  2: 80,
  3: 60,
  4: 50,
  5: 33,
  6: 33,
  7: 33,
  8: 33,
};

const placesWithPoints = [1, 2, 3, 4, 5, 6, 7, 8];

const rankingPointsBaseSum = 446;

const rankingPointsAverageFactor = rankingPointsBaseSum / 50;

const rankingPointsMinTotal = 200;

const rankingPointsMaxTotal = 800;

const bestNResults = 5;

int getPointsForPlace(int place) {
  if (place >= 1 && place <= 8) {
    return pointsByPlace[place] ?? 0;
  }
  return 0;
}

int getPointsForPlaceFromLeagueConfig(
  int place,
  Map<String, num>? rankingPointsByPlace,
) {
  if (place < 1 || place > 8) return 0;
  final key = '$place';
  final configured = rankingPointsByPlace?[key];
  if (configured != null && !configured.isNaN) {
    return configured.round().clamp(0, 999999);
  }
  return getPointsForPlace(place);
}

Map<int, int> getPointsByPlaceFromTotal(int totalToDistribute) {
  final map = <int, int>{};
  if (totalToDistribute <= 0) {
    for (final p in placesWithPoints) {
      map[p] = 0;
    }
    return map;
  }
  var sumOthers = 0;
  for (final p in [2, 3, 4, 5, 6, 7, 8]) {
    final weight = pointsByPlace[p] ?? 0;
    final value =
        ((totalToDistribute * weight) / rankingPointsBaseSum).round();
    map[p] = value;
    sumOthers += value;
  }
  map[1] = (totalToDistribute - sumOthers).clamp(0, totalToDistribute);
  return map;
}

int getPointsForPlaceFromTotal(int place, int totalToDistribute) {
  if (place < 1 || place > 8) return 0;
  return getPointsByPlaceFromTotal(totalToDistribute)[place] ?? 0;
}

int sumBestNPoints(List<int> points, {int n = bestNResults}) {
  if (points.isEmpty || n <= 0) return 0;
  final sorted = [...points]..sort((a, b) => b.compareTo(a));
  return sorted.take(n).fold(0, (sum, p) => sum + p);
}
