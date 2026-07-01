import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../arenas/domain/arenas_providers.dart';
import '../data/arena_subscription_repository.dart';
import 'arena_plan.dart';
import 'arena_schedule_providers.dart';

final arenaSubscriptionRepositoryProvider =
    Provider<ArenaSubscriptionRepository>((ref) {
  return ArenaSubscriptionRepository(ref.watch(firestoreProvider));
});

/// Estado do plano de uma arena específica.
final arenaPlanStatusProvider =
    StreamProvider.autoDispose.family<ArenaPlanStatus, String>((ref, arenaId) {
  return ref.watch(arenaSubscriptionRepositoryProvider).watchPlan(arenaId);
});

/// Estado do plano da arena atualmente gerida.
final managedArenaPlanStatusProvider =
    StreamProvider.autoDispose<ArenaPlanStatus>((ref) {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  if (arenaId == null || arenaId.trim().isEmpty) {
    return Stream.value(ArenaPlanStatus.none);
  }
  return ref.watch(arenaSubscriptionRepositoryProvider).watchPlan(arenaId);
});
