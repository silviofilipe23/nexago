import 'dart:async';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../domain/tournament_uniform_selection.dart';
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

/// Pedido de cancelamento ao organizador (inscrição JÁ PAGA). Aprovado, o doc
/// da inscrição é deletado — por isso só existem estes dois estados aqui.
enum RegistrationCancellationStatus { pending, declined }

class RegistrationCancellationRequest {
  const RegistrationCancellationRequest({
    required this.status,
    required this.reason,
    required this.responseNote,
  });

  final RegistrationCancellationStatus status;
  final String reason;
  final String responseNote;

  bool get isPending => status == RegistrationCancellationStatus.pending;
  bool get isDeclined => status == RegistrationCancellationStatus.declined;

  /// Doc antigo (sem o campo), lixo ou status desconhecido → sem pedido.
  static RegistrationCancellationRequest? fromDoc(Object? raw) {
    if (raw is! Map) return null;
    final status = switch (raw['status']) {
      'pending' => RegistrationCancellationStatus.pending,
      'declined' => RegistrationCancellationStatus.declined,
      _ => null,
    };
    if (status == null) return null;
    String str(Object? v) => v is String ? v : '';
    return RegistrationCancellationRequest(
      status: status,
      reason: str(raw['reason']),
      responseNote: str(raw['responseNote']),
    );
  }
}

/// Estado da inscrição no Firestore (pagamento acumulado).
class TournamentRegistrationSnapshot {
  const TournamentRegistrationSnapshot({
    required this.registrationId,
    required this.isPaid,
    required this.paidAmount,
    this.sharePaidUids = const [],
    this.partnerPending = false,
    this.cancellationRequest,
    this.teamSize,
    this.teamName,
    this.captainUid,
    this.player1Id,
    this.participantUids = const [],
    this.uniformPlayer1,
    this.uniformPlayer2,
    this.uniformByUid = const {},
    this.declaredPaidAt,
    this.paymentVerifiedByOrganizer = false,
  });

  final String registrationId;
  final bool isPaid;
  final double paidAmount;
  final List<String> sharePaidUids;

  /// Inscrição solo com vaga de parceiro em aberto.
  final bool partnerPending;

  /// Pedido de cancelamento aberto/recusado, quando houver.
  final RegistrationCancellationRequest? cancellationRequest;

  /// Elenco de categoria de EQUIPE (trio+); `null` em solo/dupla.
  final int? teamSize;

  /// Nome dado pelo capitão à equipe; `null` em solo/dupla.
  final String? teamName;

  /// Capitão da equipe. Doc antigo pode não trazer — aí quem criou é o
  /// primeiro participante (ver `buildTeamRoster`).
  final String? captainUid;
  final String? player1Id;
  final List<String> participantUids;
  final TournamentUniformSelection? uniformPlayer1;
  final TournamentUniformSelection? uniformPlayer2;
  final Map<String, TournamentUniformSelection> uniformByUid;

  /// Quando a declaração "já paguei" entrou (pagamento direto com o
  /// organizador). Ausente em inscrição anterior a esse fluxo — e é isso que
  /// distingue "ninguém vai conferir" de "aguardando conferência".
  final DateTime? declaredPaidAt;

  /// O organizador bateu o extrato e confirmou o recebimento.
  final bool paymentVerifiedByOrganizer;

  /// Uniforme JÁ gravado para este atleta. A tela de inscrição abre a partir
  /// dele — sem isso o cartão mostrava os padrões mesmo para quem tinha
  /// escolhido outro tamanho por outra superfície.
  TournamentUniformSelection uniformFor(String uid) {
    return uniformSlotFor(
      uid: uid,
      teamSize: teamSize,
      uniformByUid: uniformByUid,
      player1Id: player1Id,
      participantUids: participantUids,
      uniformPlayer1: uniformPlayer1,
      uniformPlayer2: uniformPlayer2,
    );
  }

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
    final rawParticipants = data['participantUids'];
    final participants = rawParticipants is List
        ? rawParticipants
            .whereType<String>()
            .map((id) => id.trim())
            .where((id) => id.isNotEmpty)
            .toList()
        : <String>[];
    final teamSizeRaw = data['teamSize'];
    final player1 = (data['player1Id'] as String?)?.trim();
    return TournamentRegistrationSnapshot(
      registrationId: registrationId,
      isPaid: data['isPaid'] == true,
      paidAmount: (data['paidAmount'] as num?)?.toDouble() ?? 0,
      sharePaidUids: uids,
      partnerPending: data['partnerPending'] == true,
      cancellationRequest: RegistrationCancellationRequest.fromDoc(
        data['cancellationRequest'],
      ),
      teamSize: teamSizeRaw is num ? teamSizeRaw.toInt() : null,
      teamName: _trimmedOrNull(data['teamName']),
      captainUid: _trimmedOrNull(data['captainUid']),
      player1Id: (player1 != null && player1.isNotEmpty) ? player1 : null,
      participantUids: participants,
      uniformPlayer1: uniformSelectionFromRegistrationDoc(data, 1),
      uniformPlayer2: uniformSelectionFromRegistrationDoc(data, 2),
      uniformByUid: uniformByUidFromDoc(data['uniformByUid']),
      declaredPaidAt: (data['declaredPaidAt'] as Timestamp?)?.toDate(),
      paymentVerifiedByOrganizer: data['paymentVerifiedByOrganizer'] == true,
    );
  }

  static String? _trimmedOrNull(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    return value.isEmpty ? null : value;
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
  }) : _firestore = firestore ?? FirebaseFirestore.instance;

  final FirebaseFirestore _firestore;

  CollectionReference<Map<String, dynamic>> get _teams =>
      _firestore.collection(NexagoArtifactsPaths.teamsCollection());

  CollectionReference<Map<String, dynamic>> get _inscriptions =>
      _firestore.collection(NexagoArtifactsPaths.inscriptionsCollection());

  Future<TournamentRegistrationResult> createRegistration({
    required String tournamentId,
    required String categoryId,
    String? partnerUserId,
  }) async {
    throw TournamentRegistrationException(
      'Inscrições devem ser feitas pelo fluxo de convite de parceiro.',
    );
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
