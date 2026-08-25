import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_double_elimination.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _m({
  required String id,
  required int matchNumber,
  String matchType = 'WB',
  String status = TournamentMatchStatus.scheduled,
  String? winnerId,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: matchType,
    poolId: '',
    teamAId: 'meu',
    teamBId: 'rival',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: matchNumber,
    winnerId: winnerId,
  );
}

void main() {
  const meu = {'meu'};

  group('focusBracketBadgeOf', () {
    test('reconhece as siglas do gerador', () {
      expect(focusBracketBadgeOf(_m(id: 'a', matchNumber: 1)), 'WB');
      expect(
        focusBracketBadgeOf(_m(id: 'b', matchNumber: 2, matchType: 'LB')),
        'LB',
      );
      expect(
        focusBracketBadgeOf(_m(id: 'c', matchNumber: 3, matchType: 'Final')),
        'GF',
      );
    });

    test('fase de eliminação simples não ganha sigla', () {
      expect(
        focusBracketBadgeOf(_m(id: 'd', matchNumber: 4, matchType: 'knockout')),
        isNull,
      );
    });
  });

  group('focusDoubleEliminationStandingOf', () {
    test('invicto tem duas vidas e está na chave dos vencedores', () {
      final matches = [
        _m(id: 'a', matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'meu'),
        _m(id: 'b', matchNumber: 2),
      ];

      final standing =
          focusDoubleEliminationStandingOf(matches, 'c1', meu);

      expect(standing.side, FocusBracketSide.winners);
      expect(standing.lives, 2);
    });

    test('uma derrota manda para a repescagem — NÃO elimina', () {
      // A distinção que a tela precisa dizer sem ambiguidade: quem acabou de
      // perder a primeira ainda está no torneio.
      final matches = [
        _m(id: 'a', matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
      ];

      final standing =
          focusDoubleEliminationStandingOf(matches, 'c1', meu);

      expect(standing.side, FocusBracketSide.losers);
      expect(standing.lives, 1);
    });

    test('a segunda derrota elimina', () {
      final matches = [
        _m(id: 'a', matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
        _m(id: 'b', matchNumber: 2, matchType: 'LB',
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
      ];

      final standing =
          focusDoubleEliminationStandingOf(matches, 'c1', meu);

      expect(standing.side, FocusBracketSide.eliminated);
      expect(standing.lives, 0);
    });

    test('conta pelas DERROTAS, não pela chave da próxima partida', () {
      // O atleta perde na WB e a partida da repescagem ainda não foi gerada:
      // ele já está na repescagem mesmo assim.
      final matches = [
        _m(id: 'a', matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
      ];

      expect(
        focusDoubleEliminationStandingOf(matches, 'c1', meu).side,
        FocusBracketSide.losers,
      );
    });

    test('devolve a fase da primeira derrota quando quem chama sabe rotular',
        () {
      final matches = [
        _m(id: 'a', matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
      ];

      final standing = focusDoubleEliminationStandingOf(
        matches,
        'c1',
        meu,
        phaseLabelOf: (_) => 'Quartas',
      );

      expect(standing.lastLossPhase, 'Quartas');
    });

    test('partida de grupo não conta como derrota de chave', () {
      final matches = [
        TournamentMatch(
          id: 'g', tournamentId: 't1', categoryId: 'c1', round: 1,
          matchType: 'group', poolId: 'A', teamAId: 'meu', teamBId: 'rival',
          status: TournamentMatchStatus.completed, resultA: '', resultB: '',
          isGroupMatch: true, matchNumber: 1, winnerId: 'rival',
        ),
      ];

      expect(
        focusDoubleEliminationStandingOf(matches, 'c1', meu).lives,
        2,
      );
    });
  });
}
