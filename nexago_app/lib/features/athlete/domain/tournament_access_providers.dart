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
  });

  final bool canAccess;
  final bool onboardingCompleted;
  final bool profileStepsComplete;

  static const locked = TournamentAccessState(
    canAccess: false,
    onboardingCompleted: false,
    profileStepsComplete: false,
  );
}

final tournamentAccessStateProvider =
    Provider.autoDispose<TournamentAccessState>((ref) {
  final profile = ref.watch(athleteProfileProvider).valueOrNull;
  if (profile == null) return TournamentAccessState.locked;

  final completion = ProfileCompletionState.fromProfile(profile);
  final stepsComplete = completion.allComplete;

  return TournamentAccessState(
    canAccess: canAccessOfficialTournaments(
      onboardingCompleted: profile.onboardingCompleted,
      profileStepsComplete: stepsComplete,
    ),
    onboardingCompleted: profile.onboardingCompleted,
    profileStepsComplete: stepsComplete,
  );
});
