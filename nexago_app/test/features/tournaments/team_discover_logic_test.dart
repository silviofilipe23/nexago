import 'dart:math';

import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

AthleteProfile _player({
  String id = 'p1',
  String name = 'Marina Duarte',
  String gender = 'feminino',
  String city = 'Goiânia',
  String? state = 'GO',
  String sport = 'Vôlei de praia',
  String? category = 'Cat A',
  String? primarySportId = 'VOLEI_PRAIA',
}) {
  return AthleteProfile(
    id: id,
    name: name,
    gender: gender,
    city: city,
    state: state,
    sport: sport,
    level: 'Intermediário',
    category: category,
    primarySportFirestoreId: primarySportId,
  );
}

TeamDiscoverEntry _entry({
  TournamentTeam? team,
  AthleteProfile? player1,
  AthleteProfile? player2,
  int points = 100,
  int? rank,
}) {
  final t = team ??
      const TournamentTeam(
        id: 't1',
        player1Id: 'p1',
        player2Id: 'p2',
      );
  return buildTeamDiscoverEntry(
    team: t,
    player1: player1 ?? _player(),
    player2: player2 ?? _player(id: 'p2', name: 'Helena Reis'),
    ranking: TeamDiscoverRankingSnapshot(
      rank: rank,
      points: points,
      tournamentsCount: 2,
    ),
  );
}

void main() {
  group('applyTeamDiscoverFilters', () {
    test('filters by partnership looking for partner', () {
      final entries = [
        _entry(
          team: const TournamentTeam(
            id: 't1',
            player1Id: 'p1',
            player2Id: 'p1',
          ),
        ),
        _entry(),
      ];
      final result = applyTeamDiscoverFilters(
        entries: entries,
        filters: const TeamDiscoverFilters(
          partnership: TeamDiscoverPartnershipFilter.lookingForPartner,
        ),
      );
      expect(result, hasLength(1));
      expect(result.first.teamId, 't1');
    });

    test('filters by gender masculino', () {
      final entries = [
        _entry(
          team: const TournamentTeam(
            id: 't1',
            player1Id: 'p1',
            player2Id: 'p2',
            gender: 'masculino',
          ),
          player1: _player(gender: 'masculino'),
          player2: _player(id: 'p2', name: 'João Silva', gender: 'masculino'),
        ),
        _entry(
          team: const TournamentTeam(
            id: 't2',
            player1Id: 'p3',
            player2Id: 'p4',
            gender: 'feminino',
          ),
          player1: _player(id: 'p3', name: 'Ana Costa', gender: 'feminino'),
          player2: _player(id: 'p4', name: 'Bia Lima', gender: 'feminino'),
        ),
      ];
      final result = applyTeamDiscoverFilters(
        entries: entries,
        filters: const TeamDiscoverFilters(
          gender: TeamDiscoverGenderFilter.male,
        ),
      );
      expect(result.single.teamId, 't1');
    });

    test('filters by search query', () {
      final entries = [
        _entry(player1: _player(name: 'Rafael Antunes')),
        _entry(player1: _player(name: 'Marina Duarte')),
      ];
      final result = applyTeamDiscoverFilters(
        entries: entries,
        filters: TeamDiscoverFilters.defaults,
        searchQuery: 'marina',
      );
      expect(result.single.displayName, contains('Marina'));
    });
  });

  group('sortTeamDiscoverEntries', () {
    test('sorts by ranking position', () {
      final entries = [
        _entry(rank: 5, points: 100),
        _entry(
          team: const TournamentTeam(id: 't2', player1Id: 'a', player2Id: 'b'),
          rank: 2,
          points: 200,
        ),
      ];
      final sorted = sortTeamDiscoverEntries(
        entries: entries,
        sort: TeamDiscoverSort.ranking,
      );
      expect(sorted.first.rankPosition, 2);
    });

    test('sorts by trending tournaments count', () {
      final entries = [
        buildTeamDiscoverEntry(
          team: const TournamentTeam(id: 't1', player1Id: 'p1', player2Id: 'p2'),
          player1: _player(),
          player2: _player(id: 'p2', name: 'Helena Reis'),
          ranking: const TeamDiscoverRankingSnapshot(tournamentsCount: 1),
        ),
        buildTeamDiscoverEntry(
          team: const TournamentTeam(id: 't2', player1Id: 'a', player2Id: 'b'),
          player1: _player(id: 'a', name: 'A'),
          player2: _player(id: 'b', name: 'B'),
          ranking: const TeamDiscoverRankingSnapshot(tournamentsCount: 5),
        ),
      ];
      final sorted = sortTeamDiscoverEntries(
        entries: entries,
        sort: TeamDiscoverSort.trending,
      );
      expect(sorted.first.teamId, 't2');
    });
  });

  group('pickRandomTeamsForHubPreview', () {
    test('returns up to count teams from pool', () {
      final teams = List.generate(
        8,
        (i) => TournamentTeam(
          id: 'team-$i',
          player1Id: 'p1-$i',
          player2Id: 'p2-$i',
        ),
      );

      final picked = pickRandomTeamsForHubPreview(
        teams,
        count: 5,
        random: Random(42),
      );

      expect(picked, hasLength(5));
      expect(picked.map((t) => t.id).toSet(), hasLength(5));
      expect(teams.map((t) => t.id), containsAll(picked.map((t) => t.id)));
    });

    test('returns empty list when pool is empty', () {
      expect(pickRandomTeamsForHubPreview([]), isEmpty);
    });

    test('returns fewer teams when pool is smaller than count', () {
      final teams = [
        const TournamentTeam(id: 't1', player1Id: 'a', player2Id: 'b'),
        const TournamentTeam(id: 't2', player1Id: 'c', player2Id: 'd'),
      ];

      final picked = pickRandomTeamsForHubPreview(
        teams,
        count: 5,
        random: Random(1),
      );

      expect(picked, hasLength(2));
    });
  });
}
