/// Regras de acesso a torneios oficiais e features bloqueadas por perfil.
bool canAccessOfficialTournaments({
  required bool onboardingCompleted,
  required bool profileStepsComplete,
  bool isProfileComplete = false,
}) {
  if (isProfileComplete && onboardingCompleted) return true;
  return onboardingCompleted && profileStepsComplete;
}

String formatMissingProfileStepsForAccess(List<String> labels) {
  if (labels.isEmpty) return '';
  if (labels.length == 1) return labels.first;
  if (labels.length == 2) return '${labels[0]} e ${labels[1]}';
  final head = labels.sublist(0, labels.length - 1).join(', ');
  return '$head e ${labels.last}';
}

/// Mensagem curta para UI quando o acesso está bloqueado.
String? tournamentAccessBlockMessage({
  required bool onboardingCompleted,
  required bool profileStepsComplete,
  bool isProfileComplete = false,
  List<String> missingStepLabels = const [],
}) {
  if (canAccessOfficialTournaments(
    onboardingCompleted: onboardingCompleted,
    profileStepsComplete: profileStepsComplete,
    isProfileComplete: isProfileComplete,
  )) {
    return null;
  }
  if (!onboardingCompleted) {
    return 'Conclua o cadastro inicial para competir em torneios oficiais.';
  }
  if (!profileStepsComplete) {
    if (missingStepLabels.isEmpty) {
      return 'Complete seu perfil para desbloquear torneios oficiais.';
    }
    final list = formatMissingProfileStepsForAccess(missingStepLabels);
    return 'Complete no perfil: $list para desbloquear torneios oficiais.';
  }
  return null;
}
