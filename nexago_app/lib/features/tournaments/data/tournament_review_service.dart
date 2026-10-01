import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/functions_region.dart';
import '../domain/tournament_review_models.dart';
import 'tournament_partner_invite_service.dart' show callableErrorMessage;

class TournamentReviewException implements Exception {
  const TournamentReviewException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Leitura do convite e da própria avaliação + envio pela callable `submitTournamentReview`.
/// O cliente nunca grava nas coleções da avaliação (rules: `write: false`).
class TournamentReviewService {
  TournamentReviewService({
    FirebaseFirestore? firestore,
    FirebaseFunctions? functions,
  })  : _firestoreOverride = firestore,
        _functionsOverride = functions;

  final FirebaseFirestore? _firestoreOverride;
  final FirebaseFunctions? _functionsOverride;

  // Preguiçosos: o teste do envio injeta só o fake de functions e nunca toca no Firestore.
  FirebaseFirestore get _firestore =>
      _firestoreOverride ?? FirebaseFirestore.instance;
  FirebaseFunctions get _functions => _functionsOverride ?? nexagoFunctions;

  static const _submitFallback =
      'Não foi possível enviar sua avaliação. Tente de novo em instantes.';

  CollectionReference<Map<String, dynamic>> _invites(String uid) => _firestore
      .collection('users')
      .doc(uid)
      .collection('tournamentReviewInvites');

  Stream<List<TournamentReviewInvite>> watchPendingInvites(String uid) =>
      _invites(uid).where('status', isEqualTo: 'pending').snapshots().map(
            (snap) => snap.docs
                .map((d) => TournamentReviewInvite.fromMap(d.id, d.data()))
                .whereType<TournamentReviewInvite>()
                .toList(),
          );

  Stream<TournamentReviewInvite?> watchInvite(String uid, String tournamentId) =>
      _invites(uid).doc(tournamentId).snapshots().map(
            (snap) => TournamentReviewInvite.fromMap(snap.id, snap.data()),
          );

  /// Só depois de o convite dizer `submitted`: a rule nega leitura de doc inexistente.
  Future<MyTournamentReview?> fetchMyReview(String uid, String tournamentId) async {
    final snap = await _firestore
        .collection('tournamentReviews')
        .doc('${tournamentId}_$uid')
        .get();
    return MyTournamentReview.fromMap(snap.data());
  }

  /// `true` na 1ª avaliação (é quando o XP é pago), `false` numa edição.
  Future<bool> submit({
    required String tournamentId,
    required int overall,
    required Map<TournamentReviewAspect, int> aspects,
    String? comment,
  }) async {
    final trimmed = comment?.trim() ?? '';
    try {
      final result = await _functions
          .httpsCallable('submitTournamentReview')
          .call<Object?>({
        'tournamentId': tournamentId,
        'overall': overall,
        'aspects': {for (final e in aspects.entries) e.key.key: e.value},
        'comment': trimmed.isEmpty ? null : trimmed,
      });
      final data = result.data;
      return data is Map && data['created'] == true;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentReviewException(
        callableErrorMessage(e.code, e.message, _submitFallback),
      );
    }
  }
}

final tournamentReviewServiceProvider = Provider<TournamentReviewService>((ref) {
  return TournamentReviewService();
});
