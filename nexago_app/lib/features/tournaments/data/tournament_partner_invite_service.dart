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
  bool get isRegistrationConflict =>
      message.contains('já possui inscrição') ||
      message.contains('já está inscrito') ||
      message.contains('Já existe uma dupla');

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
      return inviteId;
    } on FirebaseFunctionsException catch (e) {
      throw TournamentPartnerInviteException(
        e.message ?? 'Não foi possível enviar o convite.',
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
