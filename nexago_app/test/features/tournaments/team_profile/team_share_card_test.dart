import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_profile.dart';
import 'package:nexago_app/features/tournaments/domain/team_discover_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_logic.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_public_profile_models.dart';
import 'package:nexago_app/features/tournaments/domain/team_profile/team_share_card.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_team.dart';

AthleteProfile _athlete(
  String id, {
  String name = '',
  String? nickname,
  String city = '',
  String? state,
}) {
  return AthleteProfile(
    id: id,
    name: name.isEmpty ? 'Atleta $id' : name,
    nickname: nickname,
    sport: 'Vôlei de praia',
    level: 'INICIANTE',
    city: city,
    state: state,
  );
}

TeamPublicProfile _profile({
  required List<TeamMemberEntry> members,
  String? teamName,
  int? teamSize,
  int? rank,
  int points = 0,
  DateTime? createdAt,
}) {
  final ids = [for (final m in members) m.uid];
  return TeamPublicProfile(
    team: TournamentTeam(
      id: 'team-1',
      player1Id: ids.first,
      player2Id: ids.length > 1 ? ids[1] : ids.first,
      memberUids: ids,
      teamSize: teamSize,
      teamName: teamName,
      createdAt: createdAt,
    ),
    members: members,
    ranking: TeamDiscoverRankingSnapshot(rank: rank, points: points),
  );
}

TournamentMatch _match(
  String id, {
  required String tournamentId,
  required bool won,
  required DateTime endedAt,
  String matchType = 'Group',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: tournamentId,
    categoryId: 'cat',
    round: 1,
    matchType: matchType,
    poolId: 'A',
    teamAId: 'team-1',
    teamBId: 'rival',
    status: TournamentMatchStatus.completed,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: won ? 'team-1' : 'rival',
    matchEndedAt: endedAt,
  );
}

TeamShareCardData _build(
  TeamPublicProfile profile, {
  List<TournamentMatch> matches = const [],
  Map<String, String> tournamentNames = const {},
  Map<String, String> memberDetails = const {},
}) {
  return teamShareCardDataFrom(
    profile: profile,
    matches: matches,
    campaigns: buildTeamCampaigns(
      matches: matches,
      teamId: profile.teamId,
      tournamentNames: tournamentNames,
    ),
    stats: buildTeamProfileStats(
      matches: matches,
      teamId: profile.teamId,
      rankingPoints: profile.ranking.points,
    ),
    memberDetails: memberDetails,
  );
}

void main() {
  group('teamShareCardDataFrom', () {
    test('dupla vira "A / B" com apelido ou primeiro e último nome', () {
      final data = _build(
        _profile(
          members: [
            TeamMemberEntry(
              uid: 'u1',
              profile: _athlete('u1', name: 'Bruno Lima', nickname: 'Bruninho'),
            ),
            TeamMemberEntry(
              uid: 'u2',
              profile: _athlete('u2', name: 'Diego Souza de Barros'),
            ),
          ],
        ),
      );

      expect(data.isDuo, isTrue);
      expect(data.name, 'Bruninho / Diego Barros');
      expect(data.kicker, 'PERFIL DA DUPLA');
      expect(data.styleLabel(TeamShareCardStyle.roster), 'Ficha');
    });

    test('equipe nomeada usa o nome dela e as iniciais no escudo', () {
      final data = _build(
        _profile(
          teamName: 'Arena Costa Sul',
          teamSize: 3,
          members: [
            for (final uid in ['u1', 'u2', 'u3'])
              TeamMemberEntry(uid: uid, profile: _athlete(uid)),
          ],
        ),
      );

      expect(data.isDuo, isFalse);
      expect(data.name, 'Arena Costa Sul');
      expect(data.monogram, 'ACS');
      expect(data.members, hasLength(3));
      expect(data.styleLabel(TeamShareCardStyle.roster), 'Elenco');
    });

    test('sem posição no ranking não existe o estilo Ranking', () {
      final members = [
        TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
        TeamMemberEntry(uid: 'u2', profile: _athlete('u2')),
      ];
      final unranked = _build(_profile(members: members));
      final ranked = _build(_profile(members: members, rank: 3, points: 4280));

      expect(unranked.styles, [
        TeamShareCardStyle.profile,
        TeamShareCardStyle.roster,
      ]);
      expect(unranked.rankLabel, '—');
      expect(ranked.styles, TeamShareCardStyle.values);
      expect(ranked.rankLabel, '3º');
    });

    test('cidade do capitão e "juntos desde" na linha de origem', () {
      final data = _build(
        _profile(
          createdAt: DateTime(2024, 3, 10),
          members: [
            TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
            TeamMemberEntry(
              uid: 'u2',
              isCaptain: true,
              profile: _athlete('u2', city: 'Fortaleza', state: 'CE'),
            ),
          ],
        ),
      );

      expect(data.location, 'Fortaleza · CE');
      expect(data.originLine, 'FORTALEZA · CE · JUNTOS DESDE 2024');
    });

    test('sequência: últimos cinco jogos decididos, mais recente à direita',
        () {
      final matches = [
        for (var i = 0; i < 7; i++)
          _match(
            'm$i',
            tournamentId: 't1',
            // Vence os pares: m0, m2, m4, m6.
            won: i.isEven,
            endedAt: DateTime(2026, 5, 1 + i),
          ),
      ];
      final data = _build(
        _profile(
          members: [
            TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
            TeamMemberEntry(uid: 'u2', profile: _athlete('u2')),
          ],
        ),
        matches: matches.reversed.toList(),
      );

      expect(data.form, [true, false, true, false, true]);
      expect(data.games, 7);
      expect(data.wins, 4);
    });

    test('últimas etapas: três mais recentes, vice vira 2º', () {
      final matches = [
        _match(
          'a',
          tournamentId: 't1',
          won: true,
          matchType: 'Final',
          endedAt: DateTime(2026, 1, 1),
        ),
        _match(
          'b',
          tournamentId: 't2',
          won: false,
          matchType: 'Final',
          endedAt: DateTime(2026, 2, 1),
        ),
        _match(
          'c',
          tournamentId: 't3',
          won: false,
          matchType: 'Semi Final',
          endedAt: DateTime(2026, 3, 1),
        ),
        _match(
          'd',
          tournamentId: 't4',
          won: true,
          matchType: 'Final',
          endedAt: DateTime(2026, 4, 1),
        ),
      ];
      final data = _build(
        _profile(
          members: [
            TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
            TeamMemberEntry(uid: 'u2', profile: _athlete('u2')),
          ],
        ),
        matches: matches,
        tournamentNames: const {
          't1': 'Etapa 1',
          't2': 'Etapa 2',
          't3': 'Etapa 3',
          't4': 'Etapa 4',
        },
      );

      expect(
        [for (final s in data.stages) '${s.name} ${s.result}'],
        ['Etapa 4 1º', 'Etapa 3 SEMI', 'Etapa 2 2º'],
      );
      expect(data.titles, 2);
    });

    test('detalhe do atleta (ranking individual) chega na ficha', () {
      final data = _build(
        _profile(
          members: [
            TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
            TeamMemberEntry(uid: 'u2', profile: _athlete('u2')),
          ],
        ),
        memberDetails: const {'u2': '#12 NO RANKING 2026'},
      );

      expect([
        for (final m in data.members) m.detail
      ], [
        '',
        '#12 NO RANKING 2026',
      ]);
    });

    test('o link é o perfil da equipe no portal do atleta', () {
      final data = _build(
        _profile(
          members: [
            TeamMemberEntry(uid: 'u1', profile: _athlete('u1')),
            TeamMemberEntry(uid: 'u2', profile: _athlete('u2')),
          ],
        ),
      );

      expect(data.link, 'https://atleta.nexago.com.br/equipes/team-1');
      expect(data.linkLabel, 'atleta.nexago.com.br');
    });
  });

  test('teamShareMonogram pula conectivos e cai em duas letras', () {
    expect(teamShareMonogram('Beach Club Iracema Sub-21'), 'BCI');
    expect(teamShareMonogram('Leões da Praia'), 'LP');
    expect(teamShareMonogram('Tubarões'), 'TU');
    expect(teamShareMonogram('  '), '?');
  });

  test('teamShareHue é estável por equipe', () {
    expect(teamShareHue('team-1'), teamShareHue('team-1'));
    expect(teamShareHue('team-1'), inInclusiveRange(0, 359));
  });

  test('legenda: ranking puxa a posição, perfil apresenta a equipe', () {
    const data = TeamShareCardData(
      teamId: 'team-1',
      name: 'Ana / Bia',
      isDuo: true,
      monogram: 'AB',
      hue: 20,
      members: [],
      rosterSize: 2,
      link: 'https://atleta.nexago.com.br/equipes/team-1',
      rank: 3,
    );

    expect(
      teamShareCardText(data, TeamShareCardStyle.ranking),
      startsWith('3º no ranking de equipes do nexaGO! Perfil da dupla '
          'Ana / Bia: https://atleta.nexago.com.br/equipes/team-1'),
    );
    expect(
      teamShareCardText(data, TeamShareCardStyle.profile),
      startsWith('Conheça a dupla Ana / Bia no nexaGO: '),
    );
  });
}
