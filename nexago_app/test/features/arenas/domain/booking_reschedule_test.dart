import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/booking_reschedule.dart';

Map<String, dynamic> _booking([Map<String, dynamic> extra = const {}]) => {
      'athleteId': 'ath1',
      'arenaName': 'Arena X',
      'date': '2026-08-05',
      'startTime': '18:00',
      'endTime': '20:00',
      'status': 'active',
      'amountReais': 120,
      'pricingLineItems': [
        {'startTime': '18:00', 'endTime': '19:00', 'finalSlotPriceReais': 60},
        {'startTime': '19:00', 'endTime': '20:00', 'finalSlotPriceReais': 60},
      ],
      ...extra,
    };

ArenaSlot _slot(String start, String end,
        {String status = 'available', double price = 60, String? bookingId}) =>
    ArenaSlot(
      id: '$start-$end',
      arenaId: 'a',
      courtId: 'c1',
      date: DateTime(2026, 8, 6),
      startTime: start,
      endTime: end,
      rawStatus: status,
      priceReais: price,
      bookingId: bookingId,
    );

void main() {
  final now = DateTime(2026, 8, 5, 8);

  group('bookingRescheduleBlockReason', () {
    String? reason(Map<String, dynamic> b,
            {BookingRescheduleActor actor = BookingRescheduleActor.athlete,
            String? uid = 'ath1',
            DateTime? at}) =>
        bookingRescheduleBlockReason(b, actor: actor, uid: uid, now: at ?? now);

    test('avulsa ativa do titular pode', () {
      expect(reason(_booking()), isNull);
    });

    test('outro atleta não remarca', () {
      expect(reason(_booking(), uid: 'x'), contains('não pode remarcar'));
    });

    test('horário fixo, aula e clubinho ficam de fora', () {
      expect(reason(_booking({'recurringBookingId': 'r'})), contains('Horário fixo'));
      expect(reason(_booking({'classSessionId': 'c'})), contains('aula'));
      expect(reason(_booking({'clubSessionId': 'x'}),
              actor: BookingRescheduleActor.arena),
          contains('clubinho'));
    });

    test('atleta: até 6h antes e uma vez só', () {
      final late = DateTime(2026, 8, 5, 13);
      final r = reason(_booking(), at: late)!;
      expect(r, contains('6h antes'));
      expect(bookingRescheduleHintWorthShowing(r), isTrue);
      expect(reason(_booking({'athleteRescheduleCount': 1})),
          contains('já foi remarcada'));
    });

    test('arena: até o fim, sem limite de vezes', () {
      expect(
          reason(_booking({'athleteRescheduleCount': 2}),
              actor: BookingRescheduleActor.arena,
              uid: null,
              at: DateTime(2026, 8, 5, 19)),
          isNull);
      expect(
          reason(_booking(),
              actor: BookingRescheduleActor.arena,
              uid: null,
              at: DateTime(2026, 8, 5, 20, 1)),
          contains('terminou'));
    });
  });

  test('dias: hoje até +34', () {
    final days = bookingRescheduleDays(now);
    expect(days.first, DateTime(2026, 8, 5));
    expect(days.length, BookingReschedulePolicy.horizonDays + 1);
  });

  test('preço de tabela e duração', () {
    expect(bookingTablePrice(_booking({'amountReais': 90})), 120);
    expect(bookingDurationMinutes(_booking()), 120);
  });

  group('buildBookingRescheduleOptions', () {
    List<BookingRescheduleOption> build(List<List<ArenaSlot>> slots,
            {bool sameCourt = true, String date = '2026-08-05'}) =>
        buildBookingRescheduleOptions(
          slotsByCourt: slots,
          slotCount: 2,
          day: DateTime(2026, 8, 6),
          now: now,
          bookingId: 'bk1',
          tablePriceReais: 120,
          currentDateKey: date,
          currentStartTime: '18:00',
          sameCourt: sameCourt,
        );

    test('janelas de 2 slots, ocupado e mais caro marcados', () {
      final options = build([
        [
          _slot('17:00', '18:00'),
          _slot('18:00', '19:00', status: 'booked', bookingId: 'outra'),
          _slot('19:00', '20:00', price: 80),
          _slot('20:00', '21:00'),
        ]
      ]);
      expect(options.map((o) => o.startTime), ['17:00', '18:00', '19:00']);
      expect(options[0].available, isFalse);
      expect(options[2].available, isTrue);
      expect(options[2].priceDiffReais, 20);
      expect(options[2].blockedForAthlete(), isTrue);
    });

    test('slots da própria reserva contam como livres', () {
      final options = build([
        [
          _slot('18:00', '19:00', status: 'booked', bookingId: 'bk1'),
          _slot('19:00', '20:00', status: 'booked', bookingId: 'bk1'),
        ]
      ]);
      expect(options.single.available, isTrue);
      expect(options.single.priceDiffReais, 0);
    });

    test('mesmo dia e quadra: o horário atual sai da lista', () {
      final slots = [
        [_slot('18:00', '19:00'), _slot('19:00', '20:00')]
      ];
      expect(build(slots, date: '2026-08-06'), isEmpty);
      expect(build(slots, date: '2026-08-06', sameCourt: false), hasLength(1));
    });

    test('várias quadras (sem quadra definida): livre em qualquer uma, sem preço', () {
      final options = build([
        [_slot('18:00', '19:00', status: 'booked', bookingId: 'x'), _slot('19:00', '20:00')],
        [_slot('18:00', '19:00'), _slot('19:00', '20:00')],
      ]);
      expect(options.single.available, isTrue);
      expect(options.single.priceDiffReais, isNull);
    });
  });
}
