import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'athlete_profile_providers.dart';
import 'profile_access.dart';
import 'profile_completion_models.dart';

/// Estado de acesso a torneios oficiais para o atleta logado.
class TournamentAccessState {
  const TournamentAccessState({
    required this.canAccess,
    required this.onboardingCompleted,
    required this.profileStepsComplete,
    required this.isProfileComplete,
    this.blockMessage,
  });

  final bool canAccess;
  final bool onboardingCompleted;
  final bool profileStepsComplete;
  final bool isProfileComplete;
  final String? blockMessage;

  static const locked = TournamentAccessState(
    canAccess: false,
    onboardingCompleted: false,
    profileStepsComplete: false,
    isProfileComplete: false,
    blockMessage:
        'Conclua o cadastro inicial para competir em torneios oficiais.',
  );
}

final tournamentAccessStateProvider =
    Provider.autoDispose<TournamentAccessState>((ref) {
  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  if (profile == null) return TournamentAccessState.locked;

  final completion = ProfileCompletionState.fromProfile(profile);
  final stepsComplete = completion.allComplete;

  final canAccess = canAccessOfficialTournaments(
    onboardingCompleted: profile.onboardingCompleted,
    profileStepsComplete: stepsComplete,
    isProfileComplete: profile.isProfileComplete,
  );

  return TournamentAccessState(
    canAccess: canAccess,
    onboardingCompleted: profile.onboardingCompleted,
    profileStepsComplete: stepsComplete,
    isProfileComplete: profile.isProfileComplete,
    blockMessage: tournamentAccessBlockMessage(
      onboardingCompleted: profile.onboardingCompleted,
      profileStepsComplete: stepsComplete,
      isProfileComplete: profile.isProfileComplete,
      missingStepLabels: completion.pendingTournamentAccessLabels,
    ),
  );
});
