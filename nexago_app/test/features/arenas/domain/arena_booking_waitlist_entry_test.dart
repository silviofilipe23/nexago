import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/arenas/domain/arena_booking_waitlist_entry.dart';

void main() {
  group('ArenaBookingWaitlistEntry.fromFirestore', () {
    test('parseia campos básicos e status waiting', () {
      final entry = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(
          id: 'w1',
          data: {
            'arenaId': 'arena1',
            'courtId': 'court1',
            'date': '2026-07-20',
            'startTime': '18:00',
            'endTime': '19:00',
            'athleteId': 'user1',
            'status': 'waiting',
            'arenaName': 'Arena Beach',
            'courtName': 'Quadra 1',
          },
        ),
      );

      expect(entry.id, 'w1');
      expect(entry.arenaId, 'arena1');
      expect(entry.courtId, 'court1');
      expect(entry.dateKey, '2026-07-20');
      expect(entry.startTime, '18:00');
      expect(entry.endTime, '19:00');
      expect(entry.athleteId, 'user1');
      expect(entry.status, ArenaBookingWaitlistStatus.waiting);
      expect(entry.arenaName, 'Arena Beach');
      expect(entry.courtName, 'Quadra 1');
      expect(entry.isWaiting, isTrue);
      expect(entry.isNotified, isFalse);
      expect(entry.isActive, isTrue);
    });

    test('status ausente ou desconhecido cai em waiting por padrão', () {
      final missing = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(id: 'w2', data: {}),
      );
      final unknown = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(id: 'w3', data: {'status': 'algumacoisa'}),
      );

      expect(missing.status, ArenaBookingWaitlistStatus.waiting);
      expect(unknown.status, ArenaBookingWaitlistStatus.waiting);
    });

    test('status notified/expired/converted mapeiam corretamente', () {
      ArenaBookingWaitlistStatus statusOf(String raw) =>
          ArenaBookingWaitlistEntry.fromFirestore(
            _FakeDoc(id: 'x', data: {'status': raw}),
          ).status;

      expect(statusOf('notified'), ArenaBookingWaitlistStatus.notified);
      expect(statusOf('expired'), ArenaBookingWaitlistStatus.expired);
      expect(statusOf('converted'), ArenaBookingWaitlistStatus.converted);
    });

    test('isActive é falso para expired/converted', () {
      final expired = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(id: 'e1', data: {'status': 'expired'}),
      );
      final converted = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(id: 'c1', data: {'status': 'converted'}),
      );

      expect(expired.isActive, isFalse);
      expect(converted.isActive, isFalse);
    });
  });

  group('remainingNotifyWindow', () {
    test('null quando status não é notified', () {
      final entry = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(
          id: 'w1',
          data: {
            'status': 'waiting',
            'expiresAt': Timestamp.fromDate(
              DateTime.now().add(const Duration(minutes: 5)),
            ),
          },
        ),
      );
      expect(entry.remainingNotifyWindow, isNull);
    });

    test('null quando notified mas sem expiresAt', () {
      final entry = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(id: 'w1', data: {'status': 'notified'}),
      );
      expect(entry.remainingNotifyWindow, isNull);
    });

    test('positivo quando expiresAt ainda no futuro', () {
      final entry = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(
          id: 'w1',
          data: {
            'status': 'notified',
            'expiresAt': Timestamp.fromDate(
              DateTime.now().add(const Duration(minutes: 10)),
            ),
          },
        ),
      );
      final remaining = entry.remainingNotifyWindow;
      expect(remaining, isNotNull);
      expect(remaining!.inMinutes, greaterThanOrEqualTo(9));
    });

    test('Duration.zero quando expiresAt já passou (nunca negativo)', () {
      final entry = ArenaBookingWaitlistEntry.fromFirestore(
        _FakeDoc(
          id: 'w1',
          data: {
            'status': 'notified',
            'expiresAt': Timestamp.fromDate(
              DateTime.now().subtract(const Duration(minutes: 1)),
            ),
          },
        ),
      );
      expect(entry.remainingNotifyWindow, Duration.zero);
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
