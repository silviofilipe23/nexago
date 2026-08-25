import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/athlete_tournament_day_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_discovery_models.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_match_status.dart';

TournamentMatch _match({
  String id = 'm1',
  String status = TournamentMatchStatus.scheduled,
  String queueStatus = '',
  int queueOrder = 0,
  String teamAId = 'team-me',
  String teamBId = 'team-other',
  String? winnerId,
  DateTime? scheduleTime,
  DateTime? matchStartedAt,
}) {
  return TournamentMatch(
    id: id,
    tournamentId: 't1',
    categoryId: 'cat',
    round: 1,
    matchType: 'wb',
    poolId: '',
    teamAId: teamAId,
    teamBId: teamBId,
    status: status,
    resultA: '',
    resultB: '',
    isGroupMatch: false,
    matchNumber: 1,
    queueStatus: queueStatus,
    queueOrder: queueOrder,
    scheduleTime: scheduleTime,
    matchStartedAt: matchStartedAt,
    winnerId: winnerId,
  );
}

void main() {
  test('pickAthleteNextMatch prefers court call', () {
    final next = pickAthleteNextMatch(
      matches: [
        _match(id: 'scheduled', scheduleTime: DateTime(2026, 6, 14, 10)),
        _match(id: 'call', queueStatus: 'on_court'),
      ],
      teamId: 'team-me',
      tournamentId: 't1',
      tournamentName: 'Copa',
      today: DateTime.utc(2026, 6, 14, 15),
    );
    expect(next?.match.id, 'call');
    expect(next?.isCourtCall, isTrue);
  });

  test('TournamentMatchStatus accepts legacy snake_case', () {
    expect(TournamentMatchStatus.isInProgress('in_progress'), isTrue);
    expect(TournamentMatchStatus.isCompleted('completed'), isTrue);
    expect(TournamentMatchStatus.isScheduled('scheduled'), isTrue);
  });

  test('pickAthleteCourtCallMatch finds on_court match', () {
    final call = pickAthleteCourtCallMatch(
      matches: [
        _match(id: 'waiting', queueStatus: 'waiting'),
        _match(id: 'court', queueStatus: 'on_court'),
      ],
      teamId: 'team-me',
      tournamentId: 't1',
      tournamentName: 'Copa',
    );
    expect(call?.match.id, 'court');
  });

  group('pickAthleteNextMatch — só o dia de hoje', () {
    // 21/08/2026 12:00 em São Paulo.
    final today = DateTime.utc(2026, 8, 21, 15);

    AthleteNextMatch? pick(List<TournamentMatch> matches, {DateTime? now}) {
      return pickAthleteNextMatch(
        matches: matches,
        teamId: 'team-me',
        tournamentId: 't1',
        tournamentName: 'Copa',
        today: now ?? today,
      );
    }

    test('partida agendada para outro dia não vira alvo do Focus', () {
      // O caso do DEV: torneio de 20 a 23/08 com partida marcada para 03/09.
      final next = pick([
        _match(id: 'setembro', scheduleTime: DateTime.utc(2026, 9, 3, 15)),
      ]);

      expect(next, isNull);
    });

    test('partida sem horário na fila do dia conta', () {
      final next = pick([
        _match(id: 'fila', queueStatus: 'waiting', queueOrder: 3),
      ]);

      expect(next?.match.id, 'fila');
    });

    test('a partida sem horário de hoje ganha da agendada para outro dia', () {
      // A armadilha da prioridade: "agendada" (2) vence "na fila" (3), então
      // sem o filtro de dia a de setembro seria escolhida.
      final next = pick([
        _match(id: 'setembro', scheduleTime: DateTime.utc(2026, 9, 3, 15)),
        _match(id: 'fila', queueStatus: 'waiting'),
      ]);

      expect(next?.match.id, 'fila');
    });

    test('partida que começou hoje entra mesmo agendada para ontem', () {
      final next = pick([
        _match(
          id: 'atrasada',
          status: TournamentMatchStatus.inProgress,
          scheduleTime: DateTime.utc(2026, 8, 20, 21),
          matchStartedAt: DateTime.utc(2026, 8, 21, 14),
        ),
      ]);

      expect(next?.match.id, 'atrasada');
    });

    test('o dia é o do fuso do evento, não o do relógio do aparelho', () {
      // Jogo das 20:00 em São Paulo, consultado às 23:00 do MESMO dia — mas o
      // relógio UTC já virou para 22/08 no meio dos dois. Quem compara no fuso
      // do aparelho (o de quem viajou, ou o UTC do CI) joga o jogo da noite
      // para fora do dia dele.
      final next = pick(
        [_match(id: 'noite', scheduleTime: DateTime.utc(2026, 8, 21, 23))],
        now: DateTime.utc(2026, 8, 22, 2),
      );

      expect(next?.match.id, 'noite');
    });
  });

  group('pickAthleteFocusHomeTarget', () {
    final today = DateTime(2026, 8, 21, 12);

    MyTournamentRegistration reg({
      String tournamentId = 't1',
      String teamId = 'team-me',
      String categoryId = 'cat',
      TournamentListingStatus listingStatus = TournamentListingStatus.live,
      DateTime? startDate,
      bool isPaid = true,
    }) {
      return MyTournamentRegistration(
        registrationId: 'reg-$tournamentId',
        tournamentId: tournamentId,
        tournamentName: 'Copa $tournamentId',
        dateLabel: '21/08',
        statusLabel: 'Inscrito',
        isPaid: isPaid,
        categoryId: categoryId,
        teamId: teamId,
        listingStatus: listingStatus,
        startDate: startDate ?? today,
        endDate: today,
      );
    }

    test('mostra no dia do evento mesmo sem partida pendente', () {
      final target = pickAthleteFocusHomeTarget(
        registrations: [reg()],
        matchesByTournament: {
          't1': [
            _match(
              id: 'done',
              status: TournamentMatchStatus.completed,
              winnerId: 'team-me',
              scheduleTime: today,
            ),
          ],
        },
        today: today,
      );

      expect(target?.tournamentId, 't1');
    });

    test('some quando o atleta foi eliminado no mata-mata', () {
      final target = pickAthleteFocusHomeTarget(
        registrations: [reg()],
        matchesByTournament: {
          't1': [
            _match(
              id: 'quartas',
              status: TournamentMatchStatus.completed,
              teamAId: 'team-me',
              teamBId: 'rival',
              winnerId: 'rival',
              scheduleTime: today,
            ),
          ],
        },
        today: today,
      );

      expect(target, isNull);
    });

    test('fora do dia do evento não aparece', () {
      final target = pickAthleteFocusHomeTarget(
        registrations: [
          reg(
            listingStatus: TournamentListingStatus.open,
            startDate: DateTime(2026, 9, 1),
          ),
        ],
        matchesByTournament: const {},
        today: today,
      );

      expect(target, isNull);
    });

    test('preferir o torneio que ainda tem partida hoje', () {
      final target = pickAthleteFocusHomeTarget(
        registrations: [reg(tournamentId: 'idle'), reg(tournamentId: 'live')],
        matchesByTournament: {
          'idle': const [],
          'live': [
            _match(
              id: 'next',
              scheduleTime: today,
              teamAId: 'team-me',
            ),
          ],
        },
        today: today,
      );

      expect(target?.tournamentId, 'live');
    });
  });
}
