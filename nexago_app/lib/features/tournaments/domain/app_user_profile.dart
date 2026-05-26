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

String appUserDisplayName(AppUserProfile user) {
  final nick = user.nickname?.trim();
  if (nick != null && nick.isNotEmpty) return nick;
  final name = user.fullName?.trim();
  if (name != null && name.isNotEmpty) return name;
  return user.email ?? '';
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
  final parts = name.split(' ').where((p) => p.isNotEmpty).toList();
  if (parts.isEmpty) return '?';
  if (parts.length == 1) {
    return parts.first.length >= 2
        ? parts.first.substring(0, 2).toUpperCase()
        : parts.first.toUpperCase();
  }
  return '${parts.first[0]}${parts.last[0]}'.toUpperCase();
}
