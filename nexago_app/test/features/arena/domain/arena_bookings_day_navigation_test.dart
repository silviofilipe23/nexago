import 'package:flutter_test/flutter_test.dart';
import 'package:intl/date_symbol_data_local.dart';
import 'package:nexago_app/features/arena/domain/arena_booking_day_timeline.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_day_providers.dart';
import 'package:nexago_app/features/arena/domain/arena_bookings_filter.dart';
import 'package:nexago_app/features/arena/domain/arena_free_windows.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';
import 'package:nexago_app/features/arena/presentation/widgets/arena_bookings_day_timeline.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';

final _now = DateTime(2026, 11, 18, 18, 40);
const _today = '2026-11-18';

ArenaSlot _slot(String court, String start, String end,
        {String status = 'available', DateTime? date}) =>
    ArenaSlot(
      id: '$court-$start',
      arenaId: 'a1',
      courtId: court,
      date: date ?? DateTime(2026, 11, 18),
      startTime: start,
      endTime: end,
      rawStatus: status,
    );

ArenaManagerBooking _b(
  String id, {
  String start = '19:00',
  String end = '20:00',
  String court = 'q1',
  String dateKey = _today,
  String athleteId = 'ath1',
  Map<String, dynamic> data = const {},
}) =>
    ArenaManagerBooking(
      id: id,
      athleteId: athleteId,
      courtId: court,
      courtName: 'Quadra ${court.substring(1)}',
      dateKey: dateKey,
      startTime: start,
      endTime: end,
      data: {'status': 'active', ...data},
    );

const _names = {'q1': 'Quadra 1', 'q2': 'Quadra 2', 'q4': 'Quadra 4'};

void main() {
  setUpAll(() async {
    await initializeDateFormatting('pt_BR');
  });

  group('horários livres', () {
    test('junta horários seguidos e agrupa quadras com a mesma janela', () {
      final windows = buildArenaFreeWindows(
        slots: [
          _slot('q1', '19:00', '20:00'),
          _slot('q1', '20:00', '21:00'),
          _slot('q4', '19:00', '20:00'),
          _slot('q4', '20:00', '21:00'),
          _slot('q2', '21:00', '22:00'),
          _slot('q2', '19:00', '20:00', status: 'booked'),
        ],
        dateKey: _today,
        now: _now,
        courtNames: _names,
      );
      expect(windows.map((w) => '${w.rangeLabel} · ${w.courtsLabel}'), [
        '19h–21h · Quadras 1 e 4',
        '21h–22h · Quadra 2',
      ]);
    });

    test('hoje não mostra o que já começou; dia passado não tem livre', () {
      final slots = [
        _slot('q1', '18:00', '19:00'),
        _slot('q1', '19:00', '20:00'),
      ];
      expect(
        buildArenaFreeWindows(
          slots: slots,
          dateKey: _today,
          now: _now,
          courtNames: _names,
        ).single.rangeLabel,
        '19h–20h',
      );
      expect(
        buildArenaFreeWindows(
          slots: [_slot('q1', '19:00', '20:00', date: DateTime(2026, 11, 17))],
          dateKey: '2026-11-17',
          now: _now,
          courtNames: _names,
        ),
        isEmpty,
      );
    });

    test('rótulo das quadras', () {
      expect(arenaCourtsLabel(['Quadra 1']), 'Quadra 1');
      expect(arenaCourtsLabel(['Quadra 1', 'Quadra 4']), 'Quadras 1 e 4');
      expect(
        arenaCourtsLabel(['Quadra 1', 'Quadra 2', 'Quadra 4']),
        'Quadras 1, 2 e 4',
      );
      expect(arenaCourtsLabel(['Central', 'Quadra 2']), 'Central e Quadra 2');
      expect(arenaHourLabel('19:30'), '19h30');
    });

    test('texto do Divulgar traz dia, horário, quadra e o link', () {
      final text = arenaFreeWindowShareText(
        window: const ArenaFreeWindow(
          startTime: '19:00',
          endTime: '21:00',
          courtIds: ['q1', 'q4'],
          courtNames: ['Quadra 1', 'Quadra 4'],
        ),
        dayLabel: 'hoje',
        arenaName: 'Arena Pé na Areia',
        arenaId: 'a1',
      );
      expect(
        text,
        'Horário livre hoje, 19h–21h, Quadras 1 e 4 na Arena Pé na Areia. '
        'Reserve pelo nexaGO: https://atleta.nexago.com.br/reservar/a1',
      );
    });

    test('dia do Divulgar: hoje, amanhã ou dia da semana', () {
      final today = DateTime(2026, 11, 18);
      expect(arenaShareDayLabel(today, today), 'hoje');
      expect(arenaShareDayLabel(DateTime(2026, 11, 19), today), 'amanhã');
      expect(
        arenaShareDayLabel(DateTime(2026, 11, 20), today),
        'sexta (20/11)',
      );
    });

    test('na linha do dia o livre entra na hora, depois da reserva', () {
      final entries = buildArenaDayTimeline(
        bookings: [_b('r', start: '19:00', end: '20:00')],
        dateKey: _today,
        now: _now,
        freeWindows: const [
          ArenaFreeWindow(
            startTime: '19:00',
            endTime: '21:00',
            courtIds: ['q4'],
            courtNames: ['Quadra 4'],
          ),
        ],
      );
      expect(entries[0], isA<ArenaTimelineNowEntry>());
      expect(entries[1], isA<ArenaTimelineBookingEntry>());
      expect(entries[2], isA<ArenaTimelineFreeEntry>());
    });
  });

  group('filtros', () {
    final deposit = _b('d', data: {
      'paymentChannel': 'pix',
      'paymentStatus': 'partial',
      'amountReais': 160,
      'amountPaidOnlineReais': 80,
      'sport': 'beach_tennis',
    });
    final paid = _b('p', court: 'q2', data: {
      'paymentChannel': 'card',
      'paymentStatus': 'paid',
      'isRecurring': true,
    });

    test('quadra, pagamento, tipo e esporte', () {
      expect(
        const ArenaBookingsFilter(courtIds: {'q2'}).matches(deposit),
        isFalse,
      );
      expect(
        const ArenaBookingsFilter(payments: {ArenaPaymentFilter.due})
            .matches(deposit),
        isTrue,
      );
      expect(
        const ArenaBookingsFilter(payments: {ArenaPaymentFilter.paid})
            .matches(paid),
        isTrue,
      );
      expect(
        const ArenaBookingsFilter(types: {ArenaBookingTypeFilter.single})
            .matches(paid),
        isFalse,
      );
      expect(
        const ArenaBookingsFilter(types: {ArenaBookingTypeFilter.recurring})
            .matches(paid),
        isTrue,
      );
      expect(
        const ArenaBookingsFilter(sports: {'Beach tennis'}).matches(paid),
        isFalse,
      );
    });

    test('OU dentro do grupo, E entre grupos; contagem de grupos', () {
      const f = ArenaBookingsFilter(
        courtIds: {'q1', 'q2'},
        payments: {ArenaPaymentFilter.paid},
      );
      expect(f.matches(paid), isTrue);
      expect(f.matches(deposit), isFalse);
      expect(f.activeGroups, 2);
      expect(f.onlyCourts, isFalse);
      expect(const ArenaBookingsFilter().isEmpty, isTrue);
    });
  });

  group('busca', () {
    test('sem acento, sem caixa, todos os termos', () {
      final b = _b('abcdef12345', data: {'customerName': 'José Antônio'});
      expect(arenaBookingMatchesQuery(b, 'jose'), isTrue);
      expect(arenaBookingMatchesQuery(b, 'ANTONIO jose'), isTrue);
      expect(arenaBookingMatchesQuery(b, 'jose maria'), isFalse);
      expect(arenaBookingMatchesQuery(b, 'quadra 1'), isTrue);
      expect(arenaBookingMatchesQuery(b, '#NXG-12345'), isTrue);
    });

    test('nome do atleta resolvido entra na busca', () {
      final b = _b('x');
      expect(
        arenaBookingMatchesQuery(b, 'lucas', athleteName: 'Lucas Andrade'),
        isTrue,
      );
      expect(arenaBookingMatchesQuery(b, 'lucas'), isFalse);
    });

    test('resultados: de hoje em diante primeiro, depois as passadas', () {
      final sections = arenaBookingSearchSections(
        [
          _b('passada-antiga', dateKey: '2026-11-10'),
          _b('futura', dateKey: '2026-11-25'),
          _b('hoje', dateKey: _today),
          _b('passada-recente', dateKey: '2026-11-17'),
        ],
        today: DateTime(2026, 11, 18),
      );
      expect(
        sections.map((s) => s.dateKey),
        ['2026-11-18', '2026-11-25', '2026-11-17', '2026-11-10'],
      );
      expect(sections.first.title, startsWith('Hoje'));
    });
  });

  group('faixa de 7 dias', () {
    final today = DateTime(2026, 11, 18);

    test('começa hoje enquanto o dia cabe nos próximos 7', () {
      expect(arenaBookingsStripStart(today, today), today);
      expect(arenaBookingsStripStart(DateTime(2026, 11, 24), today), today);
    });

    test('fora disso, centraliza o dia escolhido', () {
      expect(
        arenaBookingsStripStart(DateTime(2026, 11, 30), today),
        DateTime(2026, 11, 27),
      );
      expect(
        arenaBookingsStripStart(DateTime(2026, 11, 10), today),
        DateTime(2026, 11, 7),
      );
    });
  });
}
