import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_now_state.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String status = TournamentMatchStatus.scheduled,
  String queueStatus = '',
  DateTime? matchStartedAt,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: 'knockout',
    poolId: '',
    teamAId: 'meu',
    teamBId: 'rival',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    queueStatus: queueStatus,
    matchStartedAt: matchStartedAt,
  );
}

void main() {
  group('focusNowStateOf', () {
    test('chamada vence "em quadra" — as duas coexistem no mesmo dado', () {
      // `callMatchToCourt` grava queueStatus on_court E status In Progress na
      // MESMA escrita. Sem a ordem explícita, o alerta nunca apareceria.
      final m = _match(
        queueStatus: 'on_court',
        status: TournamentMatchStatus.inProgress,
      );

      expect(focusNowStateOf(m, null), FocusNowState.called);
    });

    test('reconhecida, a mesma partida passa a ser "em quadra"', () {
      final m = _match(
        queueStatus: 'on_court',
        status: TournamentMatchStatus.inProgress,
      );

      expect(focusNowStateOf(m, 'm1'), FocusNowState.live);
    });

    test('reconhecimento de OUTRA partida não recolhe esta chamada', () {
      final m = _match(
        queueStatus: 'on_court',
        status: TournamentMatchStatus.inProgress,
      );

      expect(focusNowStateOf(m, 'outra'), FocusNowState.called);
    });

    test('partida agendada sem chamada é "next"', () {
      expect(focusNowStateOf(_match(), null), FocusNowState.next);
    });

    test('sem partida, mata-mata pendente na categoria não é idle', () {
      expect(
        focusNowStateOf(null, null, categoryHasPendingKnockout: true),
        FocusNowState.pendingKnockout,
      );
    });

    test('sem partida e sem mata-mata pendente é idle', () {
      expect(focusNowStateOf(null, null), FocusNowState.idle);
    });
  });

  group('athleteFirstMatchStarted', () {
    test('dia só com partida agendada ainda não começou', () {
      expect(athleteFirstMatchStarted([_match()]), isFalse);
    });

    test('partida em quadra começa o dia', () {
      expect(
        athleteFirstMatchStarted(
          [_match(status: TournamentMatchStatus.inProgress)],
        ),
        isTrue,
      );
    });

    // Horário agendado que já passou NÃO conta: atraso de mesa é rotina e quem
    // ainda está a caminho continua precisando da rota.
    test('início real conta mesmo com o status atrasado', () {
      expect(
        athleteFirstMatchStarted(
          [_match(matchStartedAt: DateTime(2026, 8, 21, 9))],
        ),
        isTrue,
      );
    });

    // W.O. e placar lançado depois do fato não gravam `matchStartedAt`.
    test('partida encerrada sem início gravado conta', () {
      expect(
        athleteFirstMatchStarted(
          [_match(status: TournamentMatchStatus.completed)],
        ),
        isTrue,
      );
    });

    test('dia vazio não começou', () {
      expect(athleteFirstMatchStarted(const []), isFalse);
    });
  });

  group('hasPendingKnockoutInCategory / eliminatedFromKnockout', () {
    TournamentMatch ko({
      required String id,
      String teamAId = '',
      String teamBId = '',
      String status = TournamentMatchStatus.scheduled,
      String? winnerId,
    }) {
      return TournamentMatch(
        id: id,
        tournamentId: 't1',
        categoryId: 'c1',
        round: 1,
        matchType: 'knockout',
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

    test('slot da chave sem o time do atleta ainda conta como pendente', () {
      expect(
        hasPendingKnockoutInCategory([ko(id: 'slot')], 'c1'),
        isTrue,
      );
    });

    test('quem já perdeu no mata-mata está eliminado', () {
      final matches = [
        ko(
          id: 'quartas',
          teamAId: 'meu',
          teamBId: 'x',
          status: TournamentMatchStatus.completed,
          winnerId: 'x',
        ),
      ];

      expect(eliminatedFromKnockout(matches, 'c1', const {'meu'}), isTrue);
    });

    test('quem não jogou mata-mata não está eliminado', () {
      expect(
        eliminatedFromKnockout([ko(id: 'slot')], 'c1', const {'meu'}),
        isFalse,
      );
    });
  });
}
