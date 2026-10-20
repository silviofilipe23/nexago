import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_logic.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_match_history_models.dart';
import 'package:nexago_app/features/athlete/domain/match_history/athlete_rental_history_mapper.dart';

import '../../arenas/fake_booking_result_repository.dart';

SavedBookingResult rotation() => SavedBookingResult(
      bookingId: 'b9',
      arenaName: 'Praia BT',
      dateKey: '2026-10-19',
      startTime: '18:00',
      endTime: '20:00',
      createdBy: 'u1',
      createdByName: 'Maria',
      opponentUids: const ['u3', 'u5'],
      status: BookingResultStatus.confirmed,
      version: 1,
      result: const BookingResult(
        teams: [
          ResultTeam(id: 0, players: [ResultPlayer(id: 'u1', name: 'Maria')]),
          ResultTeam(id: 1, players: [ResultPlayer(id: 'u3', name: 'Rafael')]),
          ResultTeam(id: 2, players: [ResultPlayer(id: 'u5', name: 'Bia')]),
        ],
        games: [
          ResultGame(teamA: 0, teamB: 1, scoreA: 15, scoreB: 10),
          ResultGame(teamA: 0, teamB: 2, scoreA: 15, scoreB: 13),
          ResultGame(teamA: 0, teamB: 1, scoreA: 9, scoreB: 15),
          ResultGame(teamA: 1, teamB: 2, scoreA: 15, scoreB: 4),
        ],
      ),
    );

void main() {
  setUpAll(initializeNexagoEventTimezone);

  group('rentalHistoryItem', () {
    test('pendente e contestado não contam', () {
      expect(rentalHistoryItem(savedResult(), 'u1'), isNull);
      expect(
        rentalHistoryItem(
            savedResult(status: BookingResultStatus.disputed), 'u3'),
        isNull,
      );
    });

    test('confirmado: vitória de quem lançou, derrota do adversário', () {
      final saved = savedResult(status: BookingResultStatus.confirmed);
      final mine = rentalHistoryItem(saved, 'u1')!;
      expect(mine.result, AthleteMatchResult.win);
      expect(mine.isRental, isTrue);
      expect(mine.id, 'b1');
      expect(mine.opponentLabel, 'Rafael & Lia');
      expect(mine.competitionLabel, 'Aluguel · Arena CFC · Quadra 1');
      expect(mine.scoreDisplay, '21-18, 17-21, 15-12');
      expect(mine.playedAt, DateTime.utc(2026, 5, 22, 12));

      final theirs = rentalHistoryItem(saved, 'u3')!;
      expect(theirs.result, AthleteMatchResult.loss);
      expect(theirs.opponentLabel, 'Maria & Enzo');
      expect(theirs.scoreDisplay, '18-21, 21-17, 12-15');
      // Companheiro também ganha a linha; quem não está no placar, não.
      expect(rentalHistoryItem(saved, 'u2')!.result, AthleteMatchResult.win);
      expect(rentalHistoryItem(saved, 'u9'), isNull);
    });

    test('sets empatados viram empate', () {
      final s = savedResult(status: BookingResultStatus.confirmed);
      final tied = SavedBookingResult(
        bookingId: s.bookingId,
        arenaName: s.arenaName,
        dateKey: s.dateKey,
        startTime: s.startTime,
        endTime: s.endTime,
        createdBy: s.createdBy,
        createdByName: s.createdByName,
        opponentUids: s.opponentUids,
        status: s.status,
        version: s.version,
        result: s.result.removeGame(2),
      );
      expect(rentalHistoryItem(tied, 'u1')!.result, AthleteMatchResult.draw);
      expect(rentalHistoryItem(tied, 'u1')!.competitionLabel,
          'Aluguel · Arena CFC');
    });

    test('rotação: saldo dos jogos do time do atleta e a colocação', () {
      final maria = rentalHistoryItem(rotation(), 'u1')!;
      expect(maria.result, AthleteMatchResult.win);
      expect(maria.scoreDisplay, '2V 1D');
      expect(maria.opponentLabel, 'Rotação · 3 times');
      // Rafael empata em vitórias e passa no saldo (+12 contra +1).
      expect(maria.setsDisplay, '2º de 3 · 4 jogos');

      final rafael = rentalHistoryItem(rotation(), 'u3')!;
      expect(rafael.scoreDisplay, '2V 1D');
      expect(rafael.result, AthleteMatchResult.win);
      expect(rafael.setsDisplay, '1º de 3 · 4 jogos');

      final bia = rentalHistoryItem(rotation(), 'u5')!;
      expect(bia.result, AthleteMatchResult.loss);
      expect(bia.scoreDisplay, '0V 2D');
    });
  });

  test('topo do Histórico: confirmar, aguardando e contestado; confirmado sai',
      () {
    final all = [
      savedResult(bookingId: 'a'),
      savedResult(bookingId: 'b', status: BookingResultStatus.disputed),
      savedResult(bookingId: 'c', status: BookingResultStatus.confirmed),
    ];
    expect(
        [for (final s in rentalResultsNeedingAttention(all, 'u1')) s.bookingId],
        ['a', 'b']);
    expect(
        [for (final s in rentalResultsNeedingAttention(all, 'u3')) s.bookingId],
        ['a']);
    // Companheiro não tem o que fazer.
    expect(rentalResultsNeedingAttention(all, 'u2'), isEmpty);
  });

  group('empate no mês e na temporada', () {
    AthleteMatchHistoryItem item(AthleteMatchResult r, int day) =>
        AthleteMatchHistoryItem(
          id: '$day',
          playedAt: DateTime.utc(2026, 10, day, 12),
          result: r,
          opponentLabel: 'x',
          competitionLabel: 'y',
          scoreDisplay: 'z',
        );

    final list = [
      item(AthleteMatchResult.win, 1),
      item(AthleteMatchResult.loss, 2),
      item(AthleteMatchResult.draw, 3),
    ];

    test('o mês mostra o empate e não o conta como derrota', () {
      expect(
          groupMatchesByMonth(list).single.summaryLabel, '3 JOGOS • 1V 1D 1E');
      expect(groupMatchesByMonth(list.take(2).toList()).single.summaryLabel,
          '2 JOGOS • 1V 1D');
    });

    test('aproveitamento só entre decididos', () {
      final season = buildSeasonSummary(matches: list, year: 2026);
      expect(season.wins, 1);
      expect(season.losses, 1);
      expect(season.winRatePercent, 50);
      expect(season.monthlyBars.single.losses, 1);
    });
  });
}
