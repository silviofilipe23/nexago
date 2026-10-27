import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/ranking/domain/ranking_logic.dart';
import 'package:nexago_app/features/ranking/domain/ranking_models.dart';

/// "Última etapa" do ranking: o doc `rankingStages/{CODE}` diz quais torneios
/// pontuaram e quando; os `results[]` dos docs por esporte dizem quanto cada
/// um ganhou em cada torneio.
void main() {
  RankingStages stages(Map<String, (int, String)> byTournament) =>
      RankingStages.fromData({
        'stages': {
          for (final e in byTournament.entries)
            e.key: {
              'year': e.value.$1,
              'at': Timestamp.fromDate(DateTime.parse(e.value.$2)),
            },
        },
      });

  group('docs', () {
    test('results[] do doc por esporte viram RankingResultRef', () {
      final entry = AthleteRankingEntry.fromBySportData(
          'a1_VOLEI_PRAIA',
          {
            'athleteId': 'a1',
            'totalPoints': 1800,
            'results': [
              {
                'tournamentId': 'T1',
                'categoryId': 'C1',
                'points': 1000,
                'year': 2026
              },
              {
                'tournamentId': 'T2',
                'categoryId': 'C1',
                'points': 800,
                'year': 2026
              },
              {'categoryId': 'sem torneio', 'points': 5},
              'quebrado',
            ],
          },
          'VOLEI_PRAIA');
      expect(
        [
          for (final r in entry.results)
            '${r.tournamentId}:${r.points}:${r.year}'
        ],
        ['T1:1000:2026', 'T2:800:2026'],
      );
    });

    test('rankingStages: etapa sem hora fica de fora', () {
      final parsed = RankingStages.fromData({
        'stages': {
          'T1': {'year': 2026, 'at': Timestamp.fromDate(DateTime(2026, 6, 1))},
          'T2': {'year': 2026},
          'T3': 'quebrado',
        },
      });
      expect(parsed.byTournament.keys, ['T1']);
      expect(parsed.byTournament['T1']!.year, 2026);
    });
  });

  group('latestRankingStage', () {
    test('a mais recente e as do mesmo fim de semana contam juntas', () {
      final s = stages({
        'antiga': (2026, '2026-05-10T18:00:00Z'),
        'sabado': (2026, '2026-06-06T15:00:00Z'),
        'domingo': (2026, '2026-06-07T20:00:00Z'),
      });
      expect(latestRankingStage(s), {'sabado', 'domingo'});
    });

    test('na temporada, só as etapas do ano', () {
      final s = stages({
        'T2025': (2025, '2025-11-20T18:00:00Z'),
        'T2026': (2026, '2026-03-01T18:00:00Z'),
      });
      expect(latestRankingStage(s, year: 2025), {'T2025'});
      expect(latestRankingStage(s, year: 2024), isNull);
      expect(latestRankingStage(null), isNull);
    });
  });

  group('pontos da última etapa por linha', () {
    const results = [
      RankingResultRef(tournamentId: 'T1', year: 2025, points: 300),
      RankingResultRef(tournamentId: 'T2', year: 2026, points: 500),
      RankingResultRef(tournamentId: 'T3', year: 2026, points: 200),
    ];

    test('soma só os torneios da etapa, no ano quando há temporada', () {
      expect(rankingStagePoints(results, {'T2', 'T3'}), 700);
      expect(rankingStagePoints(results, {'T1', 'T2'}, year: 2026), 500);
      expect(rankingStagePoints(results, const {}), 0);
    });

    test('a linha leva os pontos da etapa e o filtro (renumeração) preserva',
        () {
      final entries = [
        const AthleteRankingEntry(
          athleteId: 'a',
          totalPoints: 1000,
          tournamentsCount: 3,
          pointsByYear: {'2025': 300, '2026': 700},
          results: results,
        ),
        const AthleteRankingEntry(
          athleteId: 'b',
          totalPoints: 900,
          tournamentsCount: 1,
          pointsByYear: {'2026': 900},
          results: [
            RankingResultRef(tournamentId: 'T0', year: 2026, points: 900),
          ],
        ),
      ];
      final season = buildAthleteRankingRowsForPeriod(
        entries,
        year: 2026,
        lastStage: {'T3'},
      );
      expect(
        {for (final r in season) r.athleteId: r.lastStagePoints},
        {'a': 200, 'b': 0},
      );
      // Filtro renumera via copyWith: o dado da etapa vai junto.
      final renumbered = assignRanks(season.reversed.toList());
      expect(renumbered.map((r) => r.rank), [1, 2]);
      expect(
        {for (final r in renumbered) r.athleteId: r.lastStagePoints},
        {'a': 200, 'b': 0},
      );

      expect(
        buildAthleteRankingRowsForPeriod(entries).first.lastStagePoints,
        isNull,
      );
    });

    test('equipes também', () {
      final rows = buildTeamRankingRowsForPeriod(
        const [
          TeamRankingEntry(
            teamId: 't',
            totalPoints: 700,
            tournamentsCount: 2,
            results: results,
          ),
        ],
        lastStage: {'T2'},
      );
      expect(rows.single.lastStagePoints, 500);
    });
  });
}
