import 'package:cloud_firestore/cloud_firestore.dart';

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
    this.role,
    this.partnerInviteStatus,
    this.invitedByUid,
    this.invitedAt,
    this.city,
    this.state,
  });

  final String uid;
  final String? email;
  final String? fullName;
  final String? nickname;
  final String? phoneNumber;
  final String? gender;
  final String? birthDate;
  final String? profilePhotoUrl;
  final String? role;
  final String? partnerInviteStatus;
  final String? invitedByUid;
  final DateTime? invitedAt;
  final String? city;
  final String? state;

  factory AppUserProfile.fromFirestore(
    DocumentSnapshot<Map<String, dynamic>> doc,
  ) {
    final data = doc.data() ?? {};
    return AppUserProfile(
      uid: doc.id,
      email: _str(data['email']),
      fullName: _str(data['fullName']) ?? _str(data['name']),
      nickname: _str(data['nickname']),
      phoneNumber: _str(data['phoneNumber']),
      gender: _str(data['gender']),
      birthDate: _str(data['birthDate']),
      profilePhotoUrl: _str(data['profilePhotoUrl']) ?? _str(data['avatarUrl']),
      role: _str(data['role']),
      partnerInviteStatus: _str(data['partnerInviteStatus']),
      invitedByUid: _str(data['invitedByUid']),
      invitedAt: _timestamp(data['invitedAt']),
      city: _str(data['city']),
      state: _str(data['state']),
    );
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

String resolveAppUserDisplayName(
  AppUserProfile? profile, {
  String? override,
  String fallback = '',
}) {
  for (final candidate in [
    readableNameCandidate(override),
    if (profile != null) readableNameCandidate(profile.nickname),
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
  final name = appUserDisplayName(user);
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
