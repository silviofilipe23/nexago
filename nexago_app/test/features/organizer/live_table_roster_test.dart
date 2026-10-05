import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';
import 'package:nexago_app/features/organizer/presentation/match_ops/widgets/organizer_match_live_table_widgets.dart';
import 'package:nexago_app/features/tournaments/data/tournament_match_enrichment_service.dart';
import 'package:nexago_app/features/tournaments/data/tournament_teams_repository.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

/// Mesa do app com o elenco real (multiesporte fase 4d2): o enriquecimento das partidas leva
/// o tamanho e os nomes do elenco, e a faixa "Quem saca?" pergunta por todos — não só 1 e 2.
class _FakeTeams implements TournamentTeamsRepository {
  _FakeTeams(this.teams);
  final Map<String, TournamentTeam> teams;

  @override
  Future<Map<String, TournamentTeam>> getTeamsByIds(
    Set<String> teamIds,
  ) async => {
    for (final id in teamIds)
      if (teams[id] != null) id: teams[id]!,
  };

  @override
  dynamic noSuchMethod(Invocation invocation) => throw UnimplementedError(
    'TournamentTeamsRepository.${invocation.memberName}',
  );
}

class _FakeUsers implements UsersRepository {
  _FakeUsers(this.profiles);
  final Map<String, AppUserProfile> profiles;

  @override
  Future<Map<String, AppUserProfile>> getUsersByIds(
    Iterable<String> uids,
  ) async => {
    for (final uid in uids)
      if (profiles[uid] != null) uid: profiles[uid]!,
  };

  @override
  dynamic noSuchMethod(Invocation invocation) =>
      throw UnimplementedError('UsersRepository.${invocation.memberName}');
}

TournamentMatch _match() => const TournamentMatch(
  id: 'm1',
  tournamentId: 'T',
  categoryId: 'c1',
  round: 1,
  matchType: 'group',
  poolId: '',
  teamAId: 'trio',
  teamBId: 'solo',
  status: 'In Progress',
  resultA: '0',
  resultB: '0',
  isGroupMatch: true,
  matchNumber: 1,
);

void main() {
  final service = TournamentMatchEnrichmentService(
    teamsRepository: _FakeTeams({
      'trio': TournamentTeam.fromMap('trio', const {
        'player1Id': 'u1',
        'player2Id': 'u2',
        'memberUids': ['u1', 'u2', 'u3'],
        'teamSize': 3,
        'teamName': 'Os Três',
      }),
      'solo': TournamentTeam.fromMap('solo', const {
        'player1Id': 'u9',
        'player2Id': '',
        'memberUids': ['u9'],
        'teamSize': 1,
      }),
      'dupla': TournamentTeam.fromMap('dupla', const {
        'player1Id': 'u1',
        'player2Id': 'u2',
      }),
      'nomeada': TournamentTeam.fromMap('nomeada', const {
        'player1Id': 'u1',
        'player2Id': 'u2',
        'teamName': 'Os Invencíveis',
      }),
    }),
    usersRepository: _FakeUsers({
      'u1': const AppUserProfile(uid: 'u1', fullName: 'Ana'),
      'u2': const AppUserProfile(uid: 'u2', fullName: 'Bia'),
      'u3': const AppUserProfile(uid: 'u3', fullName: 'Caio'),
      'u9': const AppUserProfile(uid: 'u9', fullName: 'Duda'),
    }),
  );

  test(
    'enriquecimento leva o elenco: trio com 3 nomes, individual com 1',
    () async {
      final card = (await service.enrichMatches([_match()])).single;
      expect(card.teamA.rosterSize, 3);
      expect(card.teamA.rosterNames, ['Ana', 'Bia', 'Caio']);
      expect(card.teamB.rosterSize, 1);
      expect(card.teamB.rosterNames, ['Duda']);
    },
  );

  test('dupla legada segue elenco 2', () async {
    final card = (await service.enrichMatches([
      const TournamentMatch(
        id: 'm2',
        tournamentId: 'T',
        categoryId: 'c1',
        round: 1,
        matchType: 'group',
        poolId: '',
        teamAId: 'dupla',
        teamBId: '',
        status: 'Scheduled',
        resultA: '0',
        resultB: '0',
        isGroupMatch: true,
        matchNumber: 2,
      ),
    ])).single;
    expect(card.teamA.rosterSize, 2);
  });

  test(
    'a mesa nomeia o 3º atleta do trio e o individual só tem a posição 1',
    () async {
      final card = (await service.enrichMatches([_match()])).single;
      final trio = liveTableTeamData(
        match: card.match,
        sideA: true,
        enrichedTeam: card.teamA,
      );
      expect(trio.rosterSize, 3);
      expect(trio.slots, [1, 2, 3]);
      expect(trio.nameForSlot(3), 'Caio');
      final solo = liveTableTeamData(
        match: card.match,
        sideA: false,
        enrichedTeam: card.teamB,
      );
      expect(solo.slots, [1]);
      expect(solo.nameForSlot(1), 'Duda');
    },
  );

  testWidgets('faixa "Quem saca?" oferece os 3 atletas do trio', (
    tester,
  ) async {
    final card = (await service.enrichMatches([_match()])).single;
    final trio = liveTableTeamData(
      match: card.match,
      sideA: true,
      enrichedTeam: card.teamA,
    );
    int? chosen;
    await tester.pumpWidget(
      MaterialApp(
        home: Scaffold(
          body: LiveTableServingPlayer(team: trio, onChoose: (s) => chosen = s),
        ),
      ),
    );
    expect(find.text('Ana'), findsOneWidget);
    expect(find.text('Bia'), findsOneWidget);
    await tester.tap(find.text('Caio'));
    expect(chosen, 3);
  });

  test('dupla com nome de equipe nomeia as posições pelos atletas, não pelo rótulo', () async {
    final card = (await service.enrichMatches([
      const TournamentMatch(
        id: 'm3',
        tournamentId: 'T',
        categoryId: 'c1',
        round: 1,
        matchType: 'group',
        poolId: '',
        teamAId: 'nomeada',
        teamBId: '',
        status: 'In Progress',
        resultA: '0',
        resultB: '0',
        isGroupMatch: true,
        matchNumber: 3,
      ),
    ])).single;
    final dupla = liveTableTeamData(
      match: card.match,
      sideA: true,
      enrichedTeam: card.teamA,
    );
    expect(dupla.label, 'Os Invencíveis');
    expect(dupla.nameForSlot(1), 'Ana');
    expect(dupla.nameForSlot(2), 'Bia');
  });
}
