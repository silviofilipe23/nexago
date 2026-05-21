import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:url_launcher/url_launcher.dart';

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

class TournamentPaymentResult {
  const TournamentPaymentResult({required this.initPoint});

  final String initPoint;
}

/// Cria equipe + inscrição no Firestore e gera preferência Mercado Pago.
class TournamentRegistrationService {
  TournamentRegistrationService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
    FirebaseAuth? auth,
  })  : _firestore = firestore ?? FirebaseFirestore.instance,
        _functions = functions ?? FirebaseFunctions.instance,
        _auth = auth ?? FirebaseAuth.instance;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;
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

  Future<TournamentPaymentResult> createMercadoPagoPreference({
    required String registrationId,
    required String amountType,
  }) async {
    if (registrationId.isEmpty) {
      throw TournamentRegistrationException('Inscrição inválida.');
    }
    if (amountType != 'share' && amountType != 'full') {
      throw TournamentRegistrationException('Tipo de pagamento inválido.');
    }

    try {
      final callable = _functions.httpsCallable('createMercadoPagoPreference');
      final raw = await callable.call({
        'registrationId': registrationId,
        'amountType': amountType,
      });
      final data = raw.data;
      if (data is! Map) {
        throw TournamentRegistrationException('Resposta inválida do servidor.');
      }
      final initPoint = data['initPoint'] as String?;
      if (initPoint == null || initPoint.isEmpty) {
        throw TournamentRegistrationException(
          'Link de pagamento não retornado.',
        );
      }
      return TournamentPaymentResult(initPoint: initPoint);
    } on FirebaseFunctionsException catch (e) {
      throw TournamentRegistrationException(
        e.message ?? 'Não foi possível iniciar o pagamento.',
      );
    }
  }

  Future<void> openCheckout(String initPoint) async {
    final uri = Uri.tryParse(initPoint);
    if (uri == null) {
      throw TournamentRegistrationException('URL de pagamento inválida.');
    }
    final ok = await launchUrl(uri, mode: LaunchMode.externalApplication);
    if (!ok) {
      throw TournamentRegistrationException(
        'Não foi possível abrir o checkout.',
      );
    }
  }
}

final tournamentRegistrationServiceProvider =
    Provider<TournamentRegistrationService>((ref) {
  return TournamentRegistrationService();
});
