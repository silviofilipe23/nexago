import '../../tournaments/domain/app_user_profile.dart';
import 'athlete_profile.dart';

/// Nome exibido do atleta: apelido → nome completo → fallback.
String athleteDisplayName(AthleteProfile profile, {String fallback = 'Atleta'}) {
  return resolveAppUserDisplayName(
    AppUserProfile(
      uid: profile.id,
      fullName: profile.name,
      nickname: profile.nickname,
    ),
    fallback: fallback,
  );
}

/// Iniciais derivadas do nome exibido (apelido quando existir).
String athleteInitials(AthleteProfile profile) {
  return initialsFromDisplayName(athleteDisplayName(profile, fallback: '?'));
}

/// Linha secundária (nome completo) quando diferente do apelido exibido.
String? athleteSecondaryLine(AthleteProfile profile) {
  final primary = athleteDisplayName(profile);
  final full = profile.name.trim();
  if (full.isNotEmpty && full != primary) return full;
  return null;
}
