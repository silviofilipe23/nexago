import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'nexago_artifacts_paths.dart';

class TournamentRegistrationException implements Exception {
  TournamentRegistrationException(this.message);
  final String message;

  @override
  String toString() => message;
}

class TournamentRegistrationResult {
  const TournamentRegistrationResult({
    required this.registrationId,
    required this.teamId,
  });

  final String registrationId;
  final String teamId;
}

/// Estado da inscrição no Firestore (pagamento acumulado).
class TournamentRegistrationSnapshot {
  const TournamentRegistrationSnapshot({
    required this.registrationId,
    required this.isPaid,
    required this.paidAmount,
    this.sharePaidUids = const [],
  });

  final String registrationId;
  final bool isPaid;
  final double paidAmount;
  final List<String> sharePaidUids;

  factory TournamentRegistrationSnapshot.fromDoc(
    String registrationId,
    Map<String, dynamic> data,
  ) {
    final rawUids = data['sharePaidUids'];
    final uids = rawUids is List
        ? rawUids
            .whereType<String>()
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty)
            .toList()
        : <String>[];
    return TournamentRegistrationSnapshot(
      registrationId: registrationId,
      isPaid: data['isPaid'] == true,
      paidAmount: (data['paidAmount'] as num?)?.toDouble() ?? 0,
      sharePaidUids: uids,
    );
  }

  bool athleteSharePaid(String athleteUid) {
    if (athleteUid.isEmpty) return false;
    return sharePaidUids.contains(athleteUid);
  }
}

/// Cria equipe + inscrição no Firestore e gera preferência Mercado Pago.
class TournamentRegistrationService {
  TournamentRegistrationService({
    FirebaseFirestore? firestore,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseAuth _auth;

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  Future<TournamentRegistrationResult> createRegistration({
    required String tournamentId,
    required String categoryId,
    String? partnerUserId,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw TournamentRegistrationException('Faça login para se inscrever.');
    }
    if (tournamentId.isEmpty || categoryId.isEmpty) {
      throw TournamentRegistrationException('Torneio ou categoria inválidos.');
    }

    final player2 = (partnerUserId != null && partnerUserId.isNotEmpty)
        ? partnerUserId
        : uid;

    try {
      final teamRef = _teams.doc();
      await teamRef.set({
        'player1Id': uid,
        'player2Id': player2,
        'createdAt': FieldValue.serverTimestamp(),
      });

      final regRef = _inscriptions.doc();
      await regRef.set({
        'teamId': teamRef.id,
        'tournamentId': tournamentId,
        'categoryId': categoryId,
        'isPaid': false,
        'paidAmount': 0,
        'createdAt': FieldValue.serverTimestamp(),
      });

      return TournamentRegistrationResult(
        registrationId: regRef.id,
        teamId: teamRef.id,
      );
    } on FirebaseException catch (e) {
      throw TournamentRegistrationException(
        e.message ??
            'Não foi possível criar a inscrição. Tente pelo site ou contate o organizador.',
      );
    }
  }

  Stream<TournamentRegistrationSnapshot?> watchRegistration(
    String registrationId,
  ) {
    if (registrationId.isEmpty) return Stream.value(null);
    return _inscriptions.doc(registrationId).snapshots().map((snap) {
      if (!snap.exists) return null;
      return TournamentRegistrationSnapshot.fromDoc(snap.id, snap.data()!);
    });
  }

  /// Observa várias inscrições (ex.: filtrar convites na Home).
  Stream<Map<String, TournamentRegistrationSnapshot?>> watchRegistrationSnapshots(
    Set<String> registrationIds,
  ) {
    if (registrationIds.isEmpty) return Stream.value(const {});
    return Stream.multi((controller) {
      final snapshots = <String, TournamentRegistrationSnapshot?>{};
      final subscriptions = <StreamSubscription<TournamentRegistrationSnapshot?>>[];

      void emit() {
        controller.add(Map<String, TournamentRegistrationSnapshot?>.from(snapshots));
      }

      for (final id in registrationIds) {
        subscriptions.add(
          watchRegistration(id).listen(
            (snap) {
              snapshots[id] = snap;
              emit();
            },
            onError: controller.addError,
          ),
        );
      }

      controller.onCancel = () async {
        for (final sub in subscriptions) {
          await sub.cancel();
        }
      };
    });
  }

  /// Inscrição + equipe para o comprovante de sucesso.
  Future<({
    String registrationId,
    String categoryId,
    String player1Id,
    String player2Id,
    bool isPaid,
    DateTime? registeredAt,
  })?> loadRegistrationTeam(String registrationId) async {
    final id = registrationId.trim();
    if (id.isEmpty) return null;

    final regSnap = await _inscriptions.doc(id).get();
    if (!regSnap.exists) return null;
    final data = regSnap.data()!;
    final teamId = (data['teamId'] as String?)?.trim() ?? '';
    if (teamId.isEmpty) return null;

    final teamSnap = await _teams.doc(teamId).get();
    if (!teamSnap.exists) return null;
    final team = teamSnap.data()!;
    final p1 = (team['player1Id'] as String?)?.trim() ?? '';
    final p2 = (team['player2Id'] as String?)?.trim() ?? '';
    if (p1.isEmpty || p2.isEmpty) return null;

    final createdAt = data['createdAt'];
    final registeredAt = createdAt is Timestamp ? createdAt.toDate() : null;

    return (
      registrationId: id,
      categoryId: (data['categoryId'] as String?)?.trim() ?? '',
      player1Id: p1,
      player2Id: p2,
      isPaid: data['isPaid'] == true,
      registeredAt: registeredAt,
    );
  }
}

final tournamentRegistrationServiceProvider =
    Provider<TournamentRegistrationService>((ref) {
  return TournamentRegistrationService();
});
