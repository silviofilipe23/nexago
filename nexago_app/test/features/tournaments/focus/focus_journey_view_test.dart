import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_journey_view.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_views_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_set.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _m({
  required String id,
  int round = 1,
  int matchNumber = 1,
  String teamAId = 'meu',
  String teamBId = 'rival',
  String poolId = '',
  String matchType = 'knockout',
  String status = TournamentMatchStatus.scheduled,
  String? winnerId,
  String? courtName,
  DateTime? scheduleTime,
  List<TournamentMatchSet> sets = const [],
  String? winnerAdvanceSlot,
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
    courtName: courtName,
    scheduleTime: scheduleTime,
    sets: sets,
    winnerAdvanceSlot: winnerAdvanceSlot,
  );
}

FocusViewContext _ctx(List<TournamentMatch> matches, {TournamentMatch? next}) {
  return FocusViewContext(
    matches: matches,
    myTeamIds: const {'meu'},
    duoNameOf: (teamId, [fallback]) =>
        teamId.isEmpty ? (fallback ?? 'A definir') : teamId,
    standingsOf: (_) => const [],
    nextMatch: next,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  const meu = {'meu'};

  group('journeyHeadlineOf', () {
    test('null some — não vira chute', () {
      expect(journeyHeadlineOf(null), isNull);
    });

    test('zero é campeão, não "0 vitórias"', () {
      expect(journeyHeadlineOf(0)!.kind, JourneyHeadlineKind.champion);
    });

    test('singular e plural', () {
      expect(journeyHeadlineOf(1)!.text, '1 vitória até o título.');
      expect(journeyHeadlineOf(3)!.text, '3 vitórias até o título.');
    });
  });

  group('bestPossiblePlaceOf', () {
    test('quem está na final termina no máximo em 2º', () {
      expect(bestPossiblePlaceOf(1), 2);
      expect(bestPossiblePlaceOf(2), 4);
      expect(bestPossiblePlaceOf(0), 1);
    });
  });

  group('bracketWorstPlaceOf', () {
    test('eliminado nas quartas tem colocação, mesmo sem caminho ao título',
        () {
      // É a diferença que justifica esta função existir: `winsToTitleOf` daria
      // null aqui, e o prêmio garantido sumiria.
      final matches = [
        _m(id: 'quartas', round: 1, matchNumber: 1,
            status: TournamentMatchStatus.completed, winnerId: 'rival'),
        _m(id: 'semi', round: 2, matchNumber: 5, teamAId: '', teamBId: ''),
        _m(id: 'final', round: 3, matchNumber: 7, teamAId: '', teamBId: '',
            matchType: 'Final'),
      ];

      expect(
        bracketWorstPlaceOf(matches, 'c1', meu, isDoubleElimination: false),
        8,
      );
    });

    test('campeão é 1º', () {
      final matches = [
        _m(id: 'final', round: 1, matchNumber: 1, matchType: 'Final',
            status: TournamentMatchStatus.completed, winnerId: 'meu'),
      ];

      expect(
        bracketWorstPlaceOf(matches, 'c1', meu, isDoubleElimination: false),
        1,
      );
    });

    test('dupla eliminação não tem régua — devolve null', () {
      final matches = [
        _m(id: 'wb', round: 1, matchNumber: 1, matchType: 'winners'),
      ];

      expect(
        bracketWorstPlaceOf(matches, 'c1', meu, isDoubleElimination: true),
        isNull,
      );
    });
  });

  group('journeyStepsOf', () {
    test('sets aparecem sob a ótica do atleta quando ele é o lado B', () {
      final jogada = _m(
        id: 'j',
        teamAId: 'rival',
        teamBId: 'meu',
        poolId: 'A',
        status: TournamentMatchStatus.completed,
        winnerId: 'meu',
        sets: const [TournamentMatchSet(a: 15, b: 21)],
      );
      final ctx = _ctx([jogada]);

      final [step] = journeyStepsOf(
        ctx,
        journeyPathOf([jogada], 'c1', meu),
        null,
        null,
      );

      expect(step.status, JourneyStepStatus.win);
      expect(step.detailLabel, '21-15');
      expect(step.scoreLabel, '1 – 0');
    });

    test('sem set jogado o placar é "vs"', () {
      final futura = _m(id: 'f', poolId: 'A');
      final ctx = _ctx([futura]);

      final [step] = journeyStepsOf(
        ctx,
        journeyPathOf([futura], 'c1', meu),
        null,
        null,
      );

      expect(step.scoreLabel, 'vs');
    });

    test('quadra com número vira "Q3"; com nome sai inteira', () {
      final comNumero = _m(
        id: 'a',
        poolId: 'A',
        courtName: 'Quadra 3',
        scheduleTime: DateTime(2026, 8, 20, 9),
      );
      final comNome = _m(id: 'b', poolId: 'A', matchNumber: 2,
          courtName: 'Central');

      final steps = journeyStepsOf(
        _ctx([comNumero, comNome]),
        journeyPathOf([comNumero, comNome], 'c1', meu),
        null,
        null,
      );

      expect(steps[0].metaLabel, contains('Q3'));
      expect(steps[1].metaLabel, 'Central');
    });

    test('fases sem dono viram UMA linha por rodada, não uma por partida', () {
      // Duas partidas do mesmo round sem dono: o trilho é a linha do tempo do
      // atleta, não a lista de jogos das outras duplas.
      final minha = _m(id: 'minha', round: 1, matchNumber: 1);
      final semDonoA =
          _m(id: 'x', round: 2, matchNumber: 5, teamAId: '', teamBId: '');
      final semDonoB =
          _m(id: 'y', round: 2, matchNumber: 6, teamAId: '', teamBId: '');
      final matches = [minha, semDonoA, semDonoB];

      final steps = journeyStepsOf(
        _ctx(matches),
        journeyPathOf(matches, 'c1', meu),
        null,
        null,
      );

      expect(steps.length, 2);
      expect(steps[1].id, 'fase-2');
      expect(steps[1].opponentName, 'A definir');
    });

    test('mata-mata sem adversário durante os grupos diz de onde ele sai', () {
      final grupoPendente = _m(id: 'g', poolId: 'A', matchNumber: 1);
      final ko = _m(id: 'k', round: 2, matchNumber: 9, teamBId: '');
      final matches = [grupoPendente, ko];

      final steps = journeyStepsOf(
        _ctx(matches),
        journeyPathOf(matches, 'c1', meu),
        null,
        null,
      );

      final koStep = steps.firstWhere((s) => s.id == 'k');
      expect(koStep.detailLabel, 'sai ao fim dos grupos');
    });

    test('caminho feliz da dupla eliminação entra a partir do segundo', () {
      final atual = _m(id: 'atual', round: 1, matchNumber: 1,
          winnerAdvanceSlot: 'A');
      final proxima = _m(id: 'prox', round: 2, matchNumber: 5,
          teamAId: '', teamBId: 'adversario');
      final matches = [atual, proxima];

      final steps = journeyStepsOf(
        _ctx(matches),
        journeyPathOf(matches, 'c1', meu),
        null,
        null,
        happyPath: [atual, proxima],
      );

      // A do atleta + a seguinte do caminho feliz; o adversário sai do slot
      // que sobra (o atleta cai em A, então o rival é o lado B).
      expect(steps.length, 2);
      expect(steps[1].opponentName, 'adversario');
      expect(steps[1].matchId, isNull);
    });
  });
}
