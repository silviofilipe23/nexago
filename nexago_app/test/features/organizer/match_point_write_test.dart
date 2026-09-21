import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/match_point_write.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_medical_timeout.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_serving_players.dart';
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
    String servingTeamId = '',
    MatchServingPlayers servingPlayers = MatchServingPlayers.none,
    MatchMedicalTimeout? medicalTimeout,
    List<String> medicalTimeoutPlayers = const [],
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
      servingTeamId: servingTeamId,
      servingPlayers: servingPlayers,
      medicalTimeout: medicalTimeout,
      medicalTimeoutPlayers: medicalTimeoutPlayers,
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

  group('sacador dentro da dupla', () {
    test('o ponto carrega a posição do sacador junto com o saque', () {
      // B com o saque e o atleta 1 na vez; A marca e leva o saque — A ainda não declarou a
      // ordem dela, então a posição volta a "não declarada" e a mesa vai perguntar.
      final write = buildPointWrite(
        match(
          servingTeamId: 'time-b',
          servingPlayers: const MatchServingPlayers(a: 0, b: 1),
        ),
        'A',
      )!;

      expect(write.matchUpdate['servingTeamId'], 'time-a');
      expect(write.matchUpdate['servingPlayerSlot'], 0);
      expect(write.matchUpdate['servingPlayerSlots'], {'A': 0, 'B': 1});
    });

    test('o saque que VOLTA pra dupla vai pro parceiro de quem sacou por último', () {
      final write = buildPointWrite(
        match(
          servingTeamId: 'time-b',
          servingPlayers: const MatchServingPlayers(a: 1, b: 1),
        ),
        'A',
      )!;

      expect(write.matchUpdate['servingPlayerSlot'], 2);
      expect(write.matchUpdate['servingPlayerSlots'], {'A': 2, 'B': 1});
    });

    test('a virada de set zera a ordem das duas duplas', () {
      final write = buildPointWrite(
        match(
          sets: const [TournamentMatchSet(a: 20, b: 12)],
          servingTeamId: 'time-a',
          servingPlayers: const MatchServingPlayers(a: 1, b: 2),
        ),
        'A',
      )!;

      expect(write.matchUpdate['servingTeamId'], '');
      expect(write.matchUpdate['servingPlayerSlot'], 0);
      expect(write.matchUpdate['servingPlayerSlots'], {'A': 0, 'B': 0});
    });

    test('"Trocar saque" reaponta o sacador da dupla que recebe o saque', () {
      final fields = servingTeamFields(
        match(
          servingTeamId: 'time-a',
          servingPlayers: const MatchServingPlayers(a: 1, b: 2),
        ),
        'time-b',
      );

      expect(fields, {'servingTeamId': 'time-b', 'servingPlayerSlot': 2});
    });

    test('declarar o sacador grava a ordem da dupla e a posição atual', () {
      final fields = servingPlayerFields(
        match(servingTeamId: 'time-a'),
        'A',
        2,
      );

      expect(fields['servingPlayerSlots'], {'A': 2, 'B': 0});
      expect(fields['servingPlayerSlot'], 2);
    });
  });

  group('tempo médico', () {
    test('abre o atendimento, queima a cota do atleta e registra o chamado', () {
      final write = buildMedicalTimeoutStartWrite(
        match(sets: const [TournamentMatchSet(a: 14, b: 12)]),
        side: 'A',
        playerSlot: 2,
        playerName: 'Lucas',
      )!;

      final timeout = write.matchUpdate['medicalTimeout'] as Map<String, dynamic>;
      expect(timeout['side'], 'A');
      expect(timeout['teamId'], 'time-a');
      expect(timeout['playerSlot'], 2);
      expect(timeout['playerName'], 'Lucas');
      expect(timeout['durationSec'], medicalTimeoutSeconds);
      expect(write.matchUpdate['medicalTimeoutPlayers'], ['A2']);
      expect(
        write.pointEvent,
        containsPair('type', 'medical-timeout'),
      );
      expect(write.pointEvent['scoreA'], 14);
      expect(write.pointEvent['scoreB'], 12);
      // O atendimento não mexe no placar nem no saque.
      expect(write.matchUpdate.containsKey('sets'), isFalse);
      expect(write.matchUpdate.containsKey('servingTeamId'), isFalse);
    });

    test('nega o segundo atendimento do mesmo atleta', () {
      expect(
        buildMedicalTimeoutStartWrite(
          match(medicalTimeoutPlayers: const ['A2']),
          side: 'A',
          playerSlot: 2,
          playerName: 'Lucas',
        ),
        isNull,
      );
    });

    test('nega qualquer atendimento com outro em andamento, e em partida encerrada', () {
      final active = MatchMedicalTimeout(
        side: 'A',
        teamId: 'time-a',
        playerSlot: 1,
        playerName: 'Bruno',
        startedAt: DateTime.utc(2026, 8, 29, 13),
        durationSec: medicalTimeoutSeconds,
        setIndex: 0,
      );

      expect(
        buildMedicalTimeoutStartWrite(
          match(medicalTimeout: active),
          side: 'B',
          playerSlot: 1,
          playerName: 'Carla',
        ),
        isNull,
      );
      expect(
        buildMedicalTimeoutStartWrite(
          match(status: TournamentMatchStatus.completed),
          side: 'B',
          playerSlot: 1,
          playerName: 'Carla',
        ),
        isNull,
      );
    });

    test('encerrar tira o atendimento do doc e registra o fim — a cota não volta', () {
      final active = MatchMedicalTimeout(
        side: 'B',
        teamId: 'time-b',
        playerSlot: 1,
        playerName: 'Carla',
        startedAt: DateTime.utc(2026, 8, 29, 13),
        durationSec: medicalTimeoutSeconds,
        setIndex: 0,
      );

      final write = buildMedicalTimeoutEndWrite(
        match(medicalTimeout: active, medicalTimeoutPlayers: const ['B1']),
      )!;

      expect(write.matchUpdate.keys, ['medicalTimeout']);
      expect(write.pointEvent['type'], 'medical-timeout-end');
      expect(write.pointEvent['side'], 'B');
      expect(write.matchUpdate.containsKey('medicalTimeoutPlayers'), isFalse);
    });

    test('sem atendimento em andamento não há o que encerrar', () {
      expect(buildMedicalTimeoutEndWrite(match()), isNull);
    });
  });
}
