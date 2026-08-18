// Constantes e helpers de ranking (paridade com `ranking.types.ts`).

/// Tabela base ×10 (fase 3), paridade de valores com a tabela autoritativa
/// em `functions/src/tournament-ranking.ts` (1000/800/600/500, quartas 330).
const pointsByPlace = <int, int>{
  1: 1000,
  2: 800,
  3: 600,
  4: 500,
  5: 330,
  6: 330,
  7: 330,
  8: 330,
};

/// Pesos por preset de categoria (fase 3) — exibição apenas, espelho de
/// `CATEGORY_PRESETS` em `functions/src/category-presets.ts`. O cálculo real
/// roda no backend; esta const nunca deve influenciar pontuação no app.
const categoryPresetWeights = <String, double>{
  'Elite': 1.2,
  'Open': 1.0,
  'Avançado': 0.5,
  'Intermediário': 0.25,
  'Iniciante': 0.125,
  'Livre': 0.125,
};

const placesWithPoints = [1, 2, 3, 4, 5, 6, 7, 8];

const rankingPointsBaseSum = 446;

const rankingPointsAverageFactor = rankingPointsBaseSum / 50;

const rankingPointsMinTotal = 200;

const rankingPointsMaxTotal = 800;

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

/// Soma a pontuação inteira: todo resultado conta, nenhum é descartado.
int sumPoints(List<int> points) {
  return points.fold(0, (sum, p) => sum + p);
}
