import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arena/domain/arena_manager_booking.dart';

ArenaManagerBooking _booking(Map<String, dynamic> data) => ArenaManagerBooking(
      id: 'b1',
      athleteId: 'ath1',
      courtId: 'c1',
      courtName: 'Quadra 1',
      dateKey: '2026-07-02',
      startTime: '19:00',
      endTime: '20:00',
      data: data,
    );

void main() {
  group('ArenaManagerBooking.isRecurring', () {
    test('true quando isRecurring == true no documento', () {
      expect(_booking({'isRecurring': true}).isRecurring, isTrue);
    });

    test('true quando recurringBookingId presente, mesmo sem flag', () {
      expect(
        _booking({'recurringBookingId': 'rec1'}).isRecurring,
        isTrue,
      );
    });

    test('true quando flag e id presentes juntos', () {
      expect(
        _booking({'isRecurring': true, 'recurringBookingId': 'rec1'})
            .isRecurring,
        isTrue,
      );
    });

    test('false quando nenhum dos campos existe (reserva avulsa)', () {
      expect(_booking({}).isRecurring, isFalse);
    });

    test('false quando isRecurring é false e id é vazio/em branco', () {
      expect(
        _booking({'isRecurring': false, 'recurringBookingId': ''}).isRecurring,
        isFalse,
      );
      expect(
        _booking({'recurringBookingId': '   '}).isRecurring,
        isFalse,
      );
    });

    test('false para valores truthy não-booleanos (string "true", 1)', () {
      expect(_booking({'isRecurring': 'true'}).isRecurring, isFalse);
      expect(_booking({'isRecurring': 1}).isRecurring, isFalse);
    });
  });

  group('ArenaManagerBooking.recurringBookingId', () {
    test('retorna o id aparado quando presente', () {
      expect(
        _booking({'recurringBookingId': '  rec1  '}).recurringBookingId,
        'rec1',
      );
    });

    test('null quando ausente, vazio ou não-string', () {
      expect(_booking({}).recurringBookingId, isNull);
      expect(_booking({'recurringBookingId': ''}).recurringBookingId, isNull);
      expect(
        _booking({'recurringBookingId': '   '}).recurringBookingId,
        isNull,
      );
      expect(_booking({'recurringBookingId': 42}).recurringBookingId, isNull);
    });
  });

  group('ArenaManagerBooking.customerName', () {
    test('retorna o nome aparado do mensalista sem conta', () {
      expect(
        _booking({'customerName': '  Carlos Silva  '}).customerName,
        'Carlos Silva',
      );
    });

    test('null quando ausente, vazio ou não-string', () {
      expect(_booking({}).customerName, isNull);
      expect(_booking({'customerName': '   '}).customerName, isNull);
      expect(_booking({'customerName': 7}).customerName, isNull);
    });
  });

  group('ArenaManagerBooking.fromFirestore (ocorrência de horário fixo)', () {
    test('preserva campos crus e expõe getters de recorrência', () {
      final snap = _FakeDoc(
        id: 'occ1',
        data: {
          'athleteId': 'ath1',
          'courtId': 'c1',
          'courtName': 'Quadra 1',
          'date': '2026-07-08',
          'startTime': '19:00',
          'endTime': '20:00',
          'isRecurring': true,
          'recurringBookingId': 'rec1',
          'customerName': 'Carlos Silva',
        },
      );

      final booking = ArenaManagerBooking.fromFirestore(snap);

      expect(booking.id, 'occ1');
      expect(booking.isRecurring, isTrue);
      expect(booking.recurringBookingId, 'rec1');
      expect(booking.customerName, 'Carlos Silva');
    });

    test('reserva avulsa não é marcada como recorrente', () {
      final snap = _FakeDoc(
        id: 'occ2',
        data: {
          'athleteId': 'ath1',
          'date': '2026-07-08',
          'startTime': '19:00',
          'endTime': '20:00',
        },
      );

      final booking = ArenaManagerBooking.fromFirestore(snap);

      expect(booking.isRecurring, isFalse);
      expect(booking.recurringBookingId, isNull);
      expect(booking.customerName, isNull);
    });
  });

  group('ArenaManagerBooking.enrichCourtName preserva dados de recorrência',
      () {
    test('getters continuam válidos após enriquecer o nome da quadra', () {
      final booking = _booking({
        'isRecurring': true,
        'recurringBookingId': 'rec1',
        'customerName': 'Carlos',
      });

      final enriched = booking.enrichCourtName({'c1': 'Quadra Central'});

      expect(enriched.courtName, 'Quadra Central');
      expect(enriched.isRecurring, isTrue);
      expect(enriched.recurringBookingId, 'rec1');
      expect(enriched.customerName, 'Carlos');
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
