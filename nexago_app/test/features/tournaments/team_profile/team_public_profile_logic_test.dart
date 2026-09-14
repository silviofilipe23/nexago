import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

TournamentMatch _match({
  required String id,
  required String tournamentId,
  required String teamAId,
  required String teamBId,
  required String status,
  String? winnerId,
  String matchType = 'Group',
  int round = 1,
  String? teamADescription,
  String? teamBDescription,
  DateTime? endedAt,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: tournamentId,
    categoryId: 'cat',
    round: round,
    matchType: matchType,
    poolId: 'A',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: winnerId,
    teamADescription: teamADescription,
    teamBDescription: teamBDescription,
    matchEndedAt: endedAt,
  );
}

void main() {
  const ourTeamId = 'team-a';
  const opponentId = 'team-b';

  group('buildTeamProfileStats', () {
    test('computes games, win rate, titles and points', () {
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          matchType: 'Final',
        ),
        _match(
          id: 'm2',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
        ),
        _match(
          id: 'm3',
          tournamentId: 't2',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          matchType: 'Semi-Final',
        ),
      ];

      final stats = buildTeamProfileStats(
        matches: matches,
        teamId: ourTeamId,
        rankingPoints: 3120,
      );

      expect(stats.games, 3);
      expect(stats.winRatePercent, 67);
      expect(stats.titles, 1);
      expect(stats.points, 3120);
    });
  });

  group('buildTeamCampaigns', () {
    test('groups tournaments and labels champion as 1º', () {
      final ended = DateTime.utc(2026, 5, 10);
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          matchType: 'Final',
          endedAt: ended,
        ),
        _match(
          id: 'm2',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          endedAt: ended,
        ),
        _match(
          id: 'm3',
          tournamentId: 't2',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          matchType: 'Semi-Final',
          endedAt: DateTime.utc(2026, 4, 1),
        ),
      ];

      final campaigns = buildTeamCampaigns(
        matches: matches,
        teamId: ourTeamId,
        tournamentNames: const {
          't1': 'BR Cup Sub 23',
          't2': 'Open Brasília',
        },
      );

      expect(campaigns, hasLength(2));
      expect(campaigns.first.tournamentName, 'BR Cup Sub 23');
      expect(campaigns.first.resultLabel, '1º');
      expect(campaigns.first.wins, 2);
      expect(campaigns.first.losses, 0);
      expect(campaigns.last.resultLabel, 'SF');
      expect(campaigns.last.recordLabel, '0V · 1D');
    });
  });

  group('buildTeamHeadToHead', () {
    test('aggregates wins and losses per opponent label', () {
      final matches = [
        _match(
          id: 'm1',
          tournamentId: 't1',
          teamAId: ourTeamId,
          teamBId: opponentId,
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          teamBDescription: 'Duarte/Reis',
        ),
        _match(
          id: 'm2',
          tournamentId: 't2',
          teamAId: opponentId,
          teamBId: ourTeamId,
          status: TournamentMatchStatus.completed,
          winnerId: opponentId,
          teamADescription: 'Duarte/Reis',
        ),
        _match(
          id: 'm3',
          tournamentId: 't3',
          teamAId: ourTeamId,
          teamBId: 'team-c',
          status: TournamentMatchStatus.completed,
          winnerId: ourTeamId,
          teamBDescription: 'Lima/Santos',
        ),
      ];

      final entries = buildTeamHeadToHead(
        matches: matches,
        teamId: ourTeamId,
      );

      expect(entries, hasLength(2));
      expect(entries.first.opponentLabel, 'Duarte/Reis');
      expect(entries.first.wins, 1);
      expect(entries.first.losses, 1);
      expect(entries.last.opponentLabel, 'Lima/Santos');
      expect(entries.last.wins, 1);
    });
  });

  group('teamProfileDisplayName', () {
    test('uses first names with slash when team name is empty', () {
      final name = teamProfileDisplayName(
        team: const TournamentTeam(
          id: 't',
          player1Id: 'p1',
          player2Id: 'p2',
        ),
        player1: null,
        player2: null,
      );
      expect(name, 'Dupla');
    });

    test('equipe sem nome não vira "Fulano/Beltrano" (esconderia o elenco)',
        () {
      final name = teamProfileDisplayName(
        team: const TournamentTeam(
          id: 't',
          player1Id: 'p1',
          player2Id: 'p2',
          memberUids: ['p1', 'p2', 'p3'],
          teamSize: 3,
        ),
        player1: null,
        player2: null,
      );
      expect(name, 'Equipe');
    });
  });

  group('teamProfileGenderLabel', () {
    test('elenco de um gênero só carimba esse gênero', () {
      expect(
        teamProfileGenderLabel([
          _athlete('a', gender: 'masculino'),
          _athlete('b', gender: 'masculino'),
          _athlete('c', gender: 'masculino'),
        ]),
        'MASCULINO',
      );
    });

    test('gêneros diferentes viram MISTO', () {
      expect(
        teamProfileGenderLabel([
          _athlete('a', gender: 'masculino'),
          _athlete('b', gender: 'feminino'),
        ]),
        'MISTO',
      );
    });

    test('integrante sem gênero não decide nada', () {
      expect(
        teamProfileGenderLabel([
          _athlete('a'),
          _athlete('b', gender: 'feminino'),
        ]),
        'FEMININO',
      );
      expect(teamProfileGenderLabel([_athlete('a')]), '');
    });
  });

  group('teamProfileCoverArt', () {
    test('usa a arte do esporte + elenco da equipe', () {
      expect(
        teamProfileCoverArt(_teamProfile(
          sportCodes: ['VOLEI_PRAIA', 'VOLEI_PRAIA'],
        )),
        'assets/images/team_covers/volei_praia_dupla.webp',
      );
    });

    test('tamanho declarado manda, mesmo com elenco incompleto', () {
      // Quarteto com dois convites pendentes continua sendo quarteto: quem
      // diz o tamanho é a categoria, não quem já aceitou.
      expect(
        teamProfileCoverArt(_teamProfile(
          sportCodes: ['VOLEI_PRAIA', 'VOLEI_PRAIA'],
          teamSize: 4,
        )),
        'assets/images/team_covers/volei_praia_quarteto.webp',
      );
    });

    test('capitão sem esporte no perfil não apaga a capa do resto do elenco',
        () {
      expect(
        teamProfileCoverArt(_teamProfile(sportCodes: [null, 'FUTEVOLEI'])),
        'assets/images/team_covers/futevolei_dupla.webp',
      );
    });

    test('sem arte de equipe, cai na arte de um atleta do esporte', () {
      expect(
        teamProfileCoverArt(_teamProfile(sportCodes: ['CORRIDA', 'CORRIDA'])),
        'assets/images/sports/corrida.webp',
      );
    });

    test('esporte desconhecido devolve nulo para o fundo pintado assumir', () {
      expect(teamProfileCoverArt(_teamProfile(sportCodes: [null, null])), isNull);
      expect(
        teamProfileCoverArt(_teamProfile(sportCodes: ['OUTROS', 'OUTROS'])),
        isNull,
      );
    });
  });
}

AthleteProfile _athlete(
  String id, {
  String? gender,
  String? primarySportFirestoreId,
}) {
  return AthleteProfile(
    id: id,
    name: id,
    sport: 'BEACH_TENNIS',
    level: 'INICIANTE',
    city: 'Goiânia',
    gender: gender,
    primarySportFirestoreId: primarySportFirestoreId,
  );
}

TeamPublicProfile _teamProfile({
  required List<String?> sportCodes,
  int? teamSize,
}) {
  final members = [
    for (var i = 0; i < sportCodes.length; i++)
      TeamMemberEntry(
        uid: 'u$i',
        profile: _athlete('u$i', primarySportFirestoreId: sportCodes[i]),
      ),
  ];
  return TeamPublicProfile(
    team: TournamentTeam(
      id: 't1',
      player1Id: 'u0',
      player2Id: sportCodes.length > 1 ? 'u1' : '',
      memberUids: [for (final m in members) m.uid],
      teamSize: teamSize,
    ),
    members: members,
  );
}
