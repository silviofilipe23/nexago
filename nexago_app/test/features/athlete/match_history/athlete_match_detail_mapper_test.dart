import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_mapper.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_detail_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

TournamentMatch _match({
  String id = 'm1',
  String teamAId = 'team_a',
  String teamBId = 'team_b',
  String status = TournamentMatchStatus.completed,
  String? winnerId = 'team_a',
  String matchType = 'Quarter-Final',
  List<TournamentMatchSet> sets = const [
    TournamentMatchSet(a: 21, b: 15),
    TournamentMatchSet(a: 21, b: 18),
  ],
  DateTime? scheduleTime,
  int? currentSetIndex,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat_a',
    round: 1,
    matchType: matchType,
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    sets: sets,
    winnerId: winnerId,
    scheduleTime: scheduleTime,
    currentSetIndex: currentSetIndex,
  );
}

Map<String, TournamentTeam> _teams() => {
      'team_a': const TournamentTeam(
        id: 'team_a',
        player1Id: 'p1',
        player2Id: 'p2',
      ),
      'team_b': const TournamentTeam(
        id: 'team_b',
        player1Id: 'p3',
        player2Id: 'p4',
      ),
    };

Map<String, AppUserProfile> _profiles() => {
      'p1': const AppUserProfile(uid: 'p1', fullName: 'Ana Silva'),
      'p2': const AppUserProfile(uid: 'p2', fullName: 'Bia Costa'),
      'p3': const AppUserProfile(uid: 'p3', fullName: 'Carlos Lima'),
      'p4': const AppUserProfile(uid: 'p4', fullName: 'Diana Reis'),
    };

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('mapMatchToDetail — participante', () {
    test('maps win with sets from athlete perspective', () {
      final detail = mapMatchToDetail(
        match: _match(),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'p1',
          perspectiveTeamId: 'team_a',
          tournamentName: 'Copa Teste',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail, isNotNull);
      expect(detail!.isParticipantView, isTrue);
      expect(detail.phase, MatchDetailPhase.completed);
      expect(detail.result, AthleteMatchResult.win);
      expect(detail.resultBadgeLabel, 'VOCÊ VENCEU');
      expect(detail.stageLabel, 'QUARTAS DE FINAL');
      expect(detail.ourSetsWon, 2);
      expect(detail.opponentSetsWon, 0);
      expect(detail.ourTeam.roleLabel, 'VOCÊ');
      expect(detail.sets.first.ourScore, 21);
      expect(detail.sets.first.opponentScore, 15);
      expect(detail.winnerTeamId, 'team_a');
      expect(detail.setTimelineItems.length, 2);
    });

    test('omits unplayed third set from timeline on 2-0 win', () {
      final detail = mapMatchToDetail(
        match: _match(
          sets: const [
            TournamentMatchSet(a: 21, b: 15),
            TournamentMatchSet(a: 21, b: 18),
            TournamentMatchSet(a: 0, b: 0),
          ],
        ),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'p1',
          perspectiveTeamId: 'team_a',
          tournamentName: 'Copa Teste',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.sets, hasLength(2));
      expect(detail.setTimelineItems, hasLength(2));
      expect(detail.setTimelineItems.map((item) => item.label), ['SET 1', 'SET 2']);
    });

    test('maps loss when athlete is team B', () {
      final detail = mapMatchToDetail(
        match: _match(winnerId: 'team_a'),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'p3',
          perspectiveTeamId: 'team_b',
          tournamentName: 'Copa',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.result, AthleteMatchResult.loss);
      expect(detail.resultBadgeLabel, 'VOCÊ PERDEU');
      expect(detail.ourSetsWon, 0);
      expect(detail.opponentSetsWon, 2);
      expect(detail.sets.first.ourScore, 15);
      expect(detail.sets.first.opponentScore, 21);
    });

    test('scheduled phase shows countdown badge', () {
      final future = DateTime.now().add(const Duration(minutes: 30));
      final detail = mapMatchToDetail(
        match: _match(
          status: TournamentMatchStatus.scheduled,
          winnerId: null,
          sets: const [],
          scheduleTime: future,
        ),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'p1',
          perspectiveTeamId: 'team_a',
          tournamentName: 'Copa',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.phase, MatchDetailPhase.scheduled);
      expect(detail.resultBadgeLabel, contains('AGENDADO'));
      expect(detail.startsInMinutes, lessThanOrEqualTo(30));
    });

    test('live phase shows AO VIVO and current set points', () {
      final detail = mapMatchToDetail(
        match: _match(
          status: TournamentMatchStatus.inProgress,
          winnerId: null,
          sets: const [
            TournamentMatchSet(a: 21, b: 9),
            TournamentMatchSet(a: 14, b: 12),
          ],
          currentSetIndex: 1,
        ),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'p1',
          perspectiveTeamId: 'team_a',
          tournamentName: 'Copa',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.phase, MatchDetailPhase.live);
      expect(detail.resultBadgeLabel, 'AO VIVO');
      expect(detail.statusSubtitle, 'Set 2 em jogo');
      expect(detail.currentSetOurPoints, 14);
      expect(detail.currentSetOpponentPoints, 12);
      expect(detail.ourSetsWon, 1);
      expect(detail.opponentSetsWon, 0);
    });
  });

  group('mapMatchToDetail — espectador', () {
    test('uses neutral badge and team A vs B layout', () {
      final detail = mapMatchToDetail(
        match: _match(),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'viewer',
          perspectiveTeamId: null,
          tournamentName: 'Copa Teste',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail, isNotNull);
      expect(detail!.isParticipantView, isFalse);
      expect(detail.ourTeam.roleLabel, 'DUPLA A');
      expect(detail.opponentTeam.roleLabel, 'DUPLA B');
      expect(detail.ourTeam.teamId, 'team_a');
      expect(detail.opponentTeam.teamId, 'team_b');
      expect(detail.sets.first.ourScore, 21);
      expect(detail.sets.first.opponentScore, 15);
      expect(detail.winnerTeamId, 'team_a');
      expect(detail.resultBadgeLabel, contains('VENCEU'));
    });

    test('shows AO VIVO when match in progress', () {
      final detail = mapMatchToDetail(
        match: _match(
          status: TournamentMatchStatus.inProgress,
          winnerId: null,
          sets: const [],
        ),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'viewer',
          perspectiveTeamId: null,
          tournamentName: 'Copa',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.resultBadgeLabel, 'AO VIVO');
      expect(detail.isMatchLive, isTrue);
      expect(detail.phase, MatchDetailPhase.live);
    });

    test('shows FINALIZADO when completed without winner id', () {
      final detail = mapMatchToDetail(
        match: _match(winnerId: null),
        context: AthleteMatchDetailMapperContext(
          athleteUid: 'viewer',
          perspectiveTeamId: null,
          tournamentName: 'Copa',
          venueLabel: '',
          teams: _teams(),
          profiles: _profiles(),
        ),
      );

      expect(detail!.resultBadgeLabel, 'FINALIZADO');
    });
  });
}
