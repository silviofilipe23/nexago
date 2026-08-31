import 'package:cloud_functions/cloud_functions.dart';

/// Erro de callable já traduzido para o organizador ler. As recusas de
/// pagamento vêm do servidor em português ("Esta inscrição já tem pagamento
/// parcial…"), então a mensagem útil é a do próprio erro — sem isso a tela
/// mostrava `[firebase_functions/failed-precondition] …` cru.
class OrganizerCategoryOpsException implements Exception {
  OrganizerCategoryOpsException(this.message);

  final String message;

  @override
  String toString() => message;
}

/// Mensagem do erro da callable, ou [fallback] quando o servidor não mandou
/// nenhuma. `e.message ?? fallback` não basta: em falha de transporte a
/// plataforma entrega `message` VAZIA (não nula), e o organizador via um
/// snackbar em branco logo depois de mexer em dinheiro — parecia que o toque
/// não fez nada.
String _callableMessage(FirebaseFunctionsException e, String fallback) {
  final message = e.message?.trim() ?? '';
  return message.isEmpty ? fallback : message;
}

class OrganizerCategoryOpsService {
  OrganizerCategoryOpsService({FirebaseFunctions? functions})
      : _functions = functions ?? FirebaseFunctions.instance;

  final FirebaseFunctions _functions;

  /// Callable da folha de ações da dupla, com o erro já traduzido. NÃO use em
  /// `generateCategoryBracket`: a tela de chave inspeciona o
  /// `FirebaseFunctionsException` cru (`details['reason']`, `code`) para abrir
  /// o diálogo de regeração — embrulhar mataria essa confirmação em silêncio.
  Future<void> _callRegistrationOp(
    String name,
    Map<String, dynamic> payload,
    String fallback,
  ) async {
    try {
      await _functions.httpsCallable(name).call(payload);
    } on FirebaseFunctionsException catch (e) {
      throw OrganizerCategoryOpsException(_callableMessage(e, fallback));
    }
  }

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

  /// [athleteUid] confirma a parte de UM atleta da dupla/equipe: a inscrição só
  /// fecha (`isPaid`) quando todos estiverem confirmados. Sem ele, confirma a
  /// inscrição inteira — e a callable RECUSA esse caminho quando já existe
  /// pagamento parcial, para não marcar como pago quem não pagou.
  Future<void> confirmRegistrationPayment({
    required String registrationId,
    String? athleteUid,
  }) async {
    final uid = athleteUid?.trim() ?? '';
    await _callRegistrationOp(
      'organizerConfirmRegistrationPayment',
      {
        'registrationId': registrationId.trim(),
        if (uid.isNotEmpty) 'athleteUid': uid,
      },
      'Não foi possível confirmar o pagamento.',
    );
  }

  /// Desfaz a baixa manual do organizador. Com [athleteUid], desfaz só a parte
  /// daquele atleta (o resto da dupla não é afetado); a callable recusa quando
  /// a confirmação não foi manual ou quando a inscrição já está paga por
  /// inteiro — nesse caso a reversão é da inscrição toda.
  Future<void> revertRegistrationPayment({
    required String registrationId,
    String? athleteUid,
  }) async {
    final uid = athleteUid?.trim() ?? '';
    await _callRegistrationOp(
      'organizerRevertRegistrationPayment',
      {
        'registrationId': registrationId.trim(),
        if (uid.isNotEmpty) 'athleteUid': uid,
      },
      'Não foi possível desfazer a confirmação.',
    );
  }

  Future<void> moveToWaitlist({required String registrationId}) async {
    await _callRegistrationOp(
      'organizerMoveToWaitlist',
      {'registrationId': registrationId.trim()},
      'Não foi possível mover para a fila.',
    );
  }

  /// [description] é obrigatória: a inscrição é deletada, então esse texto é a
  /// única explicação que o atleta recebe por perder a vaga.
  Future<void> removeFromCategory({
    required String registrationId,
    required String description,
  }) async {
    await _callRegistrationOp(
      'organizerRemoveFromCategory',
      {
        'registrationId': registrationId.trim(),
        'description': description.trim(),
      },
      'Não foi possível remover a inscrição.',
    );
  }

  /// Responde ao pedido de cancelamento do atleta. Aprovar remove a inscrição e
  /// libera a vaga; a plataforma NÃO estorna — a devolução do valor é combinada
  /// entre organizador e atleta fora dela.
  Future<void> respondCancellationRequest({
    required String registrationId,
    required bool approve,
    String note = '',
  }) async {
    await _callRegistrationOp(
      'respondRegistrationCancellationRequest',
      {
        'registrationId': registrationId.trim(),
        'approve': approve,
        'note': note.trim(),
      },
      'Não foi possível responder ao pedido de cancelamento.',
    );
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
