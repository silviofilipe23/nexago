import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_allocation.dart';
import 'package:nexago_app/features/arenas/domain/arena_court.dart';
import 'package:nexago_app/features/arenas/domain/arena_slot.dart';
import 'package:nexago_app/features/arenas/domain/capacity_slots_logic.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';

/// Arena "a arena define a quadra" no app do atleta (`docs/product/reservas-por-capacidade.md`).
void main() {
  final day = DateTime(2026, 11, 20);
  final earlyMorning = DateTime(2026, 11, 20, 6);

  ArenaCourt court(String id, {List<String> sports = const ['beachTennis'], bool maintenance = false, int step = 60}) =>
      ArenaCourt(
        id: id,
        name: 'Quadra $id',
        sportTypes: sports,
        status: maintenance ? ArenaCourtStatus.maintenance : ArenaCourtStatus.active,
        slotDurationMinutes: step,
      );

  ArenaSlot slot(String courtId, String start, String end, {String status = 'available'}) => ArenaSlot(
        id: '$courtId-$start',
        arenaId: 'a1',
        courtId: courtId,
        date: day,
        startTime: start,
        endTime: end,
        rawStatus: status,
      );

  const allocation = ArenaBookingAllocation(
    isCapacity: true,
    courtIds: ['c2', 'c1', 'c3', 'c4'],
    priceBySport: {'beachTennis': 120},
  );

  group('ArenaBookingAllocation.fromMap', () {
    test('ausente ou modo court = quadra escolhida', () {
      expect(ArenaBookingAllocation.fromMap(null).isCapacity, isFalse);
      expect(ArenaBookingAllocation.fromMap({'mode': 'court', 'courtIds': ['c1']}).isCapacity, isFalse);
    });

    test('modo capacity lê quadras, preços válidos e opções', () {
      final a = ArenaBookingAllocation.fromMap({
        'mode': 'capacity',
        'courtIds': ['c1', ' ', 'c2'],
        'priceBySport': {'beachTennis': 120, 'footvolley': 0, 'x': 'abc'},
        'revealBeforeArrival': true,
        'allowCourtChoice': true,
      });
      expect(a.isCapacity, isTrue);
      expect(a.courtIds, ['c1', 'c2']);
      expect(a.priceBySport, {'beachTennis': 120.0});
      expect(a.revealBeforeArrival, isTrue);
      expect(a.allowCourtChoice, isTrue);
    });
  });

  group('useCapacityGrid', () {
    test('arena de sempre usa a grade por quadra', () {
      expect(useCapacityGrid(ArenaBookingAllocation.court), isFalse);
    });

    test('arena que define a quadra usa a grade por horário, mesmo vindo com quadra', () {
      expect(useCapacityGrid(allocation), isTrue);
      expect(useCapacityGrid(allocation, initialCourtId: 'c1'), isTrue);
    });

    test('modo misto: escolher a quadra (ou chegar com uma) vai para a grade por quadra', () {
      const mixed = ArenaBookingAllocation(isCapacity: true, allowCourtChoice: true);
      expect(useCapacityGrid(mixed), isTrue);
      expect(useCapacityGrid(mixed, forceCourtChoice: true), isFalse);
      expect(useCapacityGrid(mixed, initialCourtId: 'c1'), isFalse);
    });
  });

  group('capacityCandidateCourts', () {
    test('ordem da distribuição; manutenção, fora da lista e outro esporte saem', () {
      final courts = [
        court('c1'),
        court('c2'),
        court('c3', maintenance: true),
        court('c4', sports: ['footvolley']),
        court('c5'),
      ];
      expect(capacityCandidateCourts(allocation, courts, 'beachTennis').map((c) => c.id), ['c2', 'c1']);
    });

    test('quadra sem esporte cadastrado aceita qualquer esporte', () {
      expect(capacityCandidateCourts(allocation, [court('c1', sports: const [])], 'beachTennis').length, 1);
    });

    test('esportes da grade: só os com preço e quadra', () {
      const two = ArenaBookingAllocation(
        isCapacity: true,
        priceBySport: {'beachTennis': 120, 'footvolley': 100},
      );
      expect(capacitySports(two, [court('c1')]), ['beachTennis']);
    });
  });

  group('buildCapacityTimes', () {
    final candidates = [court('c1'), court('c2'), court('c3')];

    test('conta as quadras livres por horário', () {
      final times = buildCapacityTimes(
        daySlots: [
          slot('c1', '18:00', '19:00'),
          slot('c2', '18:00', '19:00', status: 'booked'),
          slot('c3', '18:00', '19:00'),
          slot('c1', '19:00', '20:00', status: 'booked'),
          slot('c2', '19:00', '20:00', status: 'blocked'),
          slot('c3', '19:00', '20:00', status: 'booked'),
        ],
        candidates: candidates,
        durationMinutes: 60,
        day: day,
        now: earlyMorning,
      );
      expect(times.map((t) => [t.startTime, t.endTime, t.freeCourts]).toList(), [
        ['18:00', '19:00', 2],
        ['19:00', '20:00', 0],
      ]);
      expect(times.last.isFull, isTrue);
      expect(times.first.totalCourts, 3);
    });

    test('2 horas exigem a mesma quadra livre nas duas', () {
      final times = buildCapacityTimes(
        daySlots: [
          // c1 livre só às 18h, c2 livre só às 19h: nenhuma quadra cobre 18h–20h sozinha.
          slot('c1', '18:00', '19:00'),
          slot('c1', '19:00', '20:00', status: 'booked'),
          slot('c2', '18:00', '19:00', status: 'booked'),
          slot('c2', '19:00', '20:00'),
          // c3 cobre as duas.
          slot('c3', '18:00', '19:00'),
          slot('c3', '19:00', '20:00'),
        ],
        candidates: candidates,
        durationMinutes: 120,
        day: day,
        now: earlyMorning,
      );
      final six = times.firstWhere((t) => t.startTime == '18:00');
      expect(six.freeCourts, 1);
      expect(six.endTime, '20:00');
      expect(six.slotStartTimes, ['18:00', '19:00']);
      // 19h + 2h passa do fim da grade de todas as quadras: não aparece.
      expect(times.any((t) => t.startTime == '19:00'), isFalse);
    });

    test('hoje: horário já começado sai', () {
      final times = buildCapacityTimes(
        daySlots: [slot('c1', '08:00', '09:00'), slot('c1', '20:00', '21:00')],
        candidates: candidates,
        durationMinutes: 60,
        day: day,
        now: DateTime(2026, 11, 20, 8, 30),
      );
      expect(times.map((t) => t.startTime), ['20:00']);
    });

    test('últimas vagas: até 2 quadras livres', () {
      const t = CapacityTime(startTime: '18:00', endTime: '19:00', freeCourts: 2, totalCourts: 15, slotStartTimes: []);
      const many = CapacityTime(startTime: '18:00', endTime: '19:00', freeCourts: 8, totalCourts: 15, slotStartTimes: []);
      expect(t.isLastSpots, isTrue);
      expect(many.isLastSpots, isFalse);
    });
  });

  group('preço e duração', () {
    test('preço do horário proporcional à duração', () {
      expect(capacityPriceFor(allocation, 'beachTennis', 60), 120);
      expect(capacityPriceFor(allocation, 'beachTennis', 90), 180);
      expect(capacityPriceFor(allocation, 'footvolley', 60), isNull);
    });

    test('durações em passos da grade, até 3 h', () {
      expect(capacityDurationOptions([court('c1')]), [60, 120, 180]);
      expect(capacityDurationOptions([court('c1', step: 30)]), [30, 60, 90, 120, 150, 180]);
    });
  });

  group('quadra que o atleta vê (Minhas reservas)', () {
    Map<String, dynamic> booking(Map<String, dynamic> extra) => {
          'arenaName': 'Arena CFC',
          'courtName': 'Quadra 7',
          'date': '2026-11-20',
          'startTime': '19:00',
          'endTime': '20:00',
          ...extra,
        };

    test('sem quadra definida mostra "Quadra definida na chegada", nunca a provisória', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(booking({'allocationStatus': 'unassigned', 'allocationSource': 'auto'})),
      );
      expect(item.courtName, kCourtOnArrivalLabel);
    });

    test('reserva comum mostra a quadra', () {
      expect(MyBookingItem.fromFirestore(_FakeDoc(booking({}))).courtName, 'Quadra 7');
    });

    test('definida pela recepção numa arena que só mostra na chegada: escondida até o início', () {
      final data = booking({
        'allocationStatus': 'assigned',
        'allocationSource': 'staff',
        'revealCourtBeforeArrival': false,
      });
      expect(athleteVisibleCourtName(data, 'Quadra 7', now: DateTime(2026, 11, 20, 18)), kCourtOnArrivalLabel);
      expect(athleteVisibleCourtName(data, 'Quadra 7', now: DateTime(2026, 11, 20, 19)), 'Quadra 7');
      final reveal = {...data, 'revealCourtBeforeArrival': true};
      expect(athleteVisibleCourtName(reveal, 'Quadra 7', now: DateTime(2026, 11, 20, 18)), 'Quadra 7');
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc(this._fields);

  final Map<String, dynamic> _fields;

  @override
  String get id => 'b1';

  @override
  bool get exists => true;

  @override
  DocumentReference<Map<String, dynamic>> get reference => throw UnimplementedError();

  @override
  SnapshotMetadata get metadata => throw UnimplementedError();

  @override
  Map<String, dynamic>? data() => _fields;

  @override
  dynamic get(Object field) => _fields[field];

  @override
  dynamic operator [](Object field) => _fields[field];
}
