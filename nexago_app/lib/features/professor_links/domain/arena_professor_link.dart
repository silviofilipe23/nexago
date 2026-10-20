import 'package:cloud_firestore/cloud_firestore.dart';

/// Vínculo professor ↔ arena (`arenaProfessors/{arenaId}_{professorUserId}`).
///
/// Um documento por par: nova tentativa depois de um estado fechado reabre o
/// MESMO doc (`cycle` + 1). Escrita só pelas Cloud Functions
/// (`functions/src/arena-professor-links.ts`); o app só lê e chama callables.

/// Tipo do vínculo — vale só para esta arena, nunca para o usuário.
enum ArenaProfessorLinkType {
  arenaStaff('ARENA_STAFF'),
  independent('INDEPENDENT');

  const ArenaProfessorLinkType(this.wire);

  final String wire;

  static ArenaProfessorLinkType parse(Object? raw) =>
      raw == 'ARENA_STAFF' ? arenaStaff : independent;
}

enum ArenaProfessorLinkStatus {
  invited('INVITED'),
  pending('PENDING'),
  active('ACTIVE'),
  rejected('REJECTED'),
  suspended('SUSPENDED'),
  ended('ENDED'),
  canceled('CANCELED'),
  expired('EXPIRED');

  const ArenaProfessorLinkStatus(this.wire);

  final String wire;

  /// `null` para valor desconhecido (o chamador decide o fallback).
  static ArenaProfessorLinkStatus? tryParse(Object? raw) {
    for (final status in values) {
      if (status.wire == raw) return status;
    }
    return null;
  }

  /// Estados que bloqueiam um novo convite/pedido para o mesmo par.
  bool get isOpen =>
      this == invited || this == pending || this == active || this == suspended;
}

/// Quem abriu a rodada atual (e o lado de quem encerrou).
enum ArenaProfessorSide {
  arena('ARENA'),
  professor('PROFESSOR');

  const ArenaProfessorSide(this.wire);

  final String wire;

  static ArenaProfessorSide? tryParse(Object? raw) => switch (raw) {
        'ARENA' => arena,
        'PROFESSOR' => professor,
        _ => null,
      };
}

/// Permissões CONFIGURADAS pela arena. O que vale de fato está em
/// `effectiveProfessorPermissions` (só com `ACTIVE`).
class ArenaProfessorPermissions {
  const ArenaProfessorPermissions({
    required this.canManageOwnLessons,
    required this.canBookCourts,
    required this.canAppearInArenaProfile,
  });

  static const none = ArenaProfessorPermissions(
    canManageOwnLessons: false,
    canBookCourts: false,
    canAppearInArenaProfile: false,
  );

  factory ArenaProfessorPermissions.fromMap(Object? raw) {
    if (raw is! Map) return none;
    return ArenaProfessorPermissions(
      canManageOwnLessons: raw['canManageOwnLessons'] == true,
      canBookCourts: raw['canBookCourts'] == true,
      canAppearInArenaProfile: raw['canAppearInArenaProfile'] == true,
    );
  }

  final bool canManageOwnLessons;
  final bool canBookCourts;
  final bool canAppearInArenaProfile;

  bool valueOf(ArenaProfessorPermissionKey key) => switch (key) {
        ArenaProfessorPermissionKey.canManageOwnLessons => canManageOwnLessons,
        ArenaProfessorPermissionKey.canBookCourts => canBookCourts,
        ArenaProfessorPermissionKey.canAppearInArenaProfile =>
          canAppearInArenaProfile,
      };

  @override
  bool operator ==(Object other) =>
      other is ArenaProfessorPermissions &&
      other.canManageOwnLessons == canManageOwnLessons &&
      other.canBookCourts == canBookCourts &&
      other.canAppearInArenaProfile == canAppearInArenaProfile;

  @override
  int get hashCode =>
      Object.hash(canManageOwnLessons, canBookCourts, canAppearInArenaProfile);
}

enum ArenaProfessorPermissionKey {
  canManageOwnLessons('canManageOwnLessons'),
  canBookCourts('canBookCourts'),
  canAppearInArenaProfile('canAppearInArenaProfile');

  const ArenaProfessorPermissionKey(this.wire);

  final String wire;

  static ArenaProfessorPermissionKey? tryParse(Object? raw) {
    for (final key in values) {
      if (key.wire == raw) return key;
    }
    return null;
  }
}

class ArenaProfessorLink {
  const ArenaProfessorLink({
    required this.id,
    required this.arenaId,
    required this.professorUserId,
    required this.type,
    required this.status,
    required this.permissions,
    this.initiatedBy,
    this.cycle = 1,
    this.message,
    this.professorName = '',
    this.professorPhotoUrl,
    this.professorModalities = const [],
    this.arenaName = 'Arena',
    this.arenaLogoUrl,
    this.arenaCity,
    this.createdAt,
    this.updatedAt,
    this.invitedAt,
    this.requestedAt,
    this.expiresAt,
    this.respondedAt,
    this.approvedAt,
    this.suspendedAt,
    this.endedAt,
    this.canceledAt,
    this.invitedByName,
    this.approvedByName,
    this.rejectionReason,
    this.suspensionReason,
    this.suspensionDetails,
    this.endedReason,
    this.endedBySide,
  });

  factory ArenaProfessorLink.fromMap(String id, Map<String, dynamic> data) {
    return ArenaProfessorLink(
      id: id,
      arenaId: _string(data['arenaId']) ?? '',
      professorUserId: _string(data['professorUserId']) ?? '',
      type: ArenaProfessorLinkType.parse(data['relationshipType']),
      // Valor desconhecido conta como fechado: nada a fazer além de pedir de novo.
      status: ArenaProfessorLinkStatus.tryParse(data['status']) ??
          ArenaProfessorLinkStatus.ended,
      permissions: ArenaProfessorPermissions.fromMap(data['permissions']),
      initiatedBy: ArenaProfessorSide.tryParse(data['initiatedBy']),
      cycle: data['cycle'] is num ? (data['cycle'] as num).toInt() : 1,
      message: _string(data['message']),
      professorName: _string(data['professorName']) ?? '',
      professorPhotoUrl: _string(data['professorPhotoUrl']),
      professorModalities: _stringList(data['professorModalities']),
      arenaName: _string(data['arenaName']) ?? 'Arena',
      arenaLogoUrl: _string(data['arenaLogoUrl']),
      arenaCity: _string(data['arenaCity']),
      createdAt: professorLinkDate(data['createdAt']),
      updatedAt: professorLinkDate(data['updatedAt']),
      invitedAt: professorLinkDate(data['invitedAt']),
      requestedAt: professorLinkDate(data['requestedAt']),
      expiresAt: professorLinkDate(data['expiresAt']),
      respondedAt: professorLinkDate(data['respondedAt']),
      approvedAt: professorLinkDate(data['approvedAt']),
      suspendedAt: professorLinkDate(data['suspendedAt']),
      endedAt: professorLinkDate(data['endedAt']),
      canceledAt: professorLinkDate(data['canceledAt']),
      invitedByName: _string(data['invitedByName']),
      approvedByName: _string(data['approvedByName']),
      rejectionReason: _string(data['rejectionReason']),
      suspensionReason: _string(data['suspensionReason']),
      suspensionDetails: _string(data['suspensionDetails']),
      endedReason: _string(data['endedReason']),
      endedBySide: ArenaProfessorSide.tryParse(data['endedBySide']),
    );
  }

  final String id;
  final String arenaId;
  final String professorUserId;
  final ArenaProfessorLinkType type;

  /// Status GRAVADO. Convite vencido continua `invited` até alguém tocar no
  /// vínculo — a tela usa `effectiveProfessorLinkStatus`.
  final ArenaProfessorLinkStatus status;
  final ArenaProfessorPermissions permissions;
  final ArenaProfessorSide? initiatedBy;
  final int cycle;

  /// Mensagem do convite/pedido da rodada atual.
  final String? message;
  final String professorName;
  final String? professorPhotoUrl;
  final List<String> professorModalities;
  final String arenaName;
  final String? arenaLogoUrl;

  /// "Goiânia · GO".
  final String? arenaCity;
  final DateTime? createdAt;
  final DateTime? updatedAt;
  final DateTime? invitedAt;
  final DateTime? requestedAt;
  final DateTime? expiresAt;
  final DateTime? respondedAt;
  final DateTime? approvedAt;
  final DateTime? suspendedAt;
  final DateTime? endedAt;
  final DateTime? canceledAt;
  final String? invitedByName;
  final String? approvedByName;
  final String? rejectionReason;
  final String? suspensionReason;
  final String? suspensionDetails;
  final String? endedReason;
  final ArenaProfessorSide? endedBySide;
}

/// Linha imutável do histórico (`arenaProfessors/{id}/events/{eventId}`).
class ArenaProfessorLinkEvent {
  const ArenaProfessorLinkEvent({
    required this.id,
    required this.eventType,
    this.actorUserId = '',
    this.actorName = '',
    this.actorRole = '',
    this.cycle = 1,
    this.fromStatus,
    this.toStatus,
    this.reason,
    this.metadata = const {},
    this.createdAt,
  });

  factory ArenaProfessorLinkEvent.fromMap(
      String id, Map<String, dynamic> data) {
    final rawMetadata = data['metadata'];
    return ArenaProfessorLinkEvent(
      id: id,
      eventType: _string(data['eventType']) ?? '',
      actorUserId: _string(data['actorUserId']) ?? '',
      actorName: _string(data['actorName']) ?? '',
      actorRole: _string(data['actorRole']) ?? '',
      cycle: data['cycle'] is num ? (data['cycle'] as num).toInt() : 1,
      fromStatus: ArenaProfessorLinkStatus.tryParse(data['fromStatus']),
      toStatus: ArenaProfessorLinkStatus.tryParse(data['toStatus']),
      reason: _string(data['reason']),
      metadata: rawMetadata is Map
          ? rawMetadata.map((k, v) => MapEntry(k.toString(), v))
          : const {},
      createdAt: professorLinkDate(data['createdAt']),
    );
  }

  final String id;

  /// `INVITED`, `REQUESTED`, `ACCEPTED`, `REJECTED`, `APPROVED`, `SUSPENDED`,
  /// `REACTIVATED`, `ENDED`, `PERMISSIONS_CHANGED`, `CANCELED`, `EXPIRED`.
  final String eventType;
  final String actorUserId;
  final String actorName;

  /// `ARENA` | `PROFESSOR` | `ADMIN` | `SYSTEM`.
  final String actorRole;
  final int cycle;
  final ArenaProfessorLinkStatus? fromStatus;
  final ArenaProfessorLinkStatus? toStatus;
  final String? reason;
  final Map<String, Object?> metadata;
  final DateTime? createdAt;
}

/// Espelho público `arenas/{arenaId}/publicProfessors/{uid}` — só vínculo
/// `ACTIVE` com "Aparecer no perfil da arena". Leitura pública.
class PublicArenaProfessor {
  const PublicArenaProfessor({
    required this.professorUserId,
    required this.name,
    required this.type,
    this.photoUrl,
    this.modalities = const [],
    this.since,
  });

  factory PublicArenaProfessor.fromMap(String id, Map<String, dynamic> data) {
    return PublicArenaProfessor(
      professorUserId: _string(data['professorUserId']) ?? id,
      name: _string(data['name']) ?? 'Professor',
      type: ArenaProfessorLinkType.parse(data['relationshipType']),
      photoUrl: _string(data['photoUrl']),
      modalities: _stringList(data['modalities']),
      since: professorLinkDate(data['since']),
    );
  }

  final String professorUserId;
  final String name;
  final ArenaProfessorLinkType type;
  final String? photoUrl;
  final List<String> modalities;
  final DateTime? since;
}

/// Instante gravado (Timestamp do Firestore, `DateTime` ou millis) → horário
/// local do aparelho.
DateTime? professorLinkDate(Object? raw) {
  if (raw is Timestamp) return raw.toDate();
  if (raw is DateTime) return raw.toLocal();
  if (raw is int) return DateTime.fromMillisecondsSinceEpoch(raw);
  return null;
}

String? _string(Object? raw) {
  if (raw is! String) return null;
  final text = raw.trim();
  return text.isEmpty ? null : text;
}

List<String> _stringList(Object? raw) {
  if (raw is! List) return const [];
  return [
    for (final item in raw)
      if (item is String && item.trim().isNotEmpty) item.trim(),
  ];
}
