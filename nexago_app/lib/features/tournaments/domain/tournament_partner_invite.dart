import 'package:cloud_firestore/cloud_firestore.dart';

/// Contato do organizador do torneio, vindo de `getTournamentOrganizerContact`.
/// Serve ao acerto do reembolso, que acontece FORA da plataforma.
class TournamentOrganizerContact {
  const TournamentOrganizerContact({
    required this.name,
    required this.whatsappPhone,
    required this.email,
  });

  final String name;

  /// Só dígitos, com DDI — pronto para `wa.me`. Vazio quando o organizador não
  /// tem telefone cadastrado.
  final String whatsappPhone;
  final String email;

  bool get hasWhatsApp => whatsappPhone.isNotEmpty;

  factory TournamentOrganizerContact.fromMap(Object? raw) {
    final map = raw is Map ? raw : const {};
    String str(Object? v) => v is String ? v.trim() : '';
    return TournamentOrganizerContact(
      name: str(map['name']).isEmpty ? 'Organizador' : str(map['name']),
      whatsappPhone: str(map['whatsappPhone']),
      email: str(map['email']),
    );
  }
}

class TournamentPartnerInvite {
  const TournamentPartnerInvite({
    required this.id,
    required this.tournamentId,
    required this.categoryId,
    required this.inviterUid,
    required this.inviterName,
    required this.inviteeUid,
    required this.inviteeName,
    required this.status,
    this.teamId,
    this.registrationId,
    this.attachRegistrationId,
    required this.createdAt,
    required this.expiresAt,
  });

  final String id;
  final String tournamentId;
  final String categoryId;
  final String inviterUid;
  final String inviterName;
  final String inviteeUid;
  final String inviteeName;
  final String status;
  final String? teamId;
  final String? registrationId;
  final String? attachRegistrationId;
  final DateTime createdAt;
  final DateTime expiresAt;

  bool get isPending => status == 'pending';
  bool get isAccepted => status == 'accepted';
  bool get isDeclined => status == 'declined';
  bool get isCancelled => status == 'cancelled';
  bool get isExpired =>
      status == 'expired' || DateTime.now().isAfter(expiresAt);

  factory TournamentPartnerInvite.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snap,
  ) {
    final d = snap.data() ?? {};
    return TournamentPartnerInvite(
      id: snap.id,
      tournamentId: d['tournamentId'] as String? ?? '',
      categoryId: d['categoryId'] as String? ?? '',
      inviterUid: d['inviterUid'] as String? ?? '',
      inviterName: d['inviterName'] as String? ?? '',
      inviteeUid: d['inviteeUid'] as String? ?? '',
      inviteeName: d['inviteeName'] as String? ?? '',
      status: d['status'] as String? ?? 'pending',
      teamId: d['teamId'] as String?,
      registrationId: d['registrationId'] as String?,
      attachRegistrationId: d['attachRegistrationId'] as String?,
      createdAt: (d['createdAt'] as Timestamp?)?.toDate() ?? DateTime.now(),
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate() ??
          DateTime.now().add(const Duration(hours: 48)),
    );
  }
}

class TournamentPartnerInviteAcceptResult {
  const TournamentPartnerInviteAcceptResult({
    required this.registrationId,
    required this.teamId,
    required this.tournamentId,
    required this.categoryId,
  });

  final String registrationId;
  final String teamId;
  final String tournamentId;
  final String categoryId;

  factory TournamentPartnerInviteAcceptResult.fromMap(Map<Object?, Object?> map) {
    return TournamentPartnerInviteAcceptResult(
      registrationId: map['registrationId'] as String? ?? '',
      teamId: map['teamId'] as String? ?? '',
      tournamentId: map['tournamentId'] as String? ?? '',
      categoryId: map['categoryId'] as String? ?? '',
    );
  }
}
