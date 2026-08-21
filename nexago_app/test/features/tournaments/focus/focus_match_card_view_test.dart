import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_match_card_view.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_card_row.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String status = TournamentMatchStatus.scheduled,
  String courtName = '',
  String poolId = '',
  bool isGroupMatch = false,
  String matchType = 'bracket',
  List<TournamentMatchSet> sets = const [],
  int? currentSetIndex,
}) {
  return TournamentMatch(
    id: 'm1',
    tournamentId: 't1',
    categoryId: 'c1',
    round: 1,
    matchType: matchType,
    poolId: poolId,
    teamAId: 'a',
    teamBId: 'b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: 14,
    courtName: courtName,
    sets: sets,
    currentSetIndex: currentSetIndex,
  );
}

void main() {
  group('focusMatchCourtShortLabel', () {
    test('quadra numerada abrevia para Q + número', () {
      // "Quadra 3" inteiro não cabe ao lado da categoria e do grupo, que é o
      // que a linha de contexto do card carrega.
      expect(focusMatchCourtShortLabel(_match(courtName: '3')), 'Q3');
      expect(focusMatchCourtShortLabel(_match(courtName: 'Quadra 3')), 'Q3');
      expect(focusMatchCourtShortLabel(_match(courtName: ' QUADRA 12 ')), 'Q12');
    });

    test('quadra com nome próprio fica como está', () {
      // "QCentral" não é abreviação, é ruído.
      expect(focusMatchCourtShortLabel(_match(courtName: 'Central')), 'Central');
    });

    test('sem quadra, string vazia', () {
      expect(focusMatchCourtShortLabel(_match()), '');
    });
  });

  group('focusMatchCardContext', () {
    test('grupo e quadra, na ordem do protótipo', () {
      final label = focusMatchCardContext(
        match: _match(
          poolId: 'B',
          isGroupMatch: true,
          matchType: 'group',
          courtName: '3',
        ),
      );

      expect(label, 'Grupo B · Q3');
    });

    test('com categoria, ela abre a linha', () {
      // Na Arena a lista é do torneio inteiro: sem a categoria o card não diz
      // de que jogo se trata.
      final label = focusMatchCardContext(
        match: _match(
          poolId: 'B',
          isGroupMatch: true,
          matchType: 'group',
          courtName: '3',
        ),
        categoryName: 'Misto B',
      );

      expect(label, 'Misto B · Grupo B · Q3');
    });

    test('sem quadra definida, a linha não fica com separador solto', () {
      final label = focusMatchCardContext(
        match: _match(poolId: 'A', isGroupMatch: true, matchType: 'group'),
        categoryName: 'Misto B',
      );

      expect(label, 'Misto B · Grupo A');
    });

    test('mata-mata mostra a fase no lugar do grupo', () {
      final label = focusMatchCardContext(
        match: _match(matchType: 'knockout', courtName: '1'),
      );

      expect(label, endsWith(' · Q1'));
      expect(label, isNot(startsWith('·')));
    });
  });

  group('focusMatchCardScoreOf', () {
    test('ao vivo: sets vencidos no centro e o set em andamento embaixo', () {
      // O número grande é SETS, não pontos: "1-0" com "2° SET 14-11" embaixo.
      final score = focusMatchCardScoreOf(
        _match(
          status: TournamentMatchStatus.inProgress,
          sets: const [
            TournamentMatchSet(a: 21, b: 15),
            TournamentMatchSet(a: 14, b: 11),
          ],
          currentSetIndex: 1,
        ),
        TournamentMatchRowState.live,
      );

      expect(score.center, '1-0');
      expect(score.detail, '2° SET 14-11');
    });

    test('encerrada: sets vencidos no centro e as parciais embaixo', () {
      final score = focusMatchCardScoreOf(
        _match(
          status: TournamentMatchStatus.completed,
          sets: const [
            TournamentMatchSet(a: 21, b: 14),
            TournamentMatchSet(a: 21, b: 18),
          ],
        ),
        TournamentMatchRowState.done,
      );

      expect(score.center, '2-0');
      expect(score.detail, '21-14 · 21-18');
    });

    test('agendada: "vs" e nada embaixo', () {
      // O horário vive no selo à esquerda; repetir aqui seria dizer duas vezes.
      final score = focusMatchCardScoreOf(
        _match(),
        TournamentMatchRowState.scheduled,
      );

      expect(score.center, 'vs');
      expect(score.detail, isNull);
    });

    test('cancelada: travessão, não "vs"', () {
      // "vs" prometeria um jogo que não vai acontecer.
      final score = focusMatchCardScoreOf(
        _match(status: TournamentMatchStatus.canceled),
        TournamentMatchRowState.canceled,
      );

      expect(score.center, '—');
      expect(score.detail, isNull);
    });

    test('ao vivo sem set aberto: centro sem linha de detalhe', () {
      final score = focusMatchCardScoreOf(
        _match(status: TournamentMatchStatus.inProgress),
        TournamentMatchRowState.live,
      );

      expect(score.center, '0-0');
      expect(score.detail, isNull);
    });
  });
}
