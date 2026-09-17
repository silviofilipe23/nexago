import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_campaign_ended.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_now_state.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _ko({
  required String id,
  String teamAId = 'meu',
  String teamBId = 'x',
  String status = TournamentMatchStatus.completed,
  String? winnerId,
  String matchType = 'knockout',
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
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
    winnerId: winnerId,
  );
}

TournamentMatch _group({
  required String id,
  required String poolId,
  String teamAId = 'meu',
  String teamBId = 'x',
  String status = TournamentMatchStatus.completed,
  String? winnerId,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'group',
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: true,
    matchNumber: 1,
    winnerId: winnerId,
  );
}

void main() {
  group('athleteFocusCampaignEnded', () {
    test('perda no mata-mata encerra a campanha (eliminação simples)', () {
      expect(
        athleteFocusCampaignEnded(
          matches: [
            _ko(id: 'quartas', winnerId: 'x'),
          ],
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: false,
        ),
        isTrue,
      );
    });

    test('vitória no mata-mata sozinha não encerra', () {
      expect(
        athleteFocusCampaignEnded(
          matches: [
            _ko(id: 'quartas', winnerId: 'meu'),
          ],
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: false,
        ),
        isFalse,
      );
    });

    test('grupo encerrado fora da zona encerra a campanha', () {
      // 3 duplas, 1 classifica. meu perde os dois jogos → 3º.
      final matches = [
        _group(id: 'g1', poolId: 'A', teamBId: 'a', winnerId: 'a'),
        _group(id: 'g2', poolId: 'A', teamBId: 'b', winnerId: 'b'),
        _group(
          id: 'g3',
          poolId: 'A',
          teamAId: 'a',
          teamBId: 'b',
          winnerId: 'a',
        ),
      ];

      expect(
        athleteFocusCampaignEnded(
          matches: matches,
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: false,
          qualifiersPerGroup: 1,
        ),
        isTrue,
      );
    });

    test('grupo em andamento: matematicamente fora pelas vitórias', () {
      // 4 duplas, top 2. meu 0V + 1 pendente (teto 1); A já 3V e B 2V.
      final matches = [
        _group(id: 'a-b', poolId: 'A', teamAId: 'a', teamBId: 'b', winnerId: 'a'),
        _group(id: 'a-c', poolId: 'A', teamAId: 'a', teamBId: 'c', winnerId: 'a'),
        _group(id: 'a-meu', poolId: 'A', teamAId: 'a', teamBId: 'meu', winnerId: 'a'),
        _group(id: 'b-c', poolId: 'A', teamAId: 'b', teamBId: 'c', winnerId: 'b'),
        _group(id: 'b-meu', poolId: 'A', teamAId: 'b', teamBId: 'meu', winnerId: 'b'),
        _group(
          id: 'c-meu',
          poolId: 'A',
          teamAId: 'c',
          teamBId: 'meu',
          status: TournamentMatchStatus.scheduled,
        ),
      ];

      expect(
        eliminatedFromGroupPhase(
          matches: matches,
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          qualifiersPerGroup: 2,
        ),
        isTrue,
      );
    });

    test('grupo em andamento: ainda alcança a zona — não elimina', () {
      // meu 1V + 1 pendente (teto 2); só A tem 2V — top 2 ainda cabem.
      final matches = [
        _group(id: 'meu-c', poolId: 'A', teamBId: 'c', winnerId: 'meu'),
        _group(id: 'a-b', poolId: 'A', teamAId: 'a', teamBId: 'b', winnerId: 'a'),
        _group(id: 'a-c', poolId: 'A', teamAId: 'a', teamBId: 'c', winnerId: 'a'),
        _group(
          id: 'meu-a',
          poolId: 'A',
          teamBId: 'a',
          status: TournamentMatchStatus.scheduled,
        ),
        _group(
          id: 'meu-b',
          poolId: 'A',
          teamBId: 'b',
          status: TournamentMatchStatus.scheduled,
        ),
        _group(
          id: 'b-c',
          poolId: 'A',
          teamAId: 'b',
          teamBId: 'c',
          status: TournamentMatchStatus.scheduled,
        ),
      ];

      expect(
        eliminatedFromGroupPhase(
          matches: matches,
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          qualifiersPerGroup: 2,
        ),
        isFalse,
      );
    });

    test('uma derrota com top2 ainda aberto não elimina', () {
      expect(
        athleteFocusCampaignEnded(
          matches: [
            _group(
              id: 'g1',
              poolId: 'A',
              winnerId: 'x',
            ),
            _group(
              id: 'g2',
              poolId: 'A',
              teamBId: 'y',
              status: TournamentMatchStatus.scheduled,
            ),
          ],
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: false,
          qualifiersPerGroup: 2,
        ),
        isFalse,
      );
    });

    test('dupla eliminação: uma derrota NÃO encerra', () {
      expect(
        athleteFocusCampaignEnded(
          matches: [
            _ko(
              id: 'wb1',
              matchType: 'wb',
              winnerId: 'x',
            ),
          ],
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: true,
        ),
        isFalse,
      );
    });

    test('dupla eliminação: duas derrotas encerram', () {
      expect(
        athleteFocusCampaignEnded(
          matches: [
            _ko(id: 'wb1', matchType: 'wb', winnerId: 'x'),
            _ko(id: 'lb1', matchType: 'lb', teamBId: 'y', winnerId: 'y'),
          ],
          categoryId: 'c1',
          myTeamIds: const {'meu'},
          isDoubleElimination: true,
        ),
        isTrue,
      );
    });
  });

  group('focusNowStateWithCampaignOf', () {
    test('sem partida + campanha encerrada → eliminated', () {
      expect(
        focusNowStateWithCampaignOf(null, null, campaignEnded: true),
        FocusNowState.eliminated,
      );
    });

    test('sem partida + campanha aberta → idle', () {
      expect(
        focusNowStateWithCampaignOf(null, null, campaignEnded: false),
        FocusNowState.idle,
      );
    });

    test('partida só agendada cede à campanha encerrada', () {
      expect(
        focusNowStateWithCampaignOf(
          _ko(
            id: 'next',
            status: TournamentMatchStatus.scheduled,
            winnerId: null,
          ),
          null,
          campaignEnded: true,
        ),
        FocusNowState.eliminated,
      );
    });

    test('ao vivo vence campanha encerrada', () {
      expect(
        focusNowStateWithCampaignOf(
          _ko(
            id: 'live',
            status: TournamentMatchStatus.inProgress,
            winnerId: null,
          ),
          null,
          campaignEnded: true,
        ),
        FocusNowState.live,
      );
    });
  });

  group('focusCampaignSummaryOf', () {
    test('conta V/D e posição no grupo', () {
      final summary = focusCampaignSummaryOf(
        matches: [
          _group(id: 'g1', poolId: 'A', teamBId: 'a', winnerId: 'meu'),
          _group(id: 'g2', poolId: 'A', teamBId: 'b', winnerId: 'b'),
          _ko(id: 'q', winnerId: 'x'),
        ],
        categoryId: 'c1',
        myTeamIds: const {'meu'},
      );

      expect(summary.wins, 1);
      expect(summary.losses, 2);
      expect(summary.groupRank, isNotNull);
    });
  });
}
