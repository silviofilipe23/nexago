import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_recurring_booking.dart';

void main() {
  group('ArenaRecurringBooking.fromFirestore', () {
    test('mapeia documento completo de mensalista com conta no app', () {
      final created = DateTime.utc(2026, 6, 1, 12);
      final snap = _FakeDoc(
        id: 'rec1',
        data: {
          'arenaId': 'arena1',
          'arenaName': 'Arena Beach',
          'courtId': 'court1',
          'courtName': 'Quadra 1',
          'weekday': 3,
          'startTime': '19:00',
          'endTime': '20:00',
          'athleteId': 'ath1',
          'amountReais': 120.5,
          'status': 'active',
          'startDate': '2026-06-03',
          'endDate': '2026-12-30',
          'skippedDates': ['2026-06-10'],
          'createdAt': Timestamp.fromDate(created),
        },
      );

      final booking = ArenaRecurringBooking.fromFirestore(snap);

      expect(booking.id, 'rec1');
      expect(booking.arenaId, 'arena1');
      expect(booking.arenaName, 'Arena Beach');
      expect(booking.courtId, 'court1');
      expect(booking.courtName, 'Quadra 1');
      expect(booking.weekday, 3);
      expect(booking.startTime, '19:00');
      expect(booking.endTime, '20:00');
      expect(booking.athleteId, 'ath1');
      expect(booking.customerName, isNull);
      expect(booking.amountReais, 120.5);
      expect(booking.status, 'active');
      expect(booking.isActive, isTrue);
      expect(booking.startDate, '2026-06-03');
      expect(booking.endDate, '2026-12-30');
      expect(booking.skippedDates, ['2026-06-10']);
      // Timestamp.toDate() retorna horário local; compara o instante.
      expect(booking.createdAt?.toUtc(), created);
    });

    test('mapeia mensalista sem conta (customerName) e sem athleteId', () {
      final snap = _FakeDoc(
        id: 'rec2',
        data: {
          'arenaId': 'arena1',
          'customerName': '  Carlos Silva  ',
          'weekday': 6,
          'startTime': '08:00',
          'endTime': '09:00',
          'startDate': '2026-06-06',
        },
      );

      final booking = ArenaRecurringBooking.fromFirestore(snap);

      expect(booking.athleteId, isNull);
      expect(booking.customerName, 'Carlos Silva'); // aparado
    });

    test('doc vazio usa fallbacks seguros', () {
      final booking =
          ArenaRecurringBooking.fromFirestore(_FakeDoc(id: 'rec3', data: {}));

      expect(booking.id, 'rec3');
      expect(booking.arenaId, '');
      expect(booking.arenaName, 'Arena');
      expect(booking.courtId, '');
      expect(booking.courtName, 'Quadra');
      expect(booking.weekday, 0);
      expect(booking.weekdayLabel, '');
      expect(booking.startTime, '--:--');
      expect(booking.endTime, '--:--');
      expect(booking.athleteId, isNull);
      expect(booking.customerName, isNull);
      expect(booking.amountReais, 0);
      expect(booking.status, 'active');
      expect(booking.isActive, isTrue);
      expect(booking.startDate, '');
      expect(booking.endDate, isNull);
      expect(booking.skippedDates, isEmpty);
      expect(booking.createdAt, isNull);
    });

    test('endDate ausente ou em branco vira null (série sem término)', () {
      final absent =
          ArenaRecurringBooking.fromFirestore(_FakeDoc(id: 'a', data: {}));
      final blank = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'b', data: {'endDate': '   '}),
      );

      expect(absent.endDate, isNull);
      expect(blank.endDate, isNull);
    });

    test('athleteId/customerName em branco ou não-string viram null', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(
          id: 'rec4',
          data: {'athleteId': '   ', 'customerName': 42},
        ),
      );

      expect(booking.athleteId, isNull);
      expect(booking.customerName, isNull);
    });

    test('weekday aceita num (double) e converte para int', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec5', data: {'weekday': 5.0}),
      );

      expect(booking.weekday, 5);
      expect(booking.weekdayLabel, 'Sexta-feira');
    });

    test('horários com segundos são truncados para HH:mm', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(
          id: 'rec6',
          data: {'startTime': '19:00:00', 'endTime': ' 20:30:15 '},
        ),
      );

      expect(booking.startTime, '19:00');
      expect(booking.endTime, '20:30');
    });

    test('horário não-string ou curto usa placeholder/valor cru', () {
      final nonString = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'a', data: {'startTime': 1900}),
      );
      final short = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'b', data: {'startTime': '9:0'}),
      );

      expect(nonString.startTime, '--:--');
      expect(short.startTime, '9:0');
    });

    test('skippedDates ordena, apara e descarta entradas inválidas', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(
          id: 'rec7',
          data: {
            'skippedDates': [
              '2026-07-15',
              ' 2026-06-10 ',
              '',
              '   ',
              123,
              null,
              '2026-06-24',
            ],
          },
        ),
      );

      expect(
        booking.skippedDates,
        ['2026-06-10', '2026-06-24', '2026-07-15'],
      );
    });

    test('skippedDates não-lista vira lista vazia', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec8', data: {'skippedDates': 'não-é-lista'}),
      );

      expect(booking.skippedDates, isEmpty);
    });

    test('status canceled não é ativo', () {
      final booking = ArenaRecurringBooking.fromFirestore(
        _FakeDoc(id: 'rec9', data: {'status': 'canceled'}),
      );

      expect(booking.isActive, isFalse);
    });
  });

  group('ArenaRecurringBooking.weekdayLabel', () {
    ArenaRecurringBooking withWeekday(int weekday) => ArenaRecurringBooking(
          id: 'x',
          arenaId: 'a',
          arenaName: 'Arena',
          courtId: 'c',
          courtName: 'Quadra',
          weekday: weekday,
          startTime: '19:00',
          endTime: '20:00',
          amountReais: 0,
          status: 'active',
          startDate: '2026-06-01',
          skippedDates: const [],
        );

    test('rotula 1..7 no padrão ISO (segunda a domingo)', () {
      expect(withWeekday(1).weekdayLabel, 'Segunda-feira');
      expect(withWeekday(2).weekdayLabel, 'Terça-feira');
      expect(withWeekday(3).weekdayLabel, 'Quarta-feira');
      expect(withWeekday(4).weekdayLabel, 'Quinta-feira');
      expect(withWeekday(5).weekdayLabel, 'Sexta-feira');
      expect(withWeekday(6).weekdayLabel, 'Sábado');
      expect(withWeekday(7).weekdayLabel, 'Domingo');
    });

    test('fora do range (0, 8, negativo) retorna vazio sem lançar', () {
      expect(withWeekday(0).weekdayLabel, '');
      expect(withWeekday(8).weekdayLabel, '');
      expect(withWeekday(-1).weekdayLabel, '');
    });
  });

  group('CreateRecurringBookingResult', () {
    test('mantém seriesId, datas criadas e puladas', () {
      const result = CreateRecurringBookingResult(
        seriesId: 'rec1',
        createdDates: ['2026-06-03', '2026-06-17'],
        skippedDates: ['2026-06-10'],
      );

      expect(result.seriesId, 'rec1');
      expect(result.createdDates, ['2026-06-03', '2026-06-17']);
      expect(result.skippedDates, ['2026-06-10']);
    });

    test('aceita listas vazias (nenhum conflito)', () {
      const result = CreateRecurringBookingResult(
        seriesId: 'rec2',
        createdDates: [],
        skippedDates: [],
      );

      expect(result.createdDates, isEmpty);
      expect(result.skippedDates, isEmpty);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> data})
      : _fields = data;

  @override
  final String id;
  final Map<String, dynamic> _fields;

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference =>
      throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
