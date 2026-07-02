import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_payment.dart';

MyBookingItem _item({String? recurringBookingId}) => MyBookingItem(
      id: 'b1',
      arenaName: 'Arena Beach',
      dateRaw: '2026-07-02',
      startTime: '19:00',
      endTime: '20:00',
      rawStatus: 'active',
      paymentDisplay: const MyBookingPaymentDisplay(label: ''),
      recurringBookingId: recurringBookingId,
    );

void main() {
  group('MyBookingItem.isRecurring', () {
    test('true quando recurringBookingId presente', () {
      expect(_item(recurringBookingId: 'rec1').isRecurring, isTrue);
    });

    test('false quando recurringBookingId null (reserva avulsa)', () {
      expect(_item().isRecurring, isFalse);
    });
  });

  group('MyBookingItem.fromFirestore — recurringBookingId', () {
    test('parseia e apara o id da série', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b1',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-07-08',
            'startTime': '19:00',
            'endTime': '20:00',
            'recurringBookingId': '  rec1  ',
          },
        ),
      );

      expect(item.recurringBookingId, 'rec1');
      expect(item.isRecurring, isTrue);
    });

    test('ausente vira null e isRecurring false', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b2',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-07-08',
            'startTime': '19:00',
            'endTime': '20:00',
          },
        ),
      );

      expect(item.recurringBookingId, isNull);
      expect(item.isRecurring, isFalse);
    });

    test('string vazia/em branco ou não-string viram null', () {
      final empty = MyBookingItem.fromFirestore(
        _FakeDoc(id: 'a', data: {'recurringBookingId': ''}),
      );
      final blank = MyBookingItem.fromFirestore(
        _FakeDoc(id: 'b', data: {'recurringBookingId': '   '}),
      );
      final nonString = MyBookingItem.fromFirestore(
        _FakeDoc(id: 'c', data: {'recurringBookingId': 123}),
      );

      expect(empty.recurringBookingId, isNull);
      expect(empty.isRecurring, isFalse);
      expect(blank.recurringBookingId, isNull);
      expect(nonString.recurringBookingId, isNull);
    });

    test('não interfere nos demais campos da reserva', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b3',
          data: {
            'arenaName': 'Arena Beach',
            'courtName': 'Quadra 1',
            'date': '2026-07-08',
            'startTime': '19:00',
            'endTime': '20:00',
            'status': 'active',
            'amountReais': 120,
            'recurringBookingId': 'rec1',
          },
        ),
      );

      expect(item.arenaName, 'Arena Beach');
      expect(item.courtName, 'Quadra 1');
      expect(item.dateRaw, '2026-07-08');
      expect(item.rawStatus, 'active');
      expect(item.amountReais, 120);
      expect(item.recurringBookingId, 'rec1');
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
