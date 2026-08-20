import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_views_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_group_standings_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  required String id,
  String teamAId = 'meu',
  String teamBId = 'rival',
  String poolId = 'A',
  String status = TournamentMatchStatus.scheduled,
  int round = 1,
  int matchNumber = 1,
  String? winnerId,
  DateTime? scheduleTime,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: round,
    matchType: poolId.isEmpty ? 'knockout' : 'group',
    poolId: poolId,
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: poolId.isNotEmpty,
    matchNumber: matchNumber,
    winnerId: winnerId,
    scheduleTime: scheduleTime,
  );
}

TournamentPoolStandingsRow _row(
  int rank,
  String teamId, {
  int wins = 0,
  int losses = 0,
}) {
  return TournamentPoolStandingsRow(
    rank: rank,
    teamId: teamId,
    displayName: teamId,
    wins: wins,
    losses: losses,
    setsWon: 0,
    setsLost: 0,
    points: wins * 3,
    qualifies: rank <= 2,
    isAthleteTeam: teamId == 'meu',
  );
}

FocusViewContext _ctx({
  required List<TournamentMatch> matches,
  TournamentMatch? nextMatch,
  Map<String, List<TournamentPoolStandingsRow>> standings = const {},
}) {
  return FocusViewContext(
    matches: matches,
    myTeamIds: const {'meu'},
    duoNameOf: (teamId, [fallback]) => fallback ?? teamId,
    standingsOf: (poolId) => standings[poolId] ?? const [],
    nextMatch: nextMatch,
  );
}

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR', null);
  });

  group('ordinalOf', () {
    test('formata a posição em português', () {
      expect(ordinalOf(1), '1º');
      expect(ordinalOf(4), '4º');
    });
  });

  group('timelineOf', () {
    test('devolve time nulo sem horário e marca a próxima', () {
      final proxima = _match(
        id: 'prox',
        scheduleTime: DateTime(2026, 8, 20, 15),
      );
      final semHorario = _match(id: 'sem', matchNumber: 2);
      final ctx = _ctx(
        matches: [proxima, semHorario],
        nextMatch: proxima,
      );

      final entries = timelineOf(ctx, [proxima, semHorario]);

      expect(entries[0].time, isNotNull);
      expect(entries[0].state, TimelineState.next);
      expect(entries[1].time, isNull);
      expect(entries[1].state, TimelineState.upcoming);
    });

    test('partida encerrada traz o resultado sob a ótica do atleta', () {
      final vencida = _match(
        id: 'v',
        status: TournamentMatchStatus.completed,
        winnerId: 'meu',
        scheduleTime: DateTime(2026, 8, 20, 9),
      );
      final ctx = _ctx(matches: [vencida]);

      final [entry] = timelineOf(ctx, [vencida]);

      expect(entry.state, TimelineState.done);
      expect(entry.outcome, TimelineOutcome.win);
    });

    test('sem adversário definido a linha não é clicável', () {
      final slot = _match(id: 'slot', teamBId: '', poolId: '');
      final ctx = _ctx(matches: [slot]);

      final [entry] = timelineOf(ctx, [slot]);

      expect(entry.clickable, isFalse);
    });
  });

  group('standingLineOf', () {
    test('devolve "1º do grupo · 2V 0D"', () {
      final ctx = _ctx(
        matches: const [],
        standings: {
          'A': [_row(1, 'meu', wins: 2)],
        },
      );

      expect(standingLineOf(ctx, 'meu', 'A'), '1º do grupo · 2V 0D');
    });

    test('devolve null para time fora do grupo', () {
      final ctx = _ctx(matches: const [], standings: const {'A': []});
      expect(standingLineOf(ctx, 'ninguem', 'A'), isNull);
    });
  });

  group('qualificationNoteOf', () {
    test('grupo em aberto informa a posição e o que falta, sem afirmar avanço',
        () {
      final matches = [
        _match(
          id: 'jogada',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
        _match(id: 'pendente', matchNumber: 2),
      ];
      final ctx = _ctx(
        matches: matches,
        standings: {
          'A': [_row(1, 'meu', wins: 1), _row(2, 'rival')],
        },
      );

      final note = qualificationNoteOf(ctx, 'A', 2, 'meu');

      expect(note!.text, contains('Falta 1 partida no grupo'));
      expect(note.text, isNot(contains('avançou')));
      expect(note.tone, QualificationTone.neutral);
    });

    test('grupo encerrado e classificado afirma o avanço', () {
      final matches = [
        _match(
          id: 'jogada',
          status: TournamentMatchStatus.completed,
          winnerId: 'meu',
        ),
      ];
      final ctx = _ctx(
        matches: matches,
        standings: {
          'A': [_row(1, 'meu', wins: 1), _row(2, 'rival')],
        },
      );

      final note = qualificationNoteOf(ctx, 'A', 2, 'meu');

      expect(note!.text, contains('avançou'));
      expect(note.tone, QualificationTone.win);
    });

    test('grupo encerrado fora da faixa não promete nada', () {
      final matches = [
        _match(
          id: 'jogada',
          status: TournamentMatchStatus.completed,
          winnerId: 'rival',
        ),
      ];
      final ctx = _ctx(
        matches: matches,
        standings: {
          'A': [_row(1, 'rival'), _row(2, 'outro'), _row(3, 'meu')],
        },
      );

      final note = qualificationNoteOf(ctx, 'A', 2, 'meu');

      expect(note!.tone, QualificationTone.neutral);
      expect(note.text, contains('Passavam os 2 primeiros'));
    });

    test('sem time no grupo devolve null', () {
      final ctx = _ctx(matches: const [], standings: const {'A': []});
      expect(qualificationNoteOf(ctx, 'A', 2, 'meu'), isNull);
    });
  });
}
