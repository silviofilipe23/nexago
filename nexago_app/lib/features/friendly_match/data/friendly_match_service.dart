import 'package:cloud_functions/cloud_functions.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/friendly_match_models.dart';

/// Bora Jogar — ações via Cloud Functions (o client nunca escreve em
/// `friendlyMatches` direto; as rules bloqueiam).
class FriendlyMatchService {
  FriendlyMatchService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<T> _call<T>(String name, Map<String, dynamic> payload) async {
    try {
      final result = await _functions.httpsCallable(name).call<Object?>(payload);
      return result.data as T;
    } on FirebaseFunctionsException catch (e) {
      // As callables lançam HttpsError com mensagem pt-BR pronta para UI.
      throw FriendlyMatchActionException(
          e.message ?? 'Não foi possível concluir a ação. Tente novamente.');
    }
  }

  Future<String> sendInvite({
    required String toUid,
    required String sport,
    required FriendlyMatchObjective objective,
    required DateTime scheduledAt,
    List<DateTime> alternativeTimes = const [],
    required FriendlyMatchLocation location,
    String? message,
  }) async {
    final data = await _call<Map<Object?, Object?>>('sendFriendlyMatchInvite', {
      'toUid': toUid,
      'sport': sport,
      'objective': objective.firestoreValue,
      'scheduledAtMs': scheduledAt.toUtc().millisecondsSinceEpoch,
      if (alternativeTimes.isNotEmpty)
        'alternativeTimesMs': alternativeTimes
            .map((t) => t.toUtc().millisecondsSinceEpoch)
            .toList(),
      'location': location.toMap(),
      if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
    });
    return data['matchId'] as String;
  }

  Future<void> acceptInvite(String matchId, {DateTime? chosenTime}) =>
      _call<Object?>('acceptFriendlyMatchInvite', {
        'matchId': matchId,
        if (chosenTime != null)
          'chosenTimeMs': chosenTime.toUtc().millisecondsSinceEpoch,
      });

  Future<void> declineInvite(String matchId, {String? reason}) =>
      _call<Object?>('declineFriendlyMatchInvite', {
        'matchId': matchId,
        if (reason != null && reason.trim().isNotEmpty) 'reason': reason.trim(),
      });

  Future<void> counterInvite({
    required String matchId,
    required DateTime scheduledAt,
    List<DateTime> alternativeTimes = const [],
    FriendlyMatchLocation? location,
    String? message,
  }) =>
      _call<Object?>('counterFriendlyMatchInvite', {
        'matchId': matchId,
        'scheduledAtMs': scheduledAt.toUtc().millisecondsSinceEpoch,
        if (alternativeTimes.isNotEmpty)
          'alternativeTimesMs': alternativeTimes
              .map((t) => t.toUtc().millisecondsSinceEpoch)
              .toList(),
        if (location != null) 'location': location.toMap(),
        if (message != null && message.trim().isNotEmpty) 'message': message.trim(),
      });

  Future<void> cancelMatch(String matchId) =>
      _call<Object?>('cancelFriendlyMatch', {'matchId': matchId});

  Future<bool> checkIn(String matchId) async {
    final data = await _call<Map<Object?, Object?>>(
        'checkInFriendlyMatch', {'matchId': matchId});
    return data['completed'] == true;
  }

  Future<void> submitReview({
    required String matchId,
    required int stars,
    List<String> tags = const [],
    String? comment,
  }) =>
      _call<Object?>('submitFriendlyMatchReview', {
        'matchId': matchId,
        'stars': stars,
        if (tags.isNotEmpty) 'tags': tags,
        if (comment != null && comment.trim().isNotEmpty) 'comment': comment.trim(),
      });
}

class FriendlyMatchActionException implements Exception {
  const FriendlyMatchActionException(this.message);

  final String message;

  @override
  String toString() => message;
}

final friendlyMatchServiceProvider = Provider<FriendlyMatchService>((ref) {
  return FriendlyMatchService();
});
