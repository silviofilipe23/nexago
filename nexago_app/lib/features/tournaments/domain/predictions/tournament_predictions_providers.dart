import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import 'package:nexago_app/core/profiles/app_user_profile.dart';
import 'package:nexago_app/core/profiles/users_repository.dart';

import '../../data/predictions/tournament_predictions_repository.dart';
import 'tournament_prediction_entry.dart';

final tournamentPredictionsRepositoryProvider =
    Provider<TournamentPredictionsRepository>((ref) {
  return TournamentPredictionsRepository(ref.watch(firestoreProvider));
});

/// Palpite salvo do usuário logado pra este torneio (`null` se ainda não
/// palpitou ou se não está autenticado).
final myTournamentPredictionEntryProvider = FutureProvider.autoDispose
    .family<TournamentPredictionEntry?, String>((ref, tournamentId) async {
  final uid = ref.watch(firebaseAuthProvider).currentUser?.uid.trim() ?? '';
  if (uid.isEmpty) return null;
  return ref
      .watch(tournamentPredictionsRepositoryProvider)
      .getMyEntry(tournamentId: tournamentId, userId: uid);
});

final tournamentPredictionLeaderboardProvider = FutureProvider.autoDispose
    .family<List<TournamentPredictionEntry>, String>((ref, tournamentId) {
  return ref
      .watch(tournamentPredictionsRepositoryProvider)
      .loadLeaderboard(tournamentId);
});

/// Perfis (nome/foto) de quem já palpitou nesse torneio, pro leaderboard.
final tournamentPredictionLeaderboardProfilesProvider = FutureProvider.autoDispose
    .family<Map<String, AppUserProfile>, String>((ref, tournamentId) async {
  final entries =
      await ref.watch(tournamentPredictionLeaderboardProvider(tournamentId).future);
  final uids = entries.map((e) => e.userId).toSet();
  return ref.watch(usersRepositoryProvider).getUsersByIds(uids);
});
