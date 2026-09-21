import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_serving_player_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_serving_players.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

/// Espelhados em `live-scoring.spec.ts` (mesas web): o rodízio de saque dentro da dupla tem
/// que virar igual nas três mesas, porque o mesário opera pelas três.
void main() {
  const teamAId = 'time-a';
  const teamBId = 'time-b';

  MatchServingPlayers slots(int a, int b) => MatchServingPlayers(a: a, b: b);

  MatchServingPlayers after(
    MatchServingPlayers current,
    String previous,
    String next,
  ) {
    return MatchServingPlayerLogic.slotsAfterScore(
      slots: current,
      previousServingTeamId: previous,
      nextServingTeamId: next,
      teamAId: teamAId,
      teamBId: teamBId,
    );
  }

  group('MatchServingPlayerLogic.slotsAfterScore', () {
    test('mantém o sacador enquanto a MESMA dupla segue sacando', () {
      expect(after(slots(1, 2), teamAId, teamAId), slots(1, 2));
    });

    test('vira pro parceiro quando o saque VOLTA pra dupla', () {
      expect(after(slots(1, 1), teamAId, teamBId), slots(1, 2));
      expect(after(slots(1, 2), teamBId, teamAId), slots(2, 2));
    });

    test('não vira a dupla que ainda não sacou neste set', () {
      expect(after(slots(1, 0), teamAId, teamBId), slots(1, 0));
    });

    test('zera a ordem na virada de set — cada set declara a dele', () {
      expect(after(slots(2, 1), teamAId, ''), MatchServingPlayers.none);
    });

    test('a abertura do saque não vira nada: quem declara é o mesário', () {
      expect(after(slots(0, 0), '', teamAId), slots(0, 0));
      expect(after(slots(1, 0), '', teamAId), slots(1, 0));
    });
  });

  group('MatchServingPlayerLogic.slotsAfterUndo', () {
    test('não reconstrói a ordem — o evento da timeline não guarda o saque', () {
      expect(
        MatchServingPlayerLogic.slotsAfterUndo(
          slots: slots(1, 2),
          nextServingTeamId: teamBId,
        ),
        slots(1, 2),
      );
    });

    test('zera quando o desfazer volta pra um set já fechado', () {
      expect(
        MatchServingPlayerLogic.slotsAfterUndo(
          slots: slots(1, 2),
          nextServingTeamId: '',
        ),
        MatchServingPlayers.none,
      );
    });
  });

  group('MatchServingPlayerLogic.servingPlayerSlot', () {
    test('sai do lado que está com o saque', () {
      expect(
        MatchServingPlayerLogic.servingPlayerSlot(
          slots: slots(1, 2),
          servingTeamId: teamBId,
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        2,
      );
    });

    test('sem dupla no saque (ou com id estranho) não há atleta no saque', () {
      expect(
        MatchServingPlayerLogic.servingPlayerSlot(
          slots: slots(1, 2),
          servingTeamId: '',
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        0,
      );
      expect(
        MatchServingPlayerLogic.servingPlayerSlot(
          slots: slots(1, 2),
          servingTeamId: 'outro-time',
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        0,
      );
    });
  });

  group('MatchServingPlayerLogic.swappedSlots', () {
    test('só mexe no lado que está sacando, e só se ele já declarou', () {
      expect(
        MatchServingPlayerLogic.swappedSlots(
          slots: slots(1, 2),
          servingTeamId: teamAId,
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        slots(2, 2),
      );
      expect(
        MatchServingPlayerLogic.swappedSlots(
          slots: slots(0, 2),
          servingTeamId: teamAId,
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        slots(0, 2),
      );
      expect(
        MatchServingPlayerLogic.swappedSlots(
          slots: slots(1, 2),
          servingTeamId: '',
          teamAId: teamAId,
          teamBId: teamBId,
        ),
        slots(1, 2),
      );
    });
  });

  group('MatchServingPlayerLogic.needsServingPlayer', () {
    bool needs({
      required String servingTeamId,
      required int slot,
      String status = TournamentMatchStatus.inProgress,
      String a = teamAId,
      String b = teamBId,
    }) {
      return MatchServingPlayerLogic.needsServingPlayer(
        servingTeamId: servingTeamId,
        servingPlayerSlot: slot,
        status: status,
        teamAId: a,
        teamBId: b,
      );
    }

    test('pergunta quando a dupla no saque ainda não declarou a ordem', () {
      expect(needs(servingTeamId: teamBId, slot: 0), isTrue);
    });

    test('espera a pergunta da DUPLA — duas faixas juntas viram ruído', () {
      expect(needs(servingTeamId: '', slot: 0), isFalse);
    });

    test('cala com o sacador definido', () {
      expect(needs(servingTeamId: teamAId, slot: 1), isFalse);
      expect(needs(servingTeamId: teamAId, slot: 2), isFalse);
    });

    test('cala em partida encerrada/cancelada e sem os dois lados', () {
      expect(
        needs(
          servingTeamId: teamAId,
          slot: 0,
          status: TournamentMatchStatus.completed,
        ),
        isFalse,
      );
      expect(
        needs(
          servingTeamId: teamAId,
          slot: 0,
          status: TournamentMatchStatus.canceled,
        ),
        isFalse,
      );
      expect(needs(servingTeamId: teamAId, slot: 0, b: ''), isFalse);
    });
  });
}
