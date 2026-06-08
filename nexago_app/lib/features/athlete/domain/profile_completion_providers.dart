import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'athlete_profile_providers.dart';
import 'profile_access.dart';
import 'profile_completion_models.dart';

/// Estado calculado dos passos de completar perfil (a partir do Firestore).
final profileCompletionStateProvider =
    Provider.autoDispose<ProfileCompletionState?>((ref) {
  final profile = effectiveProfileForTournamentAccess(
    ref.watch(athleteProfileProvider).valueOrNull,
    ref.watch(authProvider).valueOrNull,
  );
  if (profile == null) return null;
  return ProfileCompletionState.fromProfile(profile);
});
