import 'package:cloud_firestore/cloud_firestore.dart';

import '../auth/user_roles.dart';

/// Perfil em `users/{uid}` (paridade com web `AppUserProfile`).
class AppUserProfile {
  const AppUserProfile({
    required this.uid,
    this.email,
    this.fullName,
    this.nickname,
    this.phoneNumber,
    this.gender,
    this.birthDate,
    this.profilePhotoUrl,
    this.partnerInviteStatus,
    this.invitedByUid,
    this.invitedAt,
    this.city,
    this.state,
    this.roles = const [],
    this.primarySportFirestoreId,
    this.levelsBySportFirestore = const {},
    this.level,
    this.sandRankTrackIndex,
  });

  final String uid;
  final String? email;
  final String? fullName;
  final String? nickname;
  final String? phoneNumber;
  final String? gender;
  final String? birthDate;
  final String? profilePhotoUrl;
  final String? partnerInviteStatus;
  final String? invitedByUid;
  final DateTime? invitedAt;
  final String? city;
  final String? state;
  final List<String> roles;
  final String? primarySportFirestoreId;
  /// Nível por esporte em `sportOnboarding.levelsBySport` (código Firestore
  /// do esporte → código do nível, ex.: `intermediario_1`).
  final Map<String, String> levelsBySportFirestore;

  /// Nível global legado (`level`, label) — fallback de leitura para docs
  /// anteriores ao mapa por esporte.
  final String? level;

  /// Degrau do elo de gamificação (`sandRank.trackIndex`, escrito por CF).
  final int? sandRankTrackIndex;

  factory AppUserProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    return AppUserProfile.fromMap(doc.id, doc.data() ?? {});
  }

  factory AppUserProfile.fromMap(String uid, Map<String, dynamic> data) {
    final onboarding = data['sportOnboarding'];
    String? primarySportFirestoreId;
    final levelsBySportFirestore = <String, String>{};
    if (onboarding is Map) {
      primarySportFirestoreId = _str(onboarding['primarySportId']);
      final levelsRaw = onboarding['levelsBySport'];
      if (levelsRaw is Map) {
        for (final entry in levelsRaw.entries) {
          final value = entry.value;
          if (value is String && value.trim().isNotEmpty) {
            levelsBySportFirestore[entry.key.toString()] = value.trim();
          }
        }
      }
    }
    return AppUserProfile(
      uid: uid,
      email: _str(data['email']),
      fullName: _str(data['fullName']) ?? _str(data['name']),
      nickname: _str(data['nickname']),
      phoneNumber: _str(data['phoneNumber']),
      gender: _str(data['gender']),
      birthDate: _str(data['birthDate']),
      profilePhotoUrl: _str(data['profilePhotoUrl']) ?? _str(data['avatarUrl']),
      partnerInviteStatus: _str(data['partnerInviteStatus']),
      invitedByUid: _str(data['invitedByUid']),
      invitedAt: _timestamp(data['invitedAt']),
      city: _str(data['city']),
      state: _str(data['state']),
      roles: _stringList(data['roles']),
      primarySportFirestoreId: primarySportFirestoreId,
      levelsBySportFirestore: levelsBySportFirestore,
      level: _str(data['level']) ?? _str(data['nivel']),
      sandRankTrackIndex: data['sandRank'] is Map
          ? ((data['sandRank'] as Map)['trackIndex'] as num?)?.toInt()
          : null,
    );
  }

  static List<String> _stringList(dynamic v) {
    if (v is! List) return const [];
    return v
        .whereType<String>()
        .map((item) => item.trim())
        .where((item) => item.isNotEmpty)
        .toList();
  }

  static String? _str(dynamic v) {
    if (v is! String) return null;
    final t = v.trim();
    return t.isEmpty ? null : t;
  }

  static DateTime? _timestamp(dynamic v) {
    if (v is Timestamp) return v.toDate();
    return null;
  }
}

/// Usuário elegível como parceiro de torneio (papel atleta no perfil Firestore).
bool appUserHasAthleteRole(AppUserProfile user) {
  return userDocHasAthleteRole(roles: user.roles);
}

/// Evita exibir IDs técnicos (Firestore/Auth) como nome de atleta.
bool looksLikeFirestoreUid(String value) {
  final trimmed = value.trim();
  if (trimmed.length < 20 || trimmed.length > 128) return false;
  return RegExp(r'^[A-Za-z0-9]+$').hasMatch(trimmed);
}

String? readableNameCandidate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  if (looksLikeFirestoreUid(trimmed)) return null;
  return trimmed;
}

String? readableNicknameCandidate(String? value) {
  final trimmed = value?.trim();
  if (trimmed == null || trimmed.isEmpty) return null;
  final clean = trimmed.startsWith('@') ? trimmed.substring(1).trim() : trimmed;
  if (clean.isEmpty || looksLikeFirestoreUid(clean)) return null;
  return clean;
}

String resolveAppUserDisplayName(
  AppUserProfile? profile, {
  String? override,
  String fallback = '',
}) {
  for (final candidate in [
    readableNameCandidate(override),
    if (profile != null) readableNicknameCandidate(profile.nickname),
    if (profile != null) readableNameCandidate(profile.fullName),
    if (profile != null) readableNameCandidate(profile.email),
  ]) {
    if (candidate != null) return candidate;
  }
  return fallback;
}

String? safeMatchTeamDescription(String? description) {
  final raw = description?.trim();
  if (raw == null || raw.isEmpty) return null;

  final segments = raw
      .split('/')
      .map((segment) => segment.trim())
      .where((segment) => segment.isNotEmpty)
      .toList();
  if (segments.isEmpty) return null;
  if (segments.every(looksLikeFirestoreUid)) return null;
  if (segments.length == 1 && looksLikeFirestoreUid(segments.first)) return null;

  return raw;
}

String appUserDisplayName(AppUserProfile user) {
  return resolveAppUserDisplayName(user);
}

/// Nome curto p/ rótulos de dupla (ex.: "Ana C."), reduzindo colisão quando
/// dois usuários compartilham o primeiro nome.
String appUserShortLabel(AppUserProfile user) {
  final display = appUserDisplayName(user).trim();
  if (display.isEmpty) return '';
  final parts =
      display.split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.length <= 1) return display;
  final lastInitial = parts.last[0].toUpperCase();
  return '${parts.first} $lastInitial.';
}

String? appUserSecondaryLine(AppUserProfile user) {
  final primary = appUserDisplayName(user);
  final parts = <String>[];
  final full = user.fullName?.trim();
  if (full != null && full.isNotEmpty && full != primary) {
    parts.add(full);
  }
  final email = user.email?.trim();
  if (email != null && email.isNotEmpty && email != primary) {
    parts.add(email);
  }
  if (parts.isEmpty) return null;
  return parts.join(' · ');
}

String appUserInitials(AppUserProfile user) {
  final display = appUserDisplayName(user).trim();
  return initialsFromDisplayName(display.isNotEmpty ? display : '?');
}

String initialsFromDisplayName(String name) {
  if (name.isEmpty) return '?';
  final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}

bool isPartnerListableProfile(AppUserProfile profile) {
  return appUserDisplayName(profile).trim().isNotEmpty;
}

int comparePartnersForDisplay(AppUserProfile a, AppUserProfile b) {
  final nameCmp = appUserDisplayName(a)
      .toLowerCase()
      .compareTo(appUserDisplayName(b).toLowerCase());
  if (nameCmp != 0) return nameCmp;
  return a.uid.compareTo(b.uid);
}

List<AppUserProfile> sortPartnersForDisplay(List<AppUserProfile> users) {
  final sorted = [...users]..sort(comparePartnersForDisplay);
  return sorted;
}
