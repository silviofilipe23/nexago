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
    this.hasCreatedAt = true,
    this.isTeamInvite = false,
    this.teamName,
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

  /// O doc trazia `createdAt`? Sem o campo, [createdAt] é um fallback e não
  /// pode ser lido como "convite recém-criado" — o anúncio automático depende
  /// dessa distinção (ver `tournament_invite_announcer.dart`).
  final bool hasCreatedAt;

  /// Categoria de EQUIPE (trio/quarteto/quinteto) — gravado pelo backend em
  /// `sendTournamentPartnerInvite`. Sem ele toda a copy chamava equipe de
  /// "dupla".
  final bool isTeamInvite;

  /// Nome da equipe nomeada pelo capitão; `null` em dupla.
  final String? teamName;

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
      hasCreatedAt: d['createdAt'] is Timestamp,
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate() ??
          DateTime.now().add(const Duration(hours: 48)),
      isTeamInvite: d['isTeamInvite'] == true,
      teamName: _trimmedOrNull(d['teamName']),
    );
  }

  static String? _trimmedOrNull(Object? raw) {
    final value = raw is String ? raw.trim() : '';
    return value.isEmpty ? null : value;
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

/// Resultado do resgate de um convite por link.
class ExternalInviteClaim {
  const ExternalInviteClaim({
    required this.inviteId,
    required this.tournamentId,
    required this.categoryId,
  });

  final String inviteId;
  final String tournamentId;
  final String categoryId;

  bool get isValid => inviteId.isNotEmpty;
}

/// Convite por link visto por quem o recebeu, antes do resgate — só o
/// suficiente para a tela dizer quem chamou e para qual torneio.
class ExternalPartnerInvite {
  const ExternalPartnerInvite({
    required this.id,
    required this.tournamentId,
    required this.categoryId,
    required this.inviterUid,
    required this.inviterName,
    required this.status,
    required this.expiresAt,
    this.inviteeName,
  });

  final String id;
  final String tournamentId;
  final String categoryId;
  final String inviterUid;
  final String inviterName;
  final String status;
  final DateTime expiresAt;
  final String? inviteeName;

  bool get isPending => status == 'pending' || status == 'claiming';
  bool get isClaimed => status == 'claimed';
  bool get isCancelled => status == 'cancelled';
  bool get isExpired => DateTime.now().isAfter(expiresAt);

  factory ExternalPartnerInvite.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> snap,
  ) {
    final d = snap.data() ?? {};
    return ExternalPartnerInvite(
      id: snap.id,
      tournamentId: d['tournamentId'] as String? ?? '',
      categoryId: d['categoryId'] as String? ?? '',
      inviterUid: d['inviterUid'] as String? ?? '',
      inviterName: (d['inviterName'] as String?)?.trim().isNotEmpty == true
          ? (d['inviterName'] as String).trim()
          : 'Atleta',
      status: d['status'] as String? ?? 'pending',
      expiresAt: (d['expiresAt'] as Timestamp?)?.toDate() ??
          DateTime.now().add(const Duration(days: 7)),
      inviteeName: (d['inviteeName'] as String?)?.trim().isNotEmpty == true
          ? (d['inviteeName'] as String).trim()
          : null,
    );
  }
}
