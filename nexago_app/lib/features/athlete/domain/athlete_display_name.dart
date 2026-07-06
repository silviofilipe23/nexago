import 'package:nexago_app/core/profiles/app_user_profile.dart';
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

/// Nome curto p/ rótulos de dupla (ex.: "Ana C."), pra reduzir colisão
/// quando dois atletas compartilham o primeiro nome.
String athleteShortLabel(AthleteProfile profile) {
  final display = athleteDisplayName(profile, fallback: '');
  if (display.isEmpty) return '';
  final parts =
      display.trim().split(RegExp(r'\s+')).where((p) => p.isNotEmpty).toList();
  if (parts.length <= 1) return display;
  final lastInitial = parts.last[0].toUpperCase();
  return '${parts.first} $lastInitial.';
}

/// Rótulo de uma dupla a partir dos dois perfis: tenta nomes curtos e, se
/// ainda colidirem (mesmo primeiro nome + mesma inicial), cai pro nome
/// completo — nunca esconde um dos dois jogadores atrás do outro.
String pairDisplayName(AthleteProfile? player1, AthleteProfile? player2) {
  final p1Short = player1 != null ? athleteShortLabel(player1) : '';
  final p2Short = player2 != null ? athleteShortLabel(player2) : '';
  if (p1Short.isNotEmpty && p2Short.isNotEmpty && p1Short != p2Short) {
    return '$p1Short/$p2Short';
  }

  final p1Full = player1 != null ? athleteDisplayName(player1, fallback: '') : '';
  final p2Full = player2 != null ? athleteDisplayName(player2, fallback: '') : '';
  if (p1Full.isNotEmpty && p2Full.isNotEmpty && p1Full != p2Full) {
    return '$p1Full/$p2Full';
  }

  if (p1Short.isNotEmpty) return p1Short;
  if (p2Short.isNotEmpty) return p2Short;
  return 'Dupla';
}

/// Linha secundária (nome completo) quando diferente do apelido exibido.
String? athleteSecondaryLine(AthleteProfile profile) {
  final primary = athleteDisplayName(profile);
  final full = profile.name.trim();
  if (full.isNotEmpty && full != primary) return full;
  return null;
}
