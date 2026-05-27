import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/tournament_partner_invite.dart';

class TournamentPartnerInviteException implements Exception {
  TournamentPartnerInviteException(this.message);
  final String message;

  @override
  String toString() => message;
}

class TournamentPartnerInviteService {
  TournamentPartnerInviteService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions = functions ?? FirebaseFunctions.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;
  final FirebaseAuth _auth;

  static const _collection = 'tournamentRegistrationInvites';

  Future<String> sendInvite({
    required String tournamentId,
    required String categoryId,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw TournamentPartnerInviteException('Faça login para enviar o convite.');
    }

    try {
      final callable = _functions.httpsCallable('sendTournamentPartnerInvite');
      final raw = await callable.call({
        'tournamentId': tournamentId,
        'categoryId': categoryId,
        'inviteeUid': inviteeUid,
        'inviteeName': inviteeName,
        'inviterName': inviterName,
      });
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      final inviteId = data['inviteId'] as String?;
      if (inviteId == null || inviteId.isEmpty) {
        throw TournamentPartnerInviteException('Convite não foi criado.');
      }
      return inviteId;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível enviar o convite.',
      );
    }
  }

  Future<TournamentPartnerInviteAcceptResult> acceptInvite(String inviteId) async {
    if (inviteId.isEmpty) {
      throw TournamentPartnerInviteException('Convite inválido.');
    }

    try {
      final callable = _functions.httpsCallable('acceptTournamentPartnerInvite');
      final raw = await callable.call({'inviteId': inviteId});
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      return TournamentPartnerInviteAcceptResult.fromMap(data);
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível aceitar o convite.',
      );
    }
  }

  Future<void> cancelInvite(String inviteId, {bool asDecline = false}) async {
    if (inviteId.isEmpty) {
      throw TournamentPartnerInviteException('Convite inválido.');
    }

    try {
      final callable = _functions.httpsCallable('cancelTournamentPartnerInvite');
      await callable.call({
        'inviteId': inviteId,
        'asDecline': asDecline,
      });
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível cancelar o convite.',
      );
    }
  }

  Stream<TournamentPartnerInvite?> watchInvite(String inviteId) {
    if (inviteId.isEmpty) return Stream.value(null);
    return _firestore.collection(_collection).doc(inviteId).snapshots().map((snap) {
      if (!snap.exists) return null;
      return TournamentPartnerInvite.fromFirestore(snap);
    });
  }

  Stream<List<TournamentPartnerInvite>> watchPendingForInvitee(String uid) {
    if (uid.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(_collection)
        .where('inviteeUid', isEqualTo: uid)
        .where('status', isEqualTo: 'pending')
        .snapshots()
        .map((snap) => snap.docs
            .map(TournamentPartnerInvite.fromFirestore)
            .where((i) => !i.isExpired)
            .toList());
  }

  /// Convites enviados pelo atleta (pendentes ou aceitos, ainda relevantes).
  Stream<List<TournamentPartnerInvite>> watchInvitesAsInviter(String uid) {
    if (uid.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(_collection)
        .where('inviterUid', isEqualTo: uid)
        .where('status', whereIn: ['pending', 'accepted'])
        .snapshots()
        .map((snap) {
      final invites = snap.docs
          .map(TournamentPartnerInvite.fromFirestore)
          .where((i) => !i.isExpired)
          .toList();
      invites.sort((a, b) => b.createdAt.compareTo(a.createdAt));
      return invites;
    });
  }
}

final tournamentPartnerInviteServiceProvider =
    Provider<TournamentPartnerInviteService>((ref) {
  return TournamentPartnerInviteService();
});
