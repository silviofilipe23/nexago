import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/focus/focus_arena_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_detail_tabs_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  required String id,
  String status = TournamentMatchStatus.scheduled,
  int matchNumber = 1,
  DateTime? scheduleTime,
  DateTime? matchStartedAt,
  String courtName = '',
  String matchType = 'bracket',
  String poolId = '',
  bool isGroupMatch = false,
  int round = 1,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'c1',
    round: round,
    matchType: matchType,
    poolId: poolId,
    teamAId: 'a',
    teamBId: 'b',
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: isGroupMatch,
    matchNumber: matchNumber,
    scheduleTime: scheduleTime,
    matchStartedAt: matchStartedAt,
    courtName: courtName,
  );
}

final _now = DateTime(2026, 8, 21, 11, 28);

void main() {
  group('upcomingTournamentMatches', () {
    test('devolve as agendadas do dia em ordem cronológica', () {
      final matches = [
        _match(id: 'tarde', scheduleTime: DateTime(2026, 8, 21, 16)),
        _match(id: 'cedo', scheduleTime: DateTime(2026, 8, 21, 12)),
      ];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: true,
      );

      expect(upcoming.map((m) => m.id), ['cedo', 'tarde']);
    });

    test('partida sem horário entra, no fim, por número do jogo', () {
      // `dayKey` é apagado no desagendamento e a fila do dia é a única âncora
      // que sobra — sumir com ela esconderia justamente quem está esperando.
      final matches = [
        _match(id: 'sem-horario-30', matchNumber: 30),
        _match(id: 'agendada', scheduleTime: DateTime(2026, 8, 21, 16)),
        _match(id: 'sem-horario-20', matchNumber: 20),
      ];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: true,
      );

      expect(
        upcoming.map((m) => m.id),
        ['agendada', 'sem-horario-20', 'sem-horario-30'],
      );
    });

    test('não repete o que já está em quadra', () {
      // Ao vivo tem lista própria; aparecer nas duas contaria a partida duas
      // vezes nos chips.
      final matches = [
        _match(
          id: 'ao-vivo',
          status: TournamentMatchStatus.inProgress,
          scheduleTime: DateTime(2026, 8, 21, 11),
        ),
        _match(id: 'a-seguir', scheduleTime: DateTime(2026, 8, 21, 12)),
      ];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: true,
      );

      expect(upcoming.map((m) => m.id), ['a-seguir']);
    });

    test('encerrada e cancelada ficam de fora', () {
      final matches = [
        _match(
          id: 'encerrada',
          status: TournamentMatchStatus.completed,
          scheduleTime: DateTime(2026, 8, 21, 12),
        ),
        _match(
          id: 'cancelada',
          status: TournamentMatchStatus.canceled,
          scheduleTime: DateTime(2026, 8, 21, 13),
        ),
        _match(id: 'a-seguir', scheduleTime: DateTime(2026, 8, 21, 14)),
      ];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: true,
      );

      expect(upcoming.map((m) => m.id), ['a-seguir']);
    });

    test('partida marcada para outro dia fica de fora', () {
      // Torneio de 3 dias mostrando o sábado inteiro na terça é ruído puro.
      final matches = [
        _match(id: 'amanha', scheduleTime: DateTime(2026, 8, 22, 9)),
        _match(id: 'hoje', scheduleTime: DateTime(2026, 8, 21, 14)),
      ];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: true,
      );

      expect(upcoming.map((m) => m.id), ['hoje']);
    });

    test('fora do dia de evento, partida sem horário não entra', () {
      // Sem âncora nenhuma e sem torneio rolando, não dá para afirmar que a
      // partida é de hoje.
      final matches = [_match(id: 'sem-horario')];

      final upcoming = upcomingTournamentMatches(
        matches,
        _now,
        tournamentRunningToday: false,
      );

      expect(upcoming, isEmpty);
    });
  });

  group('focusArenaHeadline', () {
    test('conta as partidas em quadra, no plural certo', () {
      expect(focusArenaHeadline(4), '4 partidas em quadra agora.');
      expect(focusArenaHeadline(1), '1 partida em quadra agora.');
    });

    test('sem nada em quadra, não inventa número', () {
      expect(focusArenaHeadline(0), 'Nenhuma partida em quadra agora.');
    });
  });

  group('focusArenaSegmentLabel', () {
    test('cada segmento carrega a própria contagem', () {
      expect(focusArenaSegmentLabel(FocusArenaSegment.live, 4), '4 EM QUADRA');
      expect(
        focusArenaSegmentLabel(FocusArenaSegment.upcoming, 3),
        '3 A SEGUIR',
      );
    });
  });

  group('focusArenaInitialSegment', () {
    test('abre em Ao vivo quando há partida em quadra', () {
      expect(
        focusArenaInitialSegment(liveCount: 2, upcomingCount: 5),
        FocusArenaSegment.live,
      );
    });

    test('nada em quadra e fila cheia: abre já em A seguir', () {
      // Abrir numa lista vazia com a lista cheia a um toque de distância é
      // esconder o conteúdo atrás de um clique sem motivo.
      expect(
        focusArenaInitialSegment(liveCount: 0, upcomingCount: 5),
        FocusArenaSegment.upcoming,
      );
    });

    test('nada dos dois lados: fica em Ao vivo', () {
      expect(
        focusArenaInitialSegment(liveCount: 0, upcomingCount: 0),
        FocusArenaSegment.live,
      );
    });
  });
}
