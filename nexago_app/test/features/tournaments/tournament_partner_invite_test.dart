import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_partner_invite.dart';

void main() {
  group('TournamentPartnerInvite.fromFirestore', () {
    test('maps pending invite fields', () {
      final expires = DateTime.utc(2026, 6, 1);
      final snap = _FakeDoc(
        id: 'inv1',
        data: {
          'tournamentId': 't1',
          'categoryId': 'sub19',
          'inviterUid': 'u1',
          'inviterName': 'João Silva',
          'inviteeUid': 'u2',
          'inviteeName': 'Maria Santos',
          'status': 'pending',
          'expiresAt': Timestamp.fromDate(expires),
        },
      );

      final invite = TournamentPartnerInvite.fromFirestore(snap);

      expect(invite.id, 'inv1');
      expect(invite.tournamentId, 't1');
      expect(invite.categoryId, 'sub19');
      expect(invite.isPending, isTrue);
      expect(invite.isAccepted, isFalse);
      expect(invite.registrationId, isNull);
    });

    test('maps accepted invite with registration id', () {
      final snap = _FakeDoc(
        id: 'inv2',
        data: {
          'tournamentId': 't1',
          'categoryId': 'mc',
          'inviterUid': 'u1',
          'inviterName': 'João',
          'inviteeUid': 'u2',
          'inviteeName': 'Maria',
          'status': 'accepted',
          'registrationId': 'reg99',
          'teamId': 'team1',
          'expiresAt': Timestamp.fromDate(
            DateTime.now().add(const Duration(days: 1)),
          ),
        },
      );

      final invite = TournamentPartnerInvite.fromFirestore(snap);

      expect(invite.isAccepted, isTrue);
      expect(invite.registrationId, 'reg99');
      expect(invite.teamId, 'team1');
    });
  });

  group('TournamentPartnerInviteAcceptResult', () {
    test('fromMap parses callable response', () {
      final result = TournamentPartnerInviteAcceptResult.fromMap({
        'registrationId': 'r1',
        'teamId': 't1',
        'tournamentId': 'tor1',
        'categoryId': 'cat1',
      });

      expect(result.registrationId, 'r1');
      expect(result.tournamentId, 'tor1');
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
