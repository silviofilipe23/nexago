import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/core/time/nexago_event_timezone.dart';
import 'package:nexago_app/features/arenas/domain/booking_result.dart';
import 'package:nexago_app/features/arenas/domain/booking_result_record.dart';
import 'package:nexago_app/features/arenas/domain/pelada.dart';

import '../fake_booking_result_repository.dart';

void main() {
  setUpAll(() async {
    initializeNexagoEventTimezone();
    await initializeDateFormatting('pt_BR');
  });

  group('peladaMineOf', () {
    test('duplas: sets vencidos, saldo, posição e parceiro', () {
      final mine = peladaMineOf(savedResult(), 'u1')!;
      expect((mine.wins, mine.losses, mine.balance), (2, 1, 2));
      expect((mine.position, mine.teamsCount), (1, 2));
      expect(peladaHeroTitle(mine), 'Você venceu a pelada');
      expect(peladaHeroSubtitle(mine), 'com Enzo · 3 jogos');

      final other = peladaMineOf(savedResult(), 'u3')!;
      expect(peladaHeroTitle(other), 'Você ficou em 2º');
    });

    test('rei da quadra: posição pela classificação', () {
      final s = savedResult(result: kingOfCourtResult());
      final mine = peladaMineOf(s, 'u1')!;
      expect((mine.wins, mine.losses, mine.position, mine.teamsCount),
          (4, 3, 1, 4));
      expect(peladaMineOf(s, 'u7')!.position, 4);
      expect(peladaMineOf(s, 'u9'), isNull);
    });

    test('empate total divide a posição', () {
      const tied = BookingResult(
        teams: [
          ResultTeam(id: 0, players: [ResultPlayer(id: 'a', name: 'Ana')]),
          ResultTeam(id: 1, players: [ResultPlayer(id: 'b', name: 'Bia')]),
          ResultTeam(id: 2, players: [ResultPlayer(id: 'c', name: 'Cris')]),
        ],
        games: [
          ResultGame(teamA: 0, teamB: 2, scoreA: 15, scoreB: 10),
          ResultGame(teamA: 1, teamB: 2, scoreA: 15, scoreB: 10),
        ],
      );
      final s = savedResult(result: tied);
      final a = peladaMineOf(s, 'a')!;
      expect((a.position, a.sharedPosition), (1, true));
      expect(peladaHeroTitle(a), 'Você empatou em 1º');
      expect(tied.leaderId, isNull);
    });
  });

  test('etiqueta: confirmado, aguardando N, contestado', () {
    expect(
      peladaStatusTag(savedResult(status: BookingResultStatus.confirmed)).label,
      '● CONFIRMADO',
    );
    expect(peladaStatusTag(savedResult()).label, '◐ AGUARDANDO 3');
    expect(
      peladaStatusTag(
        savedResult(status: BookingResultStatus.disputed, disputedBy: 'u3'),
      ).tone,
      PeladaStatusTone.disputed,
    );
  });

  group('peladasSummary', () {
    final all = [
      savedResult(status: BookingResultStatus.confirmed, bookingId: 'a'),
      savedResult(
        status: BookingResultStatus.confirmed,
        bookingId: 'b',
        dateKey: '2026-06-10',
        arenaName: 'Beach Club',
      ),
      savedResult(
        status: BookingResultStatus.confirmed,
        bookingId: 'c',
        dateKey: '2026-06-12',
      ),
      // Pendente: só conta em "Pendentes".
      savedResult(bookingId: 'd', dateKey: '2026-07-01'),
      // Outro ano.
      savedResult(
        status: BookingResultStatus.confirmed,
        bookingId: 'e',
        dateKey: '2025-12-30',
      ),
    ];

    test('só confirmada do ano conta; pendente entra em pendingCount', () {
      final s = peladasSummary(all, 'u1', year: 2026);
      expect(s.sessions, 3);
      expect(s.minutes, 270);
      expect(peladaHoursLabel(s.minutes), '4h30');
      expect((s.games, s.wins), (9, 6));
      expect((s.winRate * 100).round(), 67);
      expect(s.firstPlaces, 3);
      expect(s.topArena!.name, 'Arena CFC');
      expect(s.topArena!.count, 2);
      expect(s.pendingCount, 1);
    });

    test('de outro atleta conta do ponto de vista dele', () {
      final s = peladasSummary(all, 'u3', year: 2026);
      expect((s.wins, s.firstPlaces), (3, 0));
    });
  });

  group('lista de 10b', () {
    test('mais recente primeiro, agrupada por mês com V e D do mês', () {
      final list = peladasOf([
        savedResult(bookingId: 'a', dateKey: '2026-09-27'),
        savedResult(bookingId: 'b', dateKey: '2026-10-18'),
        savedResult(bookingId: 'c', dateKey: '2026-10-06'),
      ], 'u1');
      expect([for (final s in list) s.bookingId], ['b', 'c', 'a']);
      final groups = peladaMonthGroups(list, 'u1');
      expect([
        for (final g in groups) g.title
      ], [
        'Outubro · 2026',
        'Setembro · 2026',
      ]);
      expect(groups.first.summaryLabel, '2 horários · 4V 2D');
    });

    test('dia e mês saem da data da reserva (jogo às 23h não vira o dia)', () {
      final late = SavedBookingResult(
        bookingId: 'x',
        arenaName: 'Arena',
        dateKey: '2026-10-31',
        startTime: '23:00',
        endTime: '00:30',
        createdBy: 'u1',
        createdByName: 'Maria',
        result: savedResult().result,
        status: BookingResultStatus.confirmed,
        version: 1,
        confirmations: const {
          'u1': ResultConfirmation(state: ResultConfirmationState.confirmed),
        },
      );
      expect(peladaDayParts(late), (weekday: 'SÁB', day: '31'));
      expect(peladaMonthGroups([late], 'u1').single.title, 'Outubro · 2026');
      expect(late.minutes, 90);
    });

    test('filtros: pendentes e arena; chips por arena mais jogada', () {
      final list = [
        savedResult(bookingId: 'a', status: BookingResultStatus.confirmed),
        savedResult(bookingId: 'b', arenaName: 'Beach Club'),
        savedResult(bookingId: 'c', arenaName: 'Beach Club'),
      ];
      expect(
        list.where(const PeladaFilter.pending().matches).length,
        2,
      );
      expect(
        list.where(const PeladaFilter.arena('Arena CFC').matches).length,
        1,
      );
      final chips = peladaArenaChips(list);
      expect([
        for (final c in chips) (c.name, c.count)
      ], [
        ('Beach Club', 2),
        ('Arena CFC', 1),
      ]);
    });
  });

  group('textos do detalhe', () {
    test('linha do formato e da data', () {
      expect(
        peladaFormatLine(savedResult(result: kingOfCourtResult())),
        'Quadra 1 · Vôlei de praia · 4 duplas, rei da quadra',
      );
      expect(
        peladaFormatLine(savedResult()),
        'Quadra 1 · Vôlei de praia · 2 duplas',
      );
      expect(peladaHeroDateLine(savedResult()), 'SEX 22 MAI · 09:00–10:30');
    });

    test('seus jogos: só os do time, com a ordem do placar', () {
      final games =
          peladaMyGames(savedResult(result: kingOfCourtResult()), 'u7');
      expect([for (final g in games) g.order], [4, 7, 9]);
    });

    test('por pessoa: valor da reserva dividido por quem jogou', () {
      // O NumberFormat põe espaço não-quebrável depois do R\$.
      expect(
        peladaPricePerPerson(savedResult())!.replaceAll('\u00a0', ' '),
        r'R$ 30 por pessoa',
      );
    });

    test('saldo com sinal tipográfico', () {
      expect(peladaBalanceLabel(18), '+18');
      expect(peladaBalanceLabel(-9), '−9');
      expect(peladaBalanceLabel(0), '0');
    });

    test('nome do meu time vira "Você & Enzo"', () {
      final team = savedResult().result.teams.first;
      expect(peladaTeamNameFor(team, 'u1'), 'Você & Enzo');
    });
  });

  test('motivo da contestação: chip, texto, os dois; curto não vale', () {
    expect(peladaDisputeReason(chip: 'Dupla errada'), 'Dupla errada');
    expect(
      peladaDisputeReason(chip: 'Placar errado', text: ' o 2º set foi 21–19 '),
      'Placar errado: o 2º set foi 21–19',
    );
    expect(peladaDisputeReason(text: 'ok'), isNull);
    expect(peladaDisputeReason(), isNull);
  });
}
