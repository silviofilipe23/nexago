import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/firebase/firebase_providers.dart';
import '../../../core/firebase/functions_region.dart';
import '../../tournaments/data/tournament_partner_invite_service.dart'
    show callableErrorMessage;
import '../domain/athlete_training.dart';
import '../domain/class_review.dart';
import 'class_presence_repository.dart' show ClassPresenceException;

/// O que a tela manda para `submitClassReview`.
class ClassReviewDraft {
  const ClassReviewDraft({
    required this.training,
    required this.scores,
    this.comment = '',
    this.showName = true,
    this.wantsContact = false,
  });

  final TrainingSession training;
  final Map<ReviewPart, PartScore> scores;
  final String comment;
  final bool showName;
  final bool wantsContact;

  Map<String, Object?> toCallable() {
    final t = training;
    return {
      'origin': switch (t.origin) {
        TrainingOrigin.arena => 'arena',
        TrainingOrigin.center => 'center',
        TrainingOrigin.private => 'private',
      },
      if (t.origin == TrainingOrigin.private)
        'lessonId': t.id
      else
        'sessionId': t.id,
      if (t.origin == TrainingOrigin.center) 'centerId': t.centerId,
      'scores': {
        for (final e in scores.entries)
          if (e.value.isSet) e.key.wire: e.value.toMap(),
      },
      'comment': comment.trim(),
      'showName': showName,
      'wantsContact': wantsContact,
    };
  }
}

/// Avaliar aulas: lê as do próprio aluno (`classReviews`, rules: só a
/// autora) e grava pela callable `submitClassReview` (confere presença e
/// prazo no servidor).
class ClassReviewRepository {
  ClassReviewRepository({
    required FirebaseFirestore firestore,
    FirebaseFunctions? functions,
  })  : _firestore = firestore,
        _functions = functions ?? nexagoFunctions;

  final FirebaseFirestore _firestore;
  final FirebaseFunctions _functions;

  Stream<List<ClassReview>> watchMine(String uid) => _firestore
      .collection('classReviews')
      .where('uid', isEqualTo: uid)
      .limit(200)
      .snapshots()
      .map((s) => [
            for (final d in s.docs) ClassReview.fromMap(d.id, d.data()),
          ]..sort((a, b) => '${b.date} ${b.startTime}'
              .compareTo('${a.date} ${a.startTime}')));

  /// Devolve se a gestão abriu chamado (nota baixa + pedir retorno).
  Future<bool> submit(ClassReviewDraft draft) async {
    try {
      final res = await _functions
          .httpsCallable('submitClassReview')
          .call<Object?>(draft.toCallable());
      final data = res.data;
      return data is Map && data['ticketOpened'] == true;
    } on FirebaseFunctionsException catch (e) {
      throw ClassPresenceException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível enviar sua avaliação. Tente novamente.',
        ),
        code: e.code,
      );
    }
  }
}

final classReviewRepositoryProvider = Provider<ClassReviewRepository>(
  (ref) => ClassReviewRepository(firestore: ref.watch(firestoreProvider)),
);
