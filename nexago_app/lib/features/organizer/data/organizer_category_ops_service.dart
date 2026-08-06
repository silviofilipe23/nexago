import 'package:cloud_functions/cloud_functions.dart';

class OrganizerCategoryOpsService {
  OrganizerCategoryOpsService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  Future<void> generateCategoryBracket({
    required String tournamentId,
    required String categoryId,
    required String format,
    List<String>? seeds,
    List<Map<String, dynamic>>? groupsPreview,
    Map<String, dynamic>? bracketConfig,
    bool force = false,
  }) async {
    final callable = _functions.httpsCallable('generateCategoryBracket');
    await callable.call({
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
      'format': format.trim(),
      if (seeds != null) 'seeds': seeds,
      if (groupsPreview != null) 'groupsPreview': groupsPreview,
      if (bracketConfig != null) 'bracketConfig': bracketConfig,
      if (force) 'force': true,
    });
  }

  Future<void> confirmRegistrationPayment({
    required String registrationId,
  }) async {
    final callable =
        _functions.httpsCallable('organizerConfirmRegistrationPayment');
    await callable.call({'registrationId': registrationId.trim()});
  }

  Future<void> moveToWaitlist({required String registrationId}) async {
    final callable = _functions.httpsCallable('organizerMoveToWaitlist');
    await callable.call({'registrationId': registrationId.trim()});
  }

  /// [description] é obrigatória: a inscrição é deletada, então esse texto é a
  /// única explicação que o atleta recebe por perder a vaga.
  Future<void> removeFromCategory({
    required String registrationId,
    required String description,
  }) async {
    final callable = _functions.httpsCallable('organizerRemoveFromCategory');
    await callable.call({
      'registrationId': registrationId.trim(),
      'description': description.trim(),
    });
  }

  /// Responde ao pedido de cancelamento do atleta. Aprovar remove a inscrição e
  /// libera a vaga; a plataforma NÃO estorna — a devolução do valor é combinada
  /// entre organizador e atleta fora dela.
  Future<void> respondCancellationRequest({
    required String registrationId,
    required bool approve,
    String note = '',
  }) async {
    final callable =
        _functions.httpsCallable('respondRegistrationCancellationRequest');
    await callable.call({
      'registrationId': registrationId.trim(),
      'approve': approve,
      'note': note.trim(),
    });
  }

  Future<Map<String, dynamic>> sendCategoryCommunication({
    required String tournamentId,
    required String categoryId,
    required String message,
    required String audience,
    bool sendPush = true,
  }) async {
    final callable = _functions.httpsCallable('sendCategoryCommunication');
    final result = await callable.call({
      'tournamentId': tournamentId.trim(),
      'categoryId': categoryId.trim(),
      'message': message.trim(),
      'audience': audience.trim(),
      'sendPush': sendPush,
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }

  Future<void> resendRegistrationPayment({
    required String registrationId,
  }) async {
    final callable = _functions.httpsCallable('resendRegistrationPayment');
    await callable.call({'registrationId': registrationId.trim()});
  }

  /// Publica um aviso PÚBLICO e PERSISTENTE do torneio inteiro (não uma
  /// categoria) no feed da Comunidade — diferente de
  /// [sendCategoryCommunication], que é mensagem direta só pros times já
  /// inscritos numa categoria e some do feed depois de enviada.
  Future<Map<String, dynamic>> postTournamentAnnouncement({
    required String tournamentId,
    required String message,
  }) async {
    final callable = _functions.httpsCallable('postTournamentAnnouncement');
    final result = await callable.call({
      'tournamentId': tournamentId.trim(),
      'message': message.trim(),
    });
    return Map<String, dynamic>.from(result.data as Map? ?? {});
  }
}
