import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/athlete/domain/athlete_inbox_notification.dart';

void main() {
  group('AthleteInboxNotification.fromFirestore', () {
    test('maps fields and data map', () {
      final snap = _FakeDoc(
        id: 'n1',
        fields: {
          'title': 'Convite para torneio',
          'body': 'João te convidou',
          'type': 'tournament_partner_invite',
          'data': {
            'inviteId': 'inv1',
            'tournamentId': 't1',
          },
          'read': false,
          'dismissed': false,
          'createdAt': Timestamp.fromDate(DateTime.utc(2026, 5, 26)),
        },
      );

      final n = AthleteInboxNotification.fromFirestore(snap);

      expect(n.id, 'n1');
      expect(n.title, 'Convite para torneio');
      expect(n.type, 'tournament_partner_invite');
      expect(n.data['inviteId'], 'inv1');
      expect(n.isUnread, isTrue);
    });
  });
}

class _FakeDoc implements DocumentSnapshot<Map<String, dynamic>> {
  _FakeDoc({required this.id, required Map<String, dynamic> fields})
      : _fields = fields;

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
