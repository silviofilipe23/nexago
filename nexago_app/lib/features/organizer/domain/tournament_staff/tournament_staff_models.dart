import 'package:cloud_firestore/cloud_firestore.dart';

/// Papéis de staff em `tournaments/{id}/staff/{uid}` — alinhado a
/// `functions/src/tournament-acl.ts` e às rules.
enum TournamentStaffRole {
  manager('manager'),
  scorer('scorer');

  const TournamentStaffRole(this.value);

  final String value;

  static TournamentStaffRole fromValue(String? value) {
    return value == TournamentStaffRole.scorer.value
        ? TournamentStaffRole.scorer
        : TournamentStaffRole.manager;
  }

  String get label => this == scorer ? 'Mesário' : 'Gestor';

  String get description => this == scorer
      ? 'Lança placar das partidas'
      : 'Opera inscrições, chaves, agenda e placar';
}

class TournamentStaffMember {
  const TournamentStaffMember({
    required this.uid,
    required this.role,
    required this.status,
    this.displayName = '',
    this.nickname = '',
    this.photoUrl,
    this.addedAt,
  });

  final String uid;
  final TournamentStaffRole role;
  final String status;
  final String displayName;
  final String nickname;
  final String? photoUrl;
  final DateTime? addedAt;

  bool get isActive => status == 'active';

  String get displayLabel {
    if (nickname.trim().isNotEmpty) return nickname.trim();
    if (displayName.trim().isNotEmpty) return displayName.trim();
    return 'Usuário';
  }

  factory TournamentStaffMember.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? const <String, dynamic>{};
    final addedAt = data['addedAt'];
    return TournamentStaffMember(
      uid: doc.id,
      role: TournamentStaffRole.fromValue(data['role'] as String?),
      status: (data['status'] as String?) ?? 'active',
      displayName: (data['displayName'] as String?) ?? '',
      nickname: (data['nickname'] as String?) ?? '',
      photoUrl: data['photoUrl'] as String?,
      addedAt: addedAt is Timestamp ? addedAt.toDate() : null,
    );
  }
}
