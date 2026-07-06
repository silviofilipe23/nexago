import 'package:flutter/material.dart';

import 'package:nexago_app/core/profiles/app_user_profile.dart';

const _avatarPalette = [
  Color(0xFF5B8DEF),
  Color(0xFF2BD17E),
  Color(0xFFFF6A1A),
  Color(0xFF7C6CFF),
  Color(0xFFFF6B9D),
  Color(0xFF00BCD4),
];

Color rankingAvatarColor(String seed) {
  if (seed.isEmpty) return _avatarPalette.first;
  return _avatarPalette[seed.hashCode.abs() % _avatarPalette.length];
}

String rankingDisplayName(AppUserProfile? profile, String athleteId) {
  if (profile != null) {
    final name = appUserDisplayName(profile).trim();
    if (name.isNotEmpty) return name;
  }
  if (athleteId.length >= 6) {
    return 'Atleta ${athleteId.substring(0, 6)}';
  }
  return 'Atleta';
}

String? rankingAvatarUrl(AppUserProfile? profile) {
  final url = profile?.profilePhotoUrl?.trim();
  if (url == null || url.isEmpty) return null;
  return url;
}

String rankingInitials(AppUserProfile? profile, String athleteId) {
  if (profile != null) {
    final initials = appUserInitials(profile).trim();
    if (initials.isNotEmpty && initials != '?') return initials;
  }
  if (athleteId.length >= 2) {
    return athleteId.substring(0, 2).toUpperCase();
  }
  return 'AT';
}

String formatRankingPoints(int points) {
  final raw = points.toString();
  if (raw.length <= 3) return raw;
  final buffer = StringBuffer();
  for (var i = 0; i < raw.length; i++) {
    if (i > 0 && (raw.length - i) % 3 == 0) buffer.write('.');
    buffer.write(raw[i]);
  }
  return buffer.toString();
}

List<int> rankingYearOptions({int? currentYear, int pastYears = 2}) {
  final year = currentYear ?? DateTime.now().year;
  return [for (var i = 0; i <= pastYears; i++) year - i];
}
