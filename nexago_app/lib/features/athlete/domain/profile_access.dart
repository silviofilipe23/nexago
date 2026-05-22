/// Regras de acesso a torneios oficiais e features bloqueadas por perfil.
bool canAccessOfficialTournaments({
  required bool onboardingCompleted,
  required bool profileStepsComplete,
}) {
  return onboardingCompleted && profileStepsComplete;
}

/// Mensagem curta para UI quando o acesso está bloqueado.
String? tournamentAccessBlockMessage({
  required bool onboardingCompleted,
  required bool profileStepsComplete,
}) {
  if (canAccessOfficialTournaments(
    onboardingCompleted: onboardingCompleted,
    profileStepsComplete: profileStepsComplete,
  )) {
    return null;
  }
  if (!onboardingCompleted) {
    return 'Conclua o cadastro inicial para competir em torneios oficiais.';
  }
  if (!profileStepsComplete) {
    return 'Complete os 5 passos do perfil para desbloquear torneios oficiais.';
  }
  return null;
}
