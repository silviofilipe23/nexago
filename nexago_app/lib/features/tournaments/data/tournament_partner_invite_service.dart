import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:cloud_functions/cloud_functions.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/tournament_partner_invite.dart';
import '../domain/tournament_uniform_selection.dart';

class TournamentPartnerInviteException implements Exception {
  TournamentPartnerInviteException(this.message);
  final String message;

  /// Conflito de inscrição/dupla — exibir FeedbackPage.alert.
  /// Espelha `registrationConflictMessage` (Cloud Functions): mudou a copy lá,
  /// atualize aqui.
  bool get isRegistrationConflict =>
      message.contains('já possui inscrição') ||
      message.contains('já está inscrito') ||
      message.contains('Já existe uma dupla') ||
      message.contains('já pagaram uma inscrição');

  @override
  String toString() => message;
}

/// Traduz o erro de uma callable para a copy que o atleta vê.
///
/// Quando a falha nasce no TRANSPORTE (callable ausente no projeto → 404,
/// backend fora do ar, timeout), o SDK nativo do Functions preenche `message`
/// com a descrição genérica do próprio código — "NOT FOUND" no iOS,
/// "NOT_FOUND" no Android. Repassar isso é vazar infraestrutura na tela, e o
/// `message ?? fallback` do chamador nunca dispara porque a mensagem VEM
/// preenchida. Aqui a comparação é com o próprio `code` normalizado: mensagem
/// de regra de negócio (sempre em português) jamais colide com ele.
String callableErrorMessage(String code, String? message, String fallback) {
  final text = message?.trim() ?? '';
  if (text.isEmpty) return fallback;
  final separators = RegExp(r'[ _-]');
  final normalizedText = text.toUpperCase().replaceAll(separators, '');
  final normalizedCode = code.toUpperCase().replaceAll(separators, '');
  return normalizedText == normalizedCode ? fallback : text;
}

/// Resultado do envio do convite. Além do id, o backend informa se o CONVIDADO
/// já passa no gate de perfil de torneio — pendência não bloqueia o envio, mas
/// o convidante precisa saber que o parceiro ainda não consegue aceitar.
class TournamentPartnerInviteSendResult {
  const TournamentPartnerInviteSendResult({
    required this.inviteId,
    required this.inviteeProfileReady,
    required this.inviteeMissingSteps,
  });

  final String inviteId;
  final bool inviteeProfileReady;

  /// Rótulos PT do que falta (ex.: "WhatsApp", "cidade"). Vazio quando pronto.
  final List<String> inviteeMissingSteps;

  /// Backend antigo (sem os campos novos) conta como pronto — comportamento
  /// idêntico ao anterior.
  factory TournamentPartnerInviteSendResult.fromMap(
    String inviteId,
    Map<dynamic, dynamic> data,
  ) {
    final rawSteps = data['inviteeMissingSteps'];
    return TournamentPartnerInviteSendResult(
      inviteId: inviteId,
      inviteeProfileReady: data['inviteeProfileReady'] != false,
      inviteeMissingSteps: rawSteps is List
          ? rawSteps.whereType<String>().toList()
          : const [],
    );
  }
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

  /// Convite por link (token de uso único) — coleção separada da dos convites
  /// reais, que exigem `inviteeUid`.
  static const _externalCollection = 'tournamentExternalPartnerInvites';

  Future<TournamentPartnerInviteSendResult> sendInvite({
    required String tournamentId,
    required String categoryId,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
    TournamentUniformSelection? inviterUniform,
    bool lgpdAccepted = false,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw TournamentPartnerInviteException('Faça login para enviar o convite.');
    }

    try {
      final callable = _functions.httpsCallable('sendTournamentPartnerInvite');
      final payload = <String, dynamic>{
        'tournamentId': tournamentId,
        'categoryId': categoryId,
        'inviteeUid': inviteeUid,
        'inviteeName': inviteeName,
        'inviterName': inviterName,
      };
      if (inviterUniform != null) {
        final uniformMap = inviterUniform.toCallableMap();
        if (uniformMap.isNotEmpty) {
          payload['inviterUniform'] = uniformMap;
        }
      }
      if (lgpdAccepted) payload['lgpdAccepted'] = true;
      final raw = await callable.call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      final inviteId = data['inviteId'] as String?;
      if (inviteId == null || inviteId.isEmpty) {
        throw TournamentPartnerInviteException('Convite não foi criado.');
      }
      return TournamentPartnerInviteSendResult.fromMap(inviteId, data);
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível enviar o convite.',
      );
    }
  }

  /// Convite de substituição: [inviteeUid] entraria no lugar de [replacedUid]
  /// na inscrição [registrationId]. Permitido até a publicação das chaves.
  Future<String> sendSubstitutionInvite({
    required String registrationId,
    required String replacedUid,
    required String replacedName,
    required String inviteeUid,
    required String inviteeName,
    required String inviterName,
    String? reason,
    String? reasonNote,
  }) async {
    try {
      final callable =
          _functions.httpsCallable('sendTournamentSubstitutionInvite');
      final payload = <String, dynamic>{
        'registrationId': registrationId,
        'replacedUid': replacedUid,
        'replacedName': replacedName,
        'inviteeUid': inviteeUid,
        'inviteeName': inviteeName,
        'inviterName': inviterName,
      };
      if (reason != null && reason.trim().isNotEmpty) {
        payload['reason'] = reason.trim();
      }
      if (reasonNote != null && reasonNote.trim().isNotEmpty) {
        payload['reasonNote'] = reasonNote.trim();
      }
      final raw = await callable.call(payload);
      final data = raw.data;
      final inviteId = data is Map ? data['inviteId'] as String? : null;
      if (inviteId == null || inviteId.isEmpty) {
        throw TournamentPartnerInviteException('Convite não foi criado.');
      }
      return inviteId;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível enviar o convite de substituição.',
        ),
      );
    }
  }

  /// Marca o convite de substituição como visto pelo convidado (idempotente
  /// do lado do backend — a 2ª chamada não regrava `viewedAt`).
  Future<void> markSubstitutionInviteViewed(String inviteId) async {
    if (inviteId.isEmpty) {
      throw TournamentPartnerInviteException('Convite inválido.');
    }
    try {
      final callable =
          _functions.httpsCallable('markSubstitutionInviteViewed');
      await callable.call({'inviteId': inviteId});
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível registrar a visualização.',
        ),
      );
    }
  }

  /// Reenvia o lembrete do convite de substituição pendente. O backend
  /// rate-limita: chamada antes do cooldown lança `TournamentPartnerInviteException`
  /// com a mensagem "Aguarde para lembrar novamente." (de `resource-exhausted`).
  Future<void> resendSubstitutionInvite(String inviteId) async {
    if (inviteId.isEmpty) {
      throw TournamentPartnerInviteException('Convite inválido.');
    }
    try {
      final callable = _functions.httpsCallable('resendSubstitutionInvite');
      await callable.call({'inviteId': inviteId});
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        callableErrorMessage(
          e.code,
          e.message,
          'Não foi possível reenviar o lembrete.',
        ),
      );
    }
  }

  /// Inscrição solo: garante a vaga sem parceiro confirmado.
  /// Retorna o `registrationId` criado.
  Future<String> registerSolo({
    required String tournamentId,
    required String categoryId,
    TournamentUniformSelection? uniform,
    bool lgpdAccepted = false,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw TournamentPartnerInviteException('Faça login para se inscrever.');
    }
    try {
      final callable = _functions.httpsCallable('registerSoloTournament');
      final payload = <String, dynamic>{
        'tournamentId': tournamentId,
        'categoryId': categoryId,
      };
      if (uniform != null) {
        final uniformMap = uniform.toCallableMap();
        if (uniformMap.isNotEmpty) payload['uniform'] = uniformMap;
      }
      if (lgpdAccepted) payload['lgpdAccepted'] = true;
      final raw = await callable.call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      final registrationId = data['registrationId'] as String?;
      if (registrationId == null || registrationId.isEmpty) {
        throw TournamentPartnerInviteException('Inscrição não foi criada.');
      }
      return registrationId;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível garantir a vaga.',
      );
    }
  }

  /// Categoria de EQUIPE (trio/quarteto/quinteto): o capitão cria a equipe
  /// NOMEADA junto com a inscrição — o elenco fecha por convites
  /// ([sendInvite]/[acceptInvite], o backend ramifica pela categoria).
  /// Retorna `(registrationId, teamId)`.
  Future<({String registrationId, String teamId})> createTeamRegistration({
    required String tournamentId,
    required String categoryId,
    required String teamName,
    TournamentUniformSelection? uniform,
    bool lgpdAccepted = false,
  }) async {
    final uid = _auth.currentUser?.uid;
    if (uid == null || uid.isEmpty) {
      throw TournamentPartnerInviteException('Faça login para se inscrever.');
    }
    try {
      final callable = _functions.httpsCallable(
        'createTournamentTeamRegistration',
      );
      final payload = <String, dynamic>{
        'tournamentId': tournamentId,
        'categoryId': categoryId,
        'teamName': teamName,
      };
      if (uniform != null) {
        final uniformMap = uniform.toCallableMap();
        if (uniformMap.isNotEmpty) payload['uniform'] = uniformMap;
      }
      if (lgpdAccepted) payload['lgpdAccepted'] = true;
      final raw = await callable.call(payload);
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      final registrationId = data['registrationId'] as String?;
      final teamId = data['teamId'] as String?;
      if (registrationId == null || registrationId.isEmpty) {
        throw TournamentPartnerInviteException('Inscrição não foi criada.');
      }
      return (registrationId: registrationId, teamId: teamId ?? '');
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível criar a equipe.',
      );
    }
  }

  /// Integrante (não capitão) sai da equipe enquanto a própria cota não foi
  /// paga. A vaga reabre e o capitão é avisado.
  Future<void> leaveTeamRegistration(String registrationId) async {
    if (registrationId.isEmpty) {
      throw TournamentPartnerInviteException('Inscrição inválida.');
    }
    try {
      final callable = _functions.httpsCallable(
        'leaveTournamentTeamRegistration',
      );
      await callable.call({'registrationId': registrationId});
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível sair da equipe.',
      );
    }
  }

  /// Observa o convite por link (só leitura por id — as rules não permitem
  /// varrer a coleção, e o id do doc é o próprio token).
  Stream<ExternalPartnerInvite?> watchExternalInvite(String externalInviteId) {
    if (externalInviteId.isEmpty) return Stream.value(null);
    return _firestore
        .collection(_externalCollection)
        .doc(externalInviteId)
        .snapshots()
        .map((snap) {
      if (!snap.exists) return null;
      return ExternalPartnerInvite.fromFirestore(snap);
    });
  }

  /// Cria o token do convite por link, para parceiro que ainda não tem conta.
  ///
  /// O convite de verdade não pode existir antes do cadastro (o backend exige
  /// `inviteeUid`); este token é o que sobrevive até lá.
  Future<String> createExternalInvite({
    required String tournamentId,
    required String categoryId,
    String? inviteeName,
  }) async {
    try {
      final callable = _functions.httpsCallable('createExternalPartnerInvite');
      final result = await callable.call<Map<String, dynamic>>(
        <String, dynamic>{
          'tournamentId': tournamentId,
          'categoryId': categoryId,
          if (inviteeName != null && inviteeName.trim().isNotEmpty)
            'inviteeName': inviteeName.trim(),
        },
      );
      final id = (result.data['externalInviteId'] as String?)?.trim() ?? '';
      if (id.isEmpty) {
        throw TournamentPartnerInviteException(
          'Não foi possível gerar o link do convite.',
        );
      }
      return id;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível gerar o link do convite.',
      );
    }
  }

  /// Resgata o token e devolve o convite de verdade, já criado em nome de quem
  /// compartilhou o link. Idempotente do lado do backend.
  Future<ExternalInviteClaim> claimExternalInvite(
    String externalInviteId,
  ) async {
    try {
      final callable = _functions.httpsCallable('claimExternalPartnerInvite');
      final result = await callable.call<Map<String, dynamic>>(
        <String, dynamic>{'externalInviteId': externalInviteId},
      );
      return ExternalInviteClaim(
        inviteId: (result.data['inviteId'] as String?)?.trim() ?? '',
        tournamentId: (result.data['tournamentId'] as String?)?.trim() ?? '',
        categoryId: (result.data['categoryId'] as String?)?.trim() ?? '',
      );
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível abrir o convite.',
      );
    }
  }

  /// Define/atualiza o uniforme do atleta na sua inscrição (pós-inscrição).
  Future<void> setRegistrationUniform({
    required String registrationId,
    required TournamentUniformSelection uniform,
  }) async {
    try {
      final callable = _functions.httpsCallable('setRegistrationUniform');
      await callable.call(<String, dynamic>{
        'registrationId': registrationId,
        'uniform': uniform.toCallableMap(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível salvar o uniforme.',
      );
    }
  }

  Future<TournamentPartnerInviteAcceptResult> acceptInvite(
    String inviteId, {
    TournamentUniformSelection? inviteeUniform,
    bool lgpdAccepted = false,
  }) async {
    if (inviteId.isEmpty) {
      throw TournamentPartnerInviteException('Convite inválido.');
    }

    try {
      final callable = _functions.httpsCallable('acceptTournamentPartnerInvite');
      final payload = <String, dynamic>{'inviteId': inviteId};
      if (inviteeUniform != null) {
        final uniformMap = inviteeUniform.toCallableMap();
        if (uniformMap.isNotEmpty) {
          payload['inviteeUniform'] = uniformMap;
        }
      }
      if (lgpdAccepted) payload['lgpdAccepted'] = true;
      final raw = await callable.call(payload);
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

  /// Cancela a reserva/inscrição do próprio atleta (somente enquanto não paga).
  Future<void> cancelRegistration(String registrationId) async {
    if (registrationId.isEmpty) {
      throw TournamentPartnerInviteException('Inscrição inválida.');
    }

    try {
      final callable = _functions.httpsCallable('cancelTournamentRegistration');
      await callable.call({'registrationId': registrationId});
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível cancelar sua reserva.',
      );
    }
  }

  /// Pede ao organizador o cancelamento de uma inscrição JÁ PAGA. A plataforma
  /// não estorna: aprovado, o organizador libera a vaga e a devolução do valor
  /// é combinada entre os dois fora da plataforma.
  Future<void> requestRegistrationCancellation({
    required String registrationId,
    required String reason,
  }) async {
    if (registrationId.isEmpty) {
      throw TournamentPartnerInviteException('Inscrição inválida.');
    }
    if (reason.trim().isEmpty) {
      throw TournamentPartnerInviteException(
        'Escreva o motivo do cancelamento para o organizador.',
      );
    }

    try {
      final callable = _functions.httpsCallable(
        'requestRegistrationCancellation',
      );
      await callable.call({
        'registrationId': registrationId,
        'reason': reason.trim(),
      });
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível enviar o pedido.',
      );
    }
  }

  /// Contato do organizador (só para atleta inscrito) — é por onde o acerto do
  /// reembolso acontece, fora da plataforma.
  Future<TournamentOrganizerContact> organizerContact(
    String tournamentId,
  ) async {
    if (tournamentId.isEmpty) {
      throw TournamentPartnerInviteException('Torneio inválido.');
    }
    try {
      final callable = _functions.httpsCallable(
        'getTournamentOrganizerContact',
      );
      final raw = await callable.call({'tournamentId': tournamentId});
      final data = raw.data;
      if (data is! Map) {
        throw TournamentPartnerInviteException('Resposta inválida do servidor.');
      }
      return TournamentOrganizerContact.fromMap(data['contact']);
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível obter o contato do organizador.',
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

  /// Convites recebidos já aceitos (parceiro convidado).
  Stream<List<TournamentPartnerInvite>> watchAcceptedInvitesAsInvitee(
    String uid,
  ) {
    if (uid.isEmpty) return Stream.value(const []);
    return _firestore
        .collection(_collection)
        .where('inviteeUid', isEqualTo: uid)
        .where('status', isEqualTo: 'accepted')
        .snapshots()
        .map(
          (snap) => snap.docs
              .map(TournamentPartnerInvite.fromFirestore)
              .where((i) => !i.isExpired)
              .toList(),
        );
  }

  /// Convites em andamento para Home/Competir:
  /// - enviados pelo usuário (pending/accepted)
  /// - recebidos pelo usuário já aceitos (accepted)
  Stream<List<TournamentPartnerInvite>> watchOngoingForHome(String uid) {
    if (uid.isEmpty) return Stream.value(const []);
    final inviterStream = watchInvitesAsInviter(uid);
    final inviteeAcceptedStream = watchAcceptedInvitesAsInvitee(uid);

    return Stream.multi((controller) {
      List<TournamentPartnerInvite> inviterItems = const [];
      List<TournamentPartnerInvite> inviteeItems = const [];

      void emitMerged() {
        final byId = <String, TournamentPartnerInvite>{};
        for (final invite in [...inviterItems, ...inviteeItems]) {
          byId[invite.id] = invite;
        }
        final merged = byId.values.toList()
          ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
        controller.add(merged);
      }

      final sub1 = inviterStream.listen(
        (items) {
          inviterItems = items;
          emitMerged();
        },
        onError: controller.addError,
      );
      final sub2 = inviteeAcceptedStream.listen(
        (items) {
          inviteeItems = items;
          emitMerged();
        },
        onError: controller.addError,
      );

      controller.onCancel = () async {
        await sub1.cancel();
        await sub2.cancel();
      };
    });
  }
}

final tournamentPartnerInviteServiceProvider =
    Provider<TournamentPartnerInviteService>((ref) {
  return TournamentPartnerInviteService();
});
