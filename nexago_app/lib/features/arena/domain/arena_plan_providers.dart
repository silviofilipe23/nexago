import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
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

/// Recursos liberados para a arena atualmente gerida. Enquanto o plano carrega,
/// assume o mínimo (sem plano) — o gate só libera quando o Pro está confirmado.
final managedArenaCapabilitiesProvider =
    Provider.autoDispose<Set<ArenaCapability>>((ref) {
  final status =
      ref.watch(managedArenaPlanStatusProvider).valueOrNull ??
          ArenaPlanStatus.none;
  return capabilitiesFor(status.tier, entitled: status.entitled);
});

/// Máximo de quadras da arena atualmente gerida (`null` = ilimitado).
final managedArenaMaxCourtsProvider = Provider.autoDispose<int?>((ref) {
  final status =
      ref.watch(managedArenaPlanStatusProvider).valueOrNull ??
          ArenaPlanStatus.none;
  return maxCourtsFor(status.tier, entitled: status.entitled);
});
