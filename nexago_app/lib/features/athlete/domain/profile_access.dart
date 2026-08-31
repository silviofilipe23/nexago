import 'package:firebase_auth/firebase_auth.dart';

import 'athlete_profile.dart';

/// Cadastro inicial concluído (onboarding ou flag legada).
bool isTournamentOnboardingDone(AthleteProfile profile) {
  return profile.onboardingCompleted || profile.isProfileComplete;
}

/// Cidade preenchida (UF não é obrigatória para torneios).
bool hasTournamentCity(AthleteProfile profile) {
  return profile.city.trim().isNotEmpty;
}

/// WhatsApp em formato utilizável: 10–11 dígitos (fixo/celular) ou 12–13 com
/// o +55 na frente.
///
/// Espelho exato de `isValidWhatsApp` em
/// `functions/src/athlete-tournament-access.ts`.
bool isValidWhatsAppNumber(String? raw) {
  final digits = (raw ?? '').replaceAll(RegExp(r'\D'), '');
  if (digits.length >= 10 && digits.length <= 11) return true;
  if (digits.length >= 12 && digits.length <= 13 && digits.startsWith('55')) {
    return true;
  }
  return false;
}

/// WhatsApp de contato: número declarado pelo atleta OU posse confirmada por
/// SMS (contas legadas verificadas antes de `phoneNumber` existir no doc).
///
/// A verificação por SMS deixou de ser obrigatória para inscrição — o SMS não
/// chega para parte dos atletas e travava a inscrição inteira. O selo continua
/// valendo para a gamificação ("perfil 100%"), não para o gate.
bool hasTournamentWhatsApp(AthleteProfile profile) {
  if (profile.phoneVerified) return true;
  return isValidWhatsAppNumber(profile.phoneNumber);
}

/// Perfil mínimo para inscrição em torneios: onboarding + WhatsApp + cidade.
///
/// Espelho exato de `isTournamentProfileReady` em
/// `functions/src/athlete-tournament-access.ts` — inclusive o curto-circuito
/// por `isProfileComplete`. Divergir daqui só troca o bloqueio antecipado (com
/// banner) por um `failed-precondition` no meio da inscrição.
bool isTournamentProfileReady(AthleteProfile profile) {
  if (profile.isProfileComplete) return true;
  return isTournamentOnboardingDone(profile) &&
      hasTournamentWhatsApp(profile) &&
      hasTournamentCity(profile);
}

/// Títulos para banner (ex.: "WhatsApp", "Cidade").
List<String> tournamentProfileMissingTitles(AthleteProfile profile) {
  if (isTournamentProfileReady(profile)) return const [];
  final missing = <String>[];
  if (!isTournamentOnboardingDone(profile)) {
    missing.add('Cadastro inicial');
  }
  if (!hasTournamentWhatsApp(profile)) {
    missing.add('WhatsApp');
  }
  if (!hasTournamentCity(profile)) {
    missing.add('Cidade');
  }
  return missing;
}

/// Rótulos para mensagens (ex.: "cadastro inicial", "WhatsApp").
List<String> tournamentProfileMissingLabels(AthleteProfile profile) {
  if (isTournamentProfileReady(profile)) return const [];
  final missing = <String>[];
  if (!isTournamentOnboardingDone(profile)) {
    missing.add('cadastro inicial');
  }
  if (!hasTournamentWhatsApp(profile)) {
    missing.add('WhatsApp');
  }
  if (!hasTournamentCity(profile)) {
    missing.add('cidade');
  }
  return missing;
}

/// Regras de acesso a torneios oficiais e features bloqueadas por perfil.
bool canAccessOfficialTournaments({
  required AthleteProfile profile,
}) {
  return isTournamentProfileReady(profile);
}

/// Perfil efetivo para validar passos (ex.: foto do Google Auth ainda não salva).
AthleteProfile? effectiveProfileForTournamentAccess(
  AthleteProfile? profile,
  User? authUser,
) {
  if (profile == null) return null;
  final avatar = profile.avatarUrl?.trim();
  if (avatar != null && avatar.isNotEmpty) return profile;
  final authPhoto = authUser?.photoURL?.trim();
  if (authPhoto == null || authPhoto.isEmpty) return profile;
  return profile.copyWith(avatarUrl: authPhoto);
}

String formatMissingProfileStepsForAccess(List<String> labels) {
  if (labels.isEmpty) return '';
  if (labels.length == 1) return labels.first;
  if (labels.length == 2) return '${labels[0]} e ${labels[1]}';
  final head = labels.sublist(0, labels.length - 1).join(', ');
  return '$head e ${labels.last}';
}

/// Mensagem curta para UI quando o acesso está bloqueado.
String? tournamentAccessBlockMessageForProfile(AthleteProfile profile) {
  if (isTournamentProfileReady(profile)) return null;

  final missingLabels = tournamentProfileMissingLabels(profile);
  if (missingLabels.isNotEmpty) {
    final list = formatMissingProfileStepsForAccess(missingLabels);
    if (!isTournamentOnboardingDone(profile)) {
      return 'Conclua o cadastro inicial. Falta: $list.';
    }
    return 'Falta completar no perfil: $list.';
  }

  return 'Complete cadastro, WhatsApp e cidade para desbloquear torneios oficiais.';
}
