import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/organizer/domain/match_ops/match_scoring_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

void main() {
  group('MatchScoringLogic', () {
    test('isSetWon requires advantage', () {
      expect(MatchScoringLogic.isSetWon(21, 19), isTrue);
      expect(MatchScoringLogic.isSetWon(21, 20), isFalse);
      expect(MatchScoringLogic.isSetWon(22, 20), isTrue);
    });

    test('applyPoint increments and detects match winner', () {
      final result = MatchScoringLogic.applyPoint(
        sets: const [TournamentMatchSet(a: 20, b: 18)],
        currentSetIndex: 0,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
      );
      expect(result.sets.first.a, 21);
      expect(result.winnerId, isNull);

      final matchWin = MatchScoringLogic.applyPoint(
        sets: const [
          TournamentMatchSet(a: 21, b: 10),
          TournamentMatchSet(a: 20, b: 18),
        ],
        currentSetIndex: 1,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
      );
      expect(matchWin.winnerId, 'teamA');
    });

    test('setsWon ignores incomplete sets', () {
      // 21×3 vence; 5×2 NÃO é set vencido (não atingiu 21).
      final wins = MatchScoringLogic.setsWon(const [
        TournamentMatchSet(a: 21, b: 3),
        TournamentMatchSet(a: 5, b: 2),
      ]);
      expect(wins.a, 1);
      expect(wins.b, 0);
    });

    test('matchWinnerId requires legally-won sets', () {
      // Placar ilegal "2×0" com segundo set incompleto não fecha a partida.
      final winner = MatchScoringLogic.matchWinnerId(
        sets: const [
          TournamentMatchSet(a: 21, b: 3),
          TournamentMatchSet(a: 5, b: 2),
        ],
        teamAId: 'a',
        teamBId: 'b',
      );
      expect(winner, isNull);

      final legit = MatchScoringLogic.matchWinnerId(
        sets: const [
          TournamentMatchSet(a: 21, b: 3),
          TournamentMatchSet(a: 21, b: 18),
        ],
        teamAId: 'a',
        teamBId: 'b',
      );
      expect(legit, 'a');
    });

    test('decisive set uses tiebreak target of 15', () {
      final winner = MatchScoringLogic.matchWinnerId(
        sets: const [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 19, b: 21),
          TournamentMatchSet(a: 15, b: 12),
        ],
        teamAId: 'a',
        teamBId: 'b',
      );
      expect(winner, 'a');

      // 13×11 no 3º set ainda não fecha (não atingiu 15).
      final notYet = MatchScoringLogic.matchWinnerId(
        sets: const [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 19, b: 21),
          TournamentMatchSet(a: 13, b: 11),
        ],
        teamAId: 'a',
        teamBId: 'b',
      );
      expect(notYet, isNull);
    });

    test('validateQuickScoreSets rejects tied and empty sets', () {
      expect(
        MatchScoringLogic.validateQuickScoreSets(const [
          TournamentMatchSet(a: 0, b: 0),
        ]),
        isFalse,
      );
      expect(
        MatchScoringLogic.validateQuickScoreSets(const [
          TournamentMatchSet(a: 21, b: 19),
          TournamentMatchSet(a: 10, b: 10),
        ]),
        isFalse,
      );
      expect(
        MatchScoringLogic.validateQuickScoreSets(const [
          TournamentMatchSet(a: 21, b: 19),
        ]),
        isTrue,
      );
    });

    group('validateQuickScoreSubmission', () {
      const teamA = 'teamA';
      const teamB = 'teamB';

      QuickScoreValidationResult validate({
        required List<TournamentMatchSet> sets,
        int bestOf = 3,
        bool requireMatchWinner = true,
      }) {
        return MatchScoringLogic.validateQuickScoreSubmission(
          sets: sets,
          bestOf: bestOf,
          teamAId: teamA,
          teamBId: teamB,
          requireMatchWinner: requireMatchWinner,
        );
      }

      test('rejects empty sets list', () {
        final result = validate(sets: const []);
        expect(result.isValid, isFalse);
        expect(result.firstMessage, 'Informe ao menos um set.');
      });

      test('rejects 21×20 without two-point advantage', () {
        final result = validate(sets: const [TournamentMatchSet(a: 21, b: 20)]);
        expect(result.isValid, isFalse);
        expect(
          result.messageForSet(0),
          'Set 1: vitória exige 21 pontos com vantagem de 2.',
        );
      });

      test('rejects 13×11 on decisive set of MD3', () {
        final result = validate(
          sets: const [
            TournamentMatchSet(a: 21, b: 18),
            TournamentMatchSet(a: 19, b: 21),
            TournamentMatchSet(a: 13, b: 11),
          ],
        );
        expect(result.isValid, isFalse);
        expect(
          result.messageForSet(2),
          'Set 3: vitória exige 15 pontos com vantagem de 2.',
        );
      });

      test('rejects incomplete MD3 with only one legal set', () {
        final result = validate(
          sets: const [TournamentMatchSet(a: 21, b: 19)],
        );
        expect(result.isValid, isFalse);
        expect(
          result.firstMessage,
          'Complete o placar: nenhuma dupla venceu ainda.',
        );
      });

      test('accepts valid MD1 21×18', () {
        final result = validate(
          sets: const [TournamentMatchSet(a: 21, b: 18)],
          bestOf: 1,
        );
        expect(result.isValid, isTrue);
      });

      test('accepts valid MD3 21×19 + 21×18', () {
        final result = validate(
          sets: const [
            TournamentMatchSet(a: 21, b: 19),
            TournamentMatchSet(a: 21, b: 18),
          ],
        );
        expect(result.isValid, isTrue);
      });

      test('rejects more sets than bestOf', () {
        final result = validate(
          sets: const [
            TournamentMatchSet(a: 21, b: 19),
            TournamentMatchSet(a: 21, b: 18),
            TournamentMatchSet(a: 15, b: 12),
          ],
          bestOf: 1,
        );
        expect(result.isValid, isFalse);
        expect(result.firstMessage, 'Máximo de 1 sets.');
      });

      test('rejects tied set 10×10', () {
        final result = validate(
          sets: const [TournamentMatchSet(a: 10, b: 10)],
          requireMatchWinner: false,
        );
        expect(result.isValid, isFalse);
        expect(
          result.messageForSet(0),
          'Set 1: não pode terminar empatado.',
        );
      });

      test('rejects score outside 0–99', () {
        final result = validate(
          sets: const [TournamentMatchSet(a: 100, b: 98)],
          requireMatchWinner: false,
        );
        expect(result.isValid, isFalse);
        expect(
          result.messageForSet(0),
          'Set 1: placar fora do intervalo (0–99).',
        );
      });
    });

    test('undoPoint decrements score', () {
      final result = MatchScoringLogic.undoPoint(
        sets: const [TournamentMatchSet(a: 5, b: 3)],
        currentSetIndex: 0,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
      );
      expect(result.sets.first.a, 4);
    });

    test('formatElapsedMmSs pads minutes and seconds', () {
      expect(MatchScoringLogic.formatElapsedMmSs(0), '00:00');
      expect(MatchScoringLogic.formatElapsedMmSs(1450), '24:10');
    });

    test('setPointHint shows remaining points before set point', () {
      expect(
        MatchScoringLogic.setPointHint(18, 16, setIndex: 0),
        'set point em 3',
      );
      expect(
        MatchScoringLogic.setPointHint(20, 19, setIndex: 0),
        'set point em 1',
      );
    });

    test('teamLabelForSide prefers team description', () {
      expect(
        MatchScoringLogic.teamLabelForSide(
          side: 'A',
          teamADescription: 'Marcos / Victor',
          teamBDescription: 'Igor / João',
          teamAId: 'a',
          teamBId: 'b',
        ),
        'Marcos / Victor',
      );
    });

    test('bestOf 1: vitória em um único set conclui a partida', () {
      final result = MatchScoringLogic.applyPoint(
        sets: const [TournamentMatchSet(a: 20, b: 18)],
        currentSetIndex: 0,
        side: 'A',
        teamAId: 'teamA',
        teamBId: 'teamB',
        bestOf: 1,
      );
      expect(result.winnerId, 'teamA');
      expect(result.sets.length, 1);
    });

    test('bestOf 1: set único vai até 21 (sem tiebreak)', () {
      expect(MatchScoringLogic.targetPointsForSet(0, 1),
          MatchScoringLogic.defaultSetPoints);
    });

    group('canReduceBestOf / applyBestOfChange', () {
      test('bloqueia reduzir quando há sets pontuados além do novo formato', () {
        const sets = [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 10, b: 5),
        ];
        expect(MatchScoringLogic.canReduceBestOf(sets, 1), isFalse);
      });

      test('permite reduzir quando sets extras estão vazios', () {
        const sets = [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 0, b: 0),
        ];
        expect(MatchScoringLogic.canReduceBestOf(sets, 1), isTrue);
      });

      test('3→1 conclui quando o set 1 já está decidido', () {
        const sets = [
          TournamentMatchSet(a: 21, b: 18),
          TournamentMatchSet(a: 0, b: 0),
        ];
        final result = MatchScoringLogic.applyBestOfChange(
          sets: sets,
          newBestOf: 1,
          teamAId: 'teamA',
          teamBId: 'teamB',
        );
        expect(result.completed, isTrue);
        expect(result.winnerId, 'teamA');
        expect(result.sets.length, 1);
        expect(result.currentSetIndex, 0);
      });

      test('1→3 não conclui com apenas um set vencido', () {
        const sets = [TournamentMatchSet(a: 21, b: 18)];
        final result = MatchScoringLogic.applyBestOfChange(
          sets: sets,
          newBestOf: 3,
          teamAId: 'teamA',
          teamBId: 'teamB',
        );
        expect(result.completed, isFalse);
        expect(result.winnerId, isNull);
        expect(result.currentSetIndex, 1);
      });
    });

    /// Espelha `needsStartingServe` de `live-scoring.ts` (portais web): quem ABRE o saque é o
    /// único momento que o rally não resolve, e as três mesas têm que perguntar na mesma janela.
    group('needsStartingServe', () {
      bool needs({
        String servingTeamId = '',
        String status = TournamentMatchStatus.scheduled,
        String teamAId = 'teamA',
        String teamBId = 'teamB',
      }) {
        return MatchScoringLogic.needsStartingServe(
          servingTeamId: servingTeamId,
          status: status,
          teamAId: teamAId,
          teamBId: teamBId,
        );
      }

      test('pergunta na partida agendada, antes do primeiro ponto', () {
        expect(needs(), isTrue);
      });

      test('pergunta também com a partida já ao vivo', () {
        expect(needs(status: TournamentMatchStatus.inProgress), isTrue);
      });

      test('cala quando o saque já tem dono', () {
        expect(needs(servingTeamId: 'teamB'), isFalse);
      });

      test('trata saque em branco como sem dono', () {
        expect(needs(servingTeamId: '   '), isTrue);
      });

      test('cala na partida encerrada e na cancelada', () {
        expect(needs(status: TournamentMatchStatus.completed), isFalse);
        expect(needs(status: TournamentMatchStatus.canceled), isFalse);
      });

      test('cala enquanto a chave não definiu os dois lados', () {
        expect(needs(teamBId: ''), isFalse);
        expect(needs(teamAId: ''), isFalse);
      });
    });

    /// Virada de set: pela regra do vôlei de praia o saque ALTERNA a cada set, e quem abre o
    /// set seguinte não é dedutível do placar (o vencedor do último ponto é sempre o vencedor
    /// do set). Então o motor devolve saque vazio ao fechar o set e a faixa "Quem começa
    /// sacando?" — a mesma da abertura — reaparece. Espelha `live-scoring.spec.ts`.
    group('servingTeamId na virada de set', () {
      ({List<TournamentMatchSet> sets, int currentSetIndex, String? winnerId, String servingTeamId})
          point(List<TournamentMatchSet> sets, int idx, String side, {int bestOf = 3}) {
        return MatchScoringLogic.applyPoint(
          sets: sets,
          currentSetIndex: idx,
          side: side,
          teamAId: 'teamA',
          teamBId: 'teamB',
          bestOf: bestOf,
        );
      }

      ({List<TournamentMatchSet> sets, int currentSetIndex, String servingTeamId}) undo(
        List<TournamentMatchSet> sets,
        int idx,
        String side,
      ) {
        return MatchScoringLogic.undoPoint(
          sets: sets,
          currentSetIndex: idx,
          side: side,
          teamAId: 'teamA',
          teamBId: 'teamB',
        );
      }

      test('ponto comum deixa o saque com quem marcou (o rally resolve)', () {
        expect(point(const [TournamentMatchSet(a: 10, b: 8)], 0, 'A').servingTeamId, 'teamA');
      });

      test('esvazia o saque quando o ponto fecha o set e a partida continua', () {
        final r = point(const [TournamentMatchSet(a: 20, b: 15)], 0, 'A');
        expect(r.currentSetIndex, 1);
        expect(r.servingTeamId, '');
      });

      test('esvazia também quando quem fecha o set é a dupla B', () {
        expect(point(const [TournamentMatchSet(a: 15, b: 20)], 0, 'B').servingTeamId, '');
      });

      test('mantém o último sacador quando o ponto ENCERRA a partida', () {
        final r = point(
          const [TournamentMatchSet(a: 21, b: 15), TournamentMatchSet(a: 20, b: 10)],
          1,
          'A',
        );
        expect(r.winnerId, 'teamA');
        expect(r.servingTeamId, 'teamA');
      });

      test('mantém o último sacador no set decisivo de MD3 (fecha em 15 e encerra)', () {
        final r = point(
          const [
            TournamentMatchSet(a: 21, b: 15),
            TournamentMatchSet(a: 10, b: 21),
            TournamentMatchSet(a: 14, b: 9),
          ],
          2,
          'A',
        );
        expect(r.servingTeamId, 'teamA');
      });

      test('set único (bestOf 1) não tem próximo set — mantém quem marcou', () {
        expect(
          point(const [TournamentMatchSet(a: 20, b: 18)], 0, 'A', bestOf: 1).servingTeamId,
          'teamA',
        );
      });

      test('21×20 não fecha o set, então não esvazia o saque', () {
        expect(point(const [TournamentMatchSet(a: 20, b: 20)], 0, 'A').servingTeamId, 'teamA');
      });

      test('undo de ponto no meio do set devolve o saque a quem marcou', () {
        expect(undo(const [TournamentMatchSet(a: 11, b: 8)], 0, 'A').servingTeamId, 'teamA');
      });

      test('undo do ponto que fechou o set reabre o set e devolve o saque a quem marcou', () {
        final r = undo(const [TournamentMatchSet(a: 21, b: 15)], 0, 'A');
        expect(r.sets.first.a, 20);
        expect(r.servingTeamId, 'teamA');
      });

      test('undo do 1º ponto do set seguinte volta pro set fechado e reabre a pergunta', () {
        final r = undo(
          const [TournamentMatchSet(a: 21, b: 15), TournamentMatchSet(a: 1, b: 0)],
          1,
          'A',
        );
        expect(r.currentSetIndex, 0);
        expect(r.servingTeamId, '');
      });
    });
  });
}
