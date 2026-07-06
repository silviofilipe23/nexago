import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

import 'package:nexago_app/core/profiles/app_user_profile.dart';
import '../domain/tournament_staff/tournament_staff_models.dart';

/// CRUD de `tournaments/{id}/staff/{uid}` (somente o dono passa nas rules).
/// O espelho `users/{uid}/tournamentStaff/{id}` e a notificação de adição são
/// mantidos pela Cloud Function `onTournamentStaffWrittenSyncMirror`.
class TournamentStaffRepository {
  TournamentStaffRepository(this._firestore, this._auth);

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> _staff(String tournamentId) =>
      _firestore.collection('tournaments/${tournamentId.trim()}/staff');

  Stream<List<TournamentStaffMember>> watchStaff(String tournamentId) {
    return _staff(tournamentId).snapshots().map((snap) {
      final members = snap.docs
          .map(TournamentStaffMember.fromFirestore)
          .toList();
      members.sort((a, b) {
        final aDate = a.addedAt;
        final bDate = b.addedAt;
        if (aDate == null && bDate == null) return 0;
        if (aDate == null) return 1;
        if (bDate == null) return -1;
        return aDate.compareTo(bDate);
      });
      return members;
    });
  }

  Future<void> addStaff({
    required String tournamentId,
    required AppUserProfile user,
    required TournamentStaffRole role,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null) {
      throw StateError('Usuário não autenticado');
    }
    await _staff(tournamentId).doc(user.uid).set({
      'role': role.value,
      'status': 'active',
      'displayName': user.fullName ?? '',
      'nickname': user.nickname ?? '',
      'photoUrl': user.profilePhotoUrl,
      'addedBy': uid,
      'addedAt': FieldValue.serverTimestamp(),
    });
  }

  Future<void> updateStaffRole({
    required String tournamentId,
    required String staffUid,
    required TournamentStaffRole role,
  }) async {
    await _staff(tournamentId).doc(staffUid.trim()).update({
      'role': role.value,
      'status': 'active',
    });
  }

  Future<void> removeStaff({
    required String tournamentId,
    required String staffUid,
  }) async {
    await _staff(tournamentId).doc(staffUid.trim()).delete();
  }
}
