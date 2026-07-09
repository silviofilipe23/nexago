import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_catalog.dart';
import 'package:nexago_app/features/athlete/domain/sand_rank/sand_rank_reward_catalog.dart';

// Tabela literal — guarda de paridade com o catálogo TS
// (functions/src/sand-rank-engine.test.ts tem esta MESMA tabela).
const List<(int, String, int, int)> expectedTrack = [
  (0, 'INICIANTE', 3, 0),
  (1, 'INICIANTE', 2, 100),
  (2, 'INICIANTE', 1, 250),
  (3, 'COMPETIDOR', 3, 450),
  (4, 'COMPETIDOR', 2, 700),
  (5, 'COMPETIDOR', 1, 1000),
  (6, 'DESAFIANTE', 3, 1400),
  (7, 'DESAFIANTE', 2, 1900),
  (8, 'DESAFIANTE', 1, 2500),
  (9, 'ELITE', 3, 3300),
  (10, 'ELITE', 2, 4200),
  (11, 'ELITE', 1, 5300),
  (12, 'MESTRE', 3, 6600),
  (13, 'MESTRE', 2, 8200),
  (14, 'MESTRE', 1, 10000),
  (15, 'LENDA', 0, 12500),
];

// Ids do catálogo TS (SAND_RANK_REWARD_CATALOG) — paridade de recompensas.
const List<String> expectedRewardIds = [
  'EMBLEM_INICIANTE',
  'FRAME_INICIANTE',
  'TITLE_INICIANTE',
  'FRAME_INICIANTE_GOLD',
  'EMBLEM_COMPETIDOR',
  'FRAME_COMPETIDOR',
  'TITLE_COMPETIDOR',
  'FRAME_COMPETIDOR_GOLD',
  'EMBLEM_DESAFIANTE',
  'FRAME_DESAFIANTE',
  'PERK_STREAK_SHIELD_1',
  'TITLE_DESAFIANTE',
  'FRAME_DESAFIANTE_GOLD',
  'EMBLEM_ELITE',
  'FRAME_ELITE',
  'TITLE_ELITE',
  'FRAME_ELITE_GOLD',
  'EMBLEM_MESTRE',
  'FRAME_MESTRE',
  'PERK_STREAK_SHIELD_2',
  'TITLE_MESTRE',
  'FRAME_MESTRE_GOLD',
  'EMBLEM_LENDA',
  'FRAME_LENDA',
  'TITLE_LENDA',
  'VOUCHER_LENDA',
];

void main() {
  test('trilha bate com a tabela literal de 16 degraus (paridade TS)', () {
    expect(sandRankTrack.length, expectedTrack.length);
    for (final (trackIndex, rankCode, division, minXp) in expectedTrack) {
      final step = sandRankTrack[trackIndex];
      expect(step.trackIndex, trackIndex);
      expect(step.rankCode, rankCode);
      expect(step.division, division);
      expect(step.minXp, minXp);
    }
    expect(sandRankTopTrackIndex, 15);
  });

  test('thresholds estritamente crescentes', () {
    for (var i = 1; i < sandRankTrack.length; i++) {
      expect(sandRankTrack[i].minXp, greaterThan(sandRankTrack[i - 1].minXp));
    }
  });

  test('sandRankStepFromXp resolve os limites', () {
    expect(sandRankStepFromXp(0).trackIndex, 0);
    expect(sandRankStepFromXp(99).trackIndex, 0);
    expect(sandRankStepFromXp(100).trackIndex, 1);
    expect(sandRankStepFromXp(249).trackIndex, 1);
    expect(sandRankStepFromXp(250).trackIndex, 2);
    expect(sandRankStepFromXp(12499).trackIndex, 14);
    expect(sandRankStepFromXp(12500).trackIndex, 15);
    expect(sandRankStepFromXp(50000).trackIndex, 15);
    expect(sandRankStepFromXp(-10).trackIndex, 0);
  });

  test('sandRankLabel usa numeral romano; Lenda sem divisão', () {
    expect(sandRankLabel(sandRankTrack[0]), 'Iniciante III');
    expect(sandRankLabel(sandRankTrack[7]), 'Desafiante II');
    expect(sandRankLabel(sandRankTrack[14]), 'Mestre I');
    expect(sandRankLabel(sandRankTrack[15]), 'Lenda');
  });

  test('sandRankProgressFromXp calcula progresso dentro do degrau', () {
    final start = sandRankProgressFromXp(0);
    expect(start.current.trackIndex, 0);
    expect(start.next?.trackIndex, 1);
    expect(start.xpIntoStep, 0);
    expect(start.xpToNext, 100);
    expect(start.progress, 0);

    final mid = sandRankProgressFromXp(150);
    expect(mid.current.trackIndex, 1);
    expect(mid.xpIntoStep, 50);
    expect(mid.xpToNext, 100);
    expect(mid.progress, closeTo(50 / 150, 0.0001));

    final top = sandRankProgressFromXp(20000);
    expect(top.current.trackIndex, 15);
    expect(top.next, isNull);
    expect(top.xpToNext, 0);
    expect(top.progress, 1);
  });

  test('catálogo de recompensas em paridade com o TS (ids e ordem)', () {
    expect(
      SandRankRewardCatalog.all.map((r) => r.id).toList(),
      expectedRewardIds,
    );
  });

  test('todo degrau concede pelo menos 1 recompensa', () {
    for (final step in sandRankTrack) {
      expect(
        SandRankRewardCatalog.forTrackIndex(step.trackIndex),
        isNotEmpty,
        reason: 'degrau ${step.trackIndex} sem recompensa',
      );
    }
  });

  test('shieldsPerMonthForTrackIndex segue os marcos do perk', () {
    expect(shieldsPerMonthForTrackIndex(0), 0);
    expect(shieldsPerMonthForTrackIndex(5), 0);
    expect(shieldsPerMonthForTrackIndex(6), 1);
    expect(shieldsPerMonthForTrackIndex(11), 1);
    expect(shieldsPerMonthForTrackIndex(12), 2);
    expect(shieldsPerMonthForTrackIndex(15), 2);
  });

  test('displayTitleFor devolve título só para recompensas do tipo title', () {
    expect(SandRankRewardCatalog.displayTitleFor('TITLE_MESTRE'), 'Imparável');
    expect(SandRankRewardCatalog.displayTitleFor('FRAME_MESTRE'), isNull);
    expect(SandRankRewardCatalog.displayTitleFor(null), isNull);
  });
}
