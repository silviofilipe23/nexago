import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';

import '../gamification_providers.dart';
import 'sand_rank_catalog.dart';
import 'sand_rank_models.dart';

/// Flag do recurso — doc `appConfig/sandRank {enabled}`.
/// Backend fica sempre ligado; a flag gateia só a UI nova (kill switch).
final sandRankEnabledProvider = StreamProvider<bool>((ref) {
  return ref
      .watch(firestoreProvider)
      .doc('appConfig/sandRank')
      .snapshots()
      .map((doc) => doc.data()?['enabled'] == true);
});

/// Progresso do próprio atleta na trilha, derivado do XP do summary.
final sandRankProgressProvider = Provider.autoDispose<SandRankProgress>((ref) {
  final xp = ref.watch(gamificationSummaryProvider).valueOrNull?.xp ?? 0;
  return sandRankProgressFromXp(xp);
});

/// Recompensas da trilha concedidas ao próprio atleta.
final sandRankRewardsProvider =
    StreamProvider.autoDispose<List<UserSandRankReward>>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream.value(const []);
  }
  return ref.watch(gamificationServiceProvider).watchRankRewards(userId);
});

/// Recompensas ainda não vistas — dispara a celebração de promoção.
final unseenSandRankRewardsProvider =
    Provider.autoDispose<List<UserSandRankReward>>((ref) {
  final rewards = ref.watch(sandRankRewardsProvider).valueOrNull ?? const [];
  return rewards.where((r) => r.isUnseen).toList(growable: false);
});

/// Elo + cosméticos públicos de um atleta (espelho `public_profiles/{uid}`).
typedef PublicSandRankInfo = ({
  PublicSandRank? rank,
  SandRankCosmetics cosmetics,
});

final publicSandRankByUserIdProvider = StreamProvider.autoDispose
    .family<PublicSandRankInfo, String>((ref, userId) {
  final uid = userId.trim();
  if (uid.isEmpty) {
    return Stream.value((rank: null, cosmetics: const SandRankCosmetics()));
  }
  return ref
      .watch(firestoreProvider)
      .doc('public_profiles/$uid')
      .snapshots()
      .map((doc) {
    final data = doc.data();
    return (
      rank: PublicSandRank.fromMap(data?['sandRank'] as Map<String, dynamic>?),
      cosmetics: SandRankCosmetics.fromMap(
        data?['sandRankCosmetics'] as Map<String, dynamic>?,
      ),
    );
  });
});

/// Cosméticos equipados do próprio atleta (doc `users/{uid}`).
final sandRankCosmeticsProvider =
    StreamProvider.autoDispose<SandRankCosmetics>((ref) {
  final userId = ref.watch(authProvider).valueOrNull?.uid;
  if (userId == null || userId.isEmpty) {
    return Stream.value(const SandRankCosmetics());
  }
  return ref
      .watch(firestoreProvider)
      .doc('users/$userId')
      .snapshots()
      .map((doc) => SandRankCosmetics.fromMap(
            doc.data()?['sandRankCosmetics'] as Map<String, dynamic>?,
          ));
});
