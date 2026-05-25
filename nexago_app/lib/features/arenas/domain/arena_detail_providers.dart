import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_detail_logic.dart';
import 'arena_slot.dart';
import 'arenas_providers.dart';
import 'slots_providers.dart';
import 'slots_query.dart';

final arenaDetailTodayCourtsProvider = FutureProvider.autoDispose
    .family<ArenaDetailTodaySummary, String>((ref, arenaId) async {
  final aid = arenaId.trim();
  if (aid.isEmpty) return ArenaDetailTodaySummary.empty;

  final courts = await ref.watch(courtsStreamProvider(aid).future);
  final arena = await ref.watch(arenaByIdProvider(aid).future);
  final fallbackPrice = arena?.pricePerHourReais;

  final now = DateTime.now();
  final today = DateTime(now.year, now.month, now.day);

  final slotsByCourtId = <String, List<ArenaSlot>>{};
  for (final court in courts) {
    if (court.isMaintenance) continue;
    final query = SlotsQuery(
      arenaId: aid,
      courtId: court.id,
      date: today,
      arenaFallbackPricePerHourReais: fallbackPrice,
    );
    final slots = await ref.watch(slotsStreamProvider(query).future);
    slotsByCourtId[court.id] = slots;
  }

  return buildArenaDetailTodaySummary(
    courts: courts,
    slotsByCourtId: slotsByCourtId,
    today: today,
  );
});
