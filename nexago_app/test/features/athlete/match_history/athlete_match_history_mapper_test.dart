import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_mapper.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  test('mapMatchToHistoryItem maps win with opponent and score', () {
    final match = TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'Masculino B',
      round: 1,
      matchType: 'Group',
      poolId: 'A',
      teamAId: 'team-athlete',
      teamBId: 'team-opponent',
      status: TournamentMatchStatus.completed,
      resultA: '21-19, 15-13',
      resultB: '19-21, 13-15',
      isGroupMatch: true,
      matchNumber: 1,
      winnerId: 'team-athlete',
      matchEndedAt: DateTime(2025, 8, 10, 14, 0),
    );

    final item = mapMatchToHistoryItem(
      match: match,
      context: const AthleteMatchHistoryMapperContext(
        athleteTeamIds: {'team-athlete'},
        tournamentNames: {'t1': 'Copa Praia'},
        teamDisplayNames: {
          'team-athlete': 'Eu / Parceiro',
          'team-opponent': 'Rival 1 / Rival 2',
        },
      ),
    );

    expect(item, isNotNull);
    expect(item!.result, AthleteMatchResult.win);
    expect(item.opponentLabel, 'Rival 1 / Rival 2');
    expect(item.competitionLabel, 'Copa Praia · Masculino B');
    expect(item.scoreDisplay, '21-19, 15-13');
    expect(item.playedAt, DateTime(2025, 8, 10, 14, 0));
  });

  test('mapMatchToHistoryItem ignores non-completed matches', () {
    final match = TournamentMatch(
      id: 'm2',
      tournamentId: 't1',
      categoryId: 'Feminino A',
      round: 1,
      matchType: 'Group',
      poolId: '',
      teamAId: 'team-athlete',
      teamBId: 'team-opponent',
      status: TournamentMatchStatus.scheduled,
      resultA: '',
      resultB: '',
      isGroupMatch: true,
      matchNumber: 2,
      scheduleTime: DateTime(2026, 1, 1),
    );

    final item = mapMatchToHistoryItem(
      match: match,
      context: const AthleteMatchHistoryMapperContext(
        athleteTeamIds: {'team-athlete'},
        tournamentNames: {'t1': 'Torneio'},
        teamDisplayNames: const {},
      ),
    );

    expect(item, isNull);
  });
}
