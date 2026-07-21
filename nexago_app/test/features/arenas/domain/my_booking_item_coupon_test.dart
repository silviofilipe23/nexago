import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/my_booking_item.dart';

void main() {
  group('MyBookingItem.fromFirestore — cupom', () {
    test('parseia couponCode e couponDiscountReais quando presentes', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b1',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
            'couponCode': 'VERAO10',
            'couponDiscountReais': 15.0,
          },
        ),
      );

      expect(item.couponCode, 'VERAO10');
      expect(item.couponDiscountReais, 15.0);
    });

    test('reserva sem cupom: os dois campos ficam null', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b2',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
          },
        ),
      );

      expect(item.couponCode, isNull);
      expect(item.couponDiscountReais, isNull);
    });

    test('couponCode em branco vira null', () {
      final item = MyBookingItem.fromFirestore(
        _FakeDoc(
          id: 'b3',
          data: {
            'arenaName': 'Arena Beach',
            'date': '2026-08-10',
            'startTime': '19:00',
            'endTime': '20:00',
            'couponCode': '   ',
          },
        ),
      );

      expect(item.couponCode, isNull);
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
