import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'athlete_profile_providers.dart';
import 'profile_access.dart';

/// Estado de acesso a torneios oficiais para o atleta logado.
class TournamentAccessState {
  const TournamentAccessState({
    required this.canAccess,
    required this.onboardingCompleted,
    required this.isProfileComplete,
    this.blockMessage,
    this.missingStepTitles = const [],
    this.isLoading = false,
  });

  final bool canAccess;
  final bool onboardingCompleted;
  final bool isProfileComplete;
  final String? blockMessage;
  final List<String> missingStepTitles;
  final bool isLoading;

  /// Texto para snackbar/toast (inclui passos pendentes quando existirem).
  String? get snackbarMessage {
    final message = blockMessage;
    if (message == null) return null;
    if (missingStepTitles.isEmpty) return message;
    return '$message\n\nPendente: ${missingStepTitles.join(' · ')}';
  }

  static final locked = TournamentAccessState(
    canAccess: false,
    onboardingCompleted: false,
    isProfileComplete: false,
    blockMessage:
        'Conclua o cadastro inicial para competir em torneios oficiais.',
    missingStepTitles: const [
      'Cadastro inicial',
      'WhatsApp',
      'Cidade',
    ],
  );

  static const loading = TournamentAccessState(
    canAccess: true,
    onboardingCompleted: false,
    isProfileComplete: false,
    isLoading: true,
  );
}

final tournamentAccessStateProvider =
    Provider.autoDispose<TournamentAccessState>((ref) {
  final profileAsync = ref.watch(athleteProfileProvider);

  if (profileAsync.isLoading && !profileAsync.hasValue) {
    return TournamentAccessState.loading;
  }

  final profile = effectiveProfileForTournamentAccess(
    profileAsync.valueOrNull,
    ref.watch(authProvider).valueOrNull,
  );

  if (profile == null) {
    return TournamentAccessState.locked;
  }

  final canAccess = canAccessOfficialTournaments(profile: profile);
  final missingTitles = tournamentProfileMissingTitles(profile);

  return TournamentAccessState(
    canAccess: canAccess,
    onboardingCompleted: profile.onboardingCompleted,
    isProfileComplete: profile.isProfileComplete,
    missingStepTitles: missingTitles,
    blockMessage: tournamentAccessBlockMessageForProfile(profile),
  );
});
