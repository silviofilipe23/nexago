import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/match_point_write.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// A escrita do ponto é função PURA do doc da partida — é o que permite montá-la dentro da
/// transação, sobre a versão que o servidor acabou de entregar, em vez de sobre o snapshot que a
/// tela tem em mãos (ver `recordPointTransaction`).
void main() {
  TournamentMatch match({
    List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 14, b: 12)],
    int? currentSetIndex = 0,
    String status = TournamentMatchStatus.inProgress,
    int bestOf = 3,
  }) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 2,
      matchType: 'semifinal',
      poolId: '',
      teamAId: 'time-a',
      teamBId: 'time-b',
      status: status,
      resultA: '0',
      resultB: '0',
      isGroupMatch: false,
      matchNumber: 7,
      sets: sets,
      currentSetIndex: currentSetIndex,
      bestOf: bestOf,
      matchStartedAt: DateTime.utc(2026, 8, 29, 13),
    );
  }

  /// Commit no doc: aplica ao match o que a transação escreveu. É o papel do servidor entre um
  /// toque e o seguinte.
  TournamentMatch commit(TournamentMatch previous, MatchPointWrite write) {
    final rawSets = write.matchUpdate['sets'] as List<dynamic>;
    return TournamentMatch(
      id: previous.id,
      tournamentId: previous.tournamentId,
      categoryId: previous.categoryId,
      round: previous.round,
      matchType: previous.matchType,
      poolId: previous.poolId,
      teamAId: previous.teamAId,
      teamBId: previous.teamBId,
      status: write.matchUpdate['status'] as String,
      resultA: write.matchUpdate['resultA'] as String,
      resultB: write.matchUpdate['resultB'] as String,
      isGroupMatch: previous.isGroupMatch,
      matchNumber: previous.matchNumber,
      sets: rawSets
          .map((s) => TournamentMatchSet.fromMap(s as Map<String, dynamic>))
          .toList(),
      currentSetIndex: write.matchUpdate['currentSetIndex'] as int,
      bestOf: previous.bestOf,
      matchStartedAt: previous.matchStartedAt,
    );
  }

  group('buildPointWrite', () {
    test('grava o placar JÁ com o ponto somado, no set do doc', () {
      final write = buildPointWrite(match(), 'A')!;

      expect(write.pointEvent['type'], 'point');
      expect(write.pointEvent['side'], 'A');
      expect(write.pointEvent['setIndex'], 0);
      expect(write.pointEvent['scoreA'], 15);
      expect(write.pointEvent['scoreB'], 12);
      expect(write.matchUpdate['status'], TournamentMatchStatus.inProgress);
    });

    test(
      'duas escritas seguidas andam o placar duas vezes — cada uma parte do doc já comitado',
      () {
        // É a corrida real da mesa: dois toques dentro da janela em que o listener ainda não
        // recebeu a versão nova. Montando a escrita a partir do doc, o segundo ponto parte de
        // 15×12 mesmo que a tela ainda mostre 14×12.
        final first = buildPointWrite(match(), 'A')!;
        final second = buildPointWrite(commit(match(), first), 'A')!;

        expect(first.pointEvent['scoreA'], 15);
        expect(second.pointEvent['scoreA'], 16);
        expect(second.pointEvent['scoreB'], 12);

        final placar = commit(commit(match(), first), second).sets.first;
        expect(placar.a, 16);
        expect(placar.b, 12);
      },
    );

    test('o ponto que fecha a partida grava Completed + winnerId', () {
      final write = buildPointWrite(
        match(
          sets: const [
            TournamentMatchSet(a: 21, b: 15),
            TournamentMatchSet(a: 20, b: 10),
          ],
          currentSetIndex: 1,
        ),
        'A',
      )!;

      expect(write.matchUpdate['status'], TournamentMatchStatus.completed);
      expect(write.matchUpdate['winnerId'], 'time-a');
      expect(write.matchUpdate['resultA'], '2');
      expect(write.result.winnerId, 'time-a');
    });

    test('partida já encerrada no doc recusa o ponto', () {
      final write = buildPointWrite(
        match(status: TournamentMatchStatus.completed),
        'A',
      );

      expect(write, isNull);
    });

    test('currentSetIndex fora da faixa do formato não estoura o set do evento', () {
      final write = buildPointWrite(
        match(sets: const [TournamentMatchSet(a: 3, b: 1)], currentSetIndex: 9),
        'B',
      )!;

      expect(write.pointEvent['setIndex'], 2);
      expect(write.pointEvent['scoreB'], greaterThan(0));
    });
  });

  group('buildUndoWrite', () {
    test('tira o ponto do lado que marcou e limpa vencedor', () {
      final write = buildUndoWrite(match(), 'B', 0);

      expect(write.pointEvent['type'], 'undo-point');
      expect(write.pointEvent['scoreA'], 14);
      expect(write.pointEvent['scoreB'], 11);
      expect(write.matchUpdate['status'], TournamentMatchStatus.inProgress);
    });
  });
}
