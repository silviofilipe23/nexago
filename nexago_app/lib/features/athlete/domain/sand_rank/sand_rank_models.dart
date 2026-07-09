/// Modelos dos docs Firestore do sistema de elos.
///
/// `users/{uid}/gamification_rewards/{rewardId}` é escrito só por Cloud
/// Function (`sand-rank-sync.ts`); o app lê e apenas marca `seenAt`.
library;

enum SandRankRewardType {
  avatarFrame,
  title,
  emblem,
  perk,
  partnerVoucher;

  static SandRankRewardType fromId(String? raw) {
    return switch (raw?.trim()) {
      'avatarFrame' => SandRankRewardType.avatarFrame,
      'title' => SandRankRewardType.title,
      'perk' => SandRankRewardType.perk,
      'partnerVoucher' => SandRankRewardType.partnerVoucher,
      _ => SandRankRewardType.emblem,
    };
  }

  String get id => name;
}

class UserSandRankReward {
  const UserSandRankReward({
    required this.rewardId,
    required this.type,
    required this.rankCode,
    required this.trackIndex,
    required this.grantedAt,
    this.seenAt,
  });

  final String rewardId;
  final SandRankRewardType type;
  final String rankCode;
  final int trackIndex;
  final DateTime? grantedAt;
  final DateTime? seenAt;

  bool get isUnseen => seenAt == null;

  factory UserSandRankReward.fromMap(Map<String, dynamic> map) {
    DateTime? parseDate(dynamic value) {
      if (value == null) return null;
      if (value is DateTime) return value;
      final toDate = value is Object ? value : null;
      try {
        // Timestamp do Firestore expõe toDate().
        return (toDate as dynamic).toDate() as DateTime;
      } catch (_) {
        return DateTime.tryParse(value.toString());
      }
    }

    return UserSandRankReward(
      rewardId: (map['rewardId'] as String?)?.trim() ?? '',
      type: SandRankRewardType.fromId(map['type'] as String?),
      rankCode: (map['rankCode'] as String?)?.trim() ?? '',
      trackIndex: (map['trackIndex'] as num?)?.toInt() ?? 0,
      grantedAt: parseDate(map['grantedAt']),
      seenAt: parseDate(map['seenAt']),
    );
  }
}

/// Elo espelhado em `users/{uid}.sandRank` e no `public_profiles` — usado
/// para exibir o elo de OUTROS atletas (o próprio deriva do XP local).
class PublicSandRank {
  const PublicSandRank({
    required this.code,
    required this.division,
    required this.trackIndex,
  });

  final String code;
  final int division;
  final int trackIndex;

  static PublicSandRank? fromMap(Map<String, dynamic>? map) {
    if (map == null) return null;
    final code = (map['code'] as String?)?.trim() ?? '';
    if (code.isEmpty) return null;
    return PublicSandRank(
      code: code,
      division: (map['division'] as num?)?.toInt() ?? 0,
      trackIndex: (map['trackIndex'] as num?)?.toInt() ?? 0,
    );
  }
}

/// Cosméticos equipados, espelhados em `users/{uid}.sandRankCosmetics`.
class SandRankCosmetics {
  const SandRankCosmetics({this.frameId, this.titleId});

  final String? frameId;
  final String? titleId;

  static SandRankCosmetics fromMap(Map<String, dynamic>? map) {
    if (map == null) return const SandRankCosmetics();
    String? clean(dynamic v) {
      final s = (v as String?)?.trim();
      return (s == null || s.isEmpty) ? null : s;
    }

    return SandRankCosmetics(
      frameId: clean(map['frameId']),
      titleId: clean(map['titleId']),
    );
  }
}
