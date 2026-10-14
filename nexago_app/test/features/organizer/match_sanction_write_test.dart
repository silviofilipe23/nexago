import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/data/match_sanction_write.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_sanction.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  TournamentMatch match({
    List<TournamentMatchSet> sets = const [TournamentMatchSet(a: 10, b: 8)],
    String status = TournamentMatchStatus.inProgress,
    List<MatchSanction> sanctions = const [],
  }) {
    return TournamentMatch(
      id: 'm1',
      tournamentId: 't1',
      categoryId: 'c1',
      round: 1,
      matchType: 'semifinal',
      poolId: '',
      teamAId: 'time-a',
      teamBId: 'time-b',
      status: status,
      resultA: '0',
      resultB: '0',
      isGroupMatch: false,
      matchNumber: 1,
      sets: sets,
      currentSetIndex: 0,
      bestOf: 3,
      sanctions: sanctions,
      matchStartedAt: DateTime.utc(2026, 8, 29, 13),
    );
  }

  group('buildSanctionWrite', () {
    test('amarelo só registra: placar intocado, evento sanction', () {
      final write = buildSanctionWrite(
        match(),
        sanctionId: 's1',
        card: MatchSanctionCard.yellow,
        side: 'A',
        playerSlot: 2,
        playerName: 'Ana',
        reason: ' reclamação ',
      )!;

      expect(write.matchUpdate.containsKey('sets'), isFalse);
      expect(write.pointEvent['type'], 'sanction');
      final saved = write.matchUpdate['sanctions'] as List;
      expect(saved, hasLength(1));
      expect((saved.single as Map)['reason'], 'reclamação');
      expect((saved.single as Map)['scoreA'], 10);
    });

    test('vermelho dá o ponto ao ADVERSÁRIO e leva o cartão no evento point',
        () {
      final write = buildSanctionWrite(
        match(),
        sanctionId: 's1',
        card: MatchSanctionCard.red,
        side: 'A',
        playerSlot: 1,
        playerName: 'Ana',
      )!;

      expect(write.pointEvent['type'], 'point');
      expect(write.pointEvent['side'], 'B');
      expect(write.pointEvent['penalty'], isTrue);
      expect(write.pointEvent['scoreB'], 9);
      expect(write.pointEvent['scoreA'], 10);
      expect(write.matchUpdate['servingTeamId'], 'time-b');
      final saved = write.matchUpdate['sanctions'] as List;
      expect((saved.single as Map)['card'], 'red');
      // O cartão guarda o placar de ANTES da penalidade.
      expect((saved.single as Map)['scoreB'], 8);
    });

    test('vermelho que fecha o set/partida propaga o vencedor', () {
      final write = buildSanctionWrite(
        match(sets: const [TournamentMatchSet(a: 20, b: 20)]),
        sanctionId: 's1',
        card: MatchSanctionCard.red,
        side: 'A',
        playerSlot: 1,
        playerName: 'Ana',
      )!;
      expect(write.pointEvent['scoreB'], 21);
    });

    test('mantém os cartões anteriores', () {
      final first = MatchSanction(
        id: 'old',
        card: MatchSanctionCard.yellow,
        side: 'B',
        playerSlot: 1,
        playerName: 'Bia',
        setIndex: 0,
        scoreA: 1,
        scoreB: 1,
        at: DateTime.utc(2026, 8, 29, 13, 5),
      );
      final write = buildSanctionWrite(
        match(sanctions: [first]),
        sanctionId: 's2',
        card: MatchSanctionCard.yellow,
        side: 'A',
        playerSlot: 1,
        playerName: 'Ana',
      )!;
      expect((write.matchUpdate['sanctions'] as List), hasLength(2));
    });

    test('partida encerrada não aceita cartão', () {
      expect(
        buildSanctionWrite(
          match(status: TournamentMatchStatus.completed),
          sanctionId: 's1',
          card: MatchSanctionCard.red,
          side: 'A',
          playerSlot: 1,
          playerName: 'Ana',
        ),
        isNull,
      );
    });
  });

  group('buildSanctionRemovalWrite', () {
    final sanction = MatchSanction(
      id: 's1',
      card: MatchSanctionCard.red,
      side: 'A',
      playerSlot: 1,
      playerName: 'Ana',
      setIndex: 0,
      scoreA: 10,
      scoreB: 8,
      at: DateTime.utc(2026, 8, 29, 13, 5),
    );

    test('tira só o cartão, sem mexer no placar', () {
      final write = buildSanctionRemovalWrite(
        match(sanctions: [sanction]),
        's1',
      )!;
      expect(write.matchUpdate['sanctions'], isEmpty);
      expect(write.matchUpdate.containsKey('sets'), isFalse);
      expect(write.pointEvent['type'], 'sanction-removed');
    });

    test('id que já não existe devolve null', () {
      expect(buildSanctionRemovalWrite(match(), 's1'), isNull);
    });
  });

  test('MatchSanction faz round-trip pelo mapa do Firestore', () {
    final original = MatchSanction(
      id: 's1',
      card: MatchSanctionCard.red,
      side: 'B',
      playerSlot: 2,
      playerName: 'Bia',
      setIndex: 1,
      scoreA: 3,
      scoreB: 4,
      reason: 'x',
      at: DateTime.utc(2026, 8, 29, 13),
    );
    final back = MatchSanction.fromMap(original.toMap())!;
    expect(back.card, MatchSanctionCard.red);
    expect(back.playerName, 'Bia');
    expect(back.at!.isAtSameMomentAs(DateTime.utc(2026, 8, 29, 13)), isTrue);
    expect(MatchSanction.fromMap({'card': 'azul', 'id': 'x', 'side': 'A'}),
        isNull);
  });
}
