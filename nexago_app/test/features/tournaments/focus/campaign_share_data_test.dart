import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/focus/campaign_share_data.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _m({
  required String id,
  int matchNumber = 1,
  int round = 1,
  String teamAId = 'meu',
  String teamBId = 'rival',
  String poolId = '',
  String matchType = 'knockout',
  String status = TournamentMatchStatus.completed,
  String? winnerId = 'meu',
  List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 21, b: 15)],
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: round,
    matchType: matchType,
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: poolId.isNotEmpty,
    matchNumber: matchNumber,
    winnerId: winnerId,
    sets: sets,
  );
}

CampaignShareData _build(List<TournamentMatch> matches) {
  return buildCampaignShareData(
    matches: matches,
    categoryId: 'c1',
    myTeamIds: const {'meu'},
    teamName: 'Eu e Fulano',
    players: const [CampaignPlayer(initial: 'E'), CampaignPlayer(initial: 'F')],
    categoryLine: 'Masculino B · Duplas',
    tournamentName: 'Copa Teste',
    duoNameOf: (id) => id,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  const meu = {'meu'};

  group('campaignPlacementOf', () {
    test('final vencida é campeão', () {
      final matches = [_m(id: 'f', matchType: 'Final')];
      expect(campaignPlacementOf(matches, 'c1', meu),
          CampaignPlacement.champion);
    });

    test('final perdida é vice', () {
      final matches = [_m(id: 'f', matchType: 'Final', winnerId: 'rival')];
      expect(campaignPlacementOf(matches, 'c1', meu),
          CampaignPlacement.runnerUp);
    });

    test('3º lugar vencido é terceiro, não campeão', () {
      // Decidido pelo matchType: a disputa de 3º compartilha o round da final.
      final matches = [
        _m(id: 'semi', matchNumber: 1, winnerId: 'rival'),
        _m(id: 'terceiro', matchNumber: 2, matchType: 'Third Place'),
      ];
      expect(campaignPlacementOf(matches, 'c1', meu), CampaignPlacement.third);
    });

    test('sem pódio é "none"', () {
      final matches = [_m(id: 'q', winnerId: 'rival')];
      expect(campaignPlacementOf(matches, 'c1', meu), CampaignPlacement.none);
    });
  });

  group('buildCampaignShareData', () {
    test('conta cartel e sets sob a ótica do atleta como lado B', () {
      final matches = [
        _m(
          id: 'j',
          teamAId: 'rival',
          teamBId: 'meu',
          sets: const [
            TournamentMatchSet(a: 15, b: 21),
            TournamentMatchSet(a: 12, b: 21),
          ],
        ),
      ];

      final data = _build(matches);

      expect(data.wins, 1);
      expect(data.setsWon, 2);
      expect(data.setsLost, 0);
      expect((data.rows.first as CampaignMatchRow).setScore, '2–0');
      expect((data.rows.first as CampaignMatchRow).partials, ['21-15', '21-12']);
    });

    test('sem partida encerrada não inventa aproveitamento', () {
      expect(_build(const []).winRateLabel, isNull);
    });

    test('aproveitamento sai em porcentagem', () {
      final matches = [
        _m(id: 'a', matchNumber: 1),
        _m(id: 'b', matchNumber: 2, winnerId: 'rival'),
      ];
      expect(_build(matches).winRateLabel, 'Aprov. 50%');
    });

    test('campanha longa colapsa o GRUPO e preserva o mata-mata', () {
      final matches = [
        for (var i = 1; i <= 4; i++)
          _m(id: 'g$i', matchNumber: i, poolId: 'A',
              winnerId: i == 4 ? 'rival' : 'meu'),
        for (var i = 5; i <= 8; i++) _m(id: 'k$i', matchNumber: i),
      ];

      final rows = _build(matches).rows;

      // 1 resumo de grupo + as 5 últimas de mata-mata (aqui só há 4).
      expect(rows.first, isA<CampaignGroupRow>());
      final summary = rows.first as CampaignGroupRow;
      expect(summary.wins, 3);
      expect(summary.losses, 1);
      expect(summary.games, 4);
      expect(rows.length, 5);
      expect(rows.skip(1).every((r) => (r as CampaignMatchRow).isGroup == false),
          isTrue);
    });

    test('campanha curta não colapsa nada', () {
      final matches = [
        _m(id: 'g1', matchNumber: 1, poolId: 'A'),
        _m(id: 'k1', matchNumber: 2),
      ];

      final rows = _build(matches).rows;

      expect(rows.length, 2);
      expect(rows.every((r) => r is CampaignMatchRow), isTrue);
    });
  });
}
