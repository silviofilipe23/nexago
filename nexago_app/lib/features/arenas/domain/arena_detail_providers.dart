import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_detail_hours_logic.dart';
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

/// Dias da grade carregados pelo perfil (os mesmos 21 da agenda).
const int kArenaDetailGridDays = 21;

/// Horário de funcionamento da arena a partir da grade de hoje em diante: a
/// janela de hoje e as linhas da semana. Usa a mesma grade da agenda (mesma
/// chave do provedor), então não abre leitura nova. `null` enquanto carrega.
final arenaDetailHoursProvider = Provider.autoDispose.family<
    ({ArenaDayHours today, List<ArenaWeekHoursRow> week})?,
    ({String arenaId, DateTime today})>((ref, params) {
  final courts = ref.watch(courtsStreamProvider(params.arenaId)).valueOrNull;
  final slots = ref
      .watch(arenaRangeSlotsProvider((
        arenaId: params.arenaId,
        from: params.today,
        days: kArenaDetailGridDays,
      )))
      .valueOrNull;
  if (courts == null || slots == null) return null;
  final ids = {
    for (final c in courts)
      if (!c.isMaintenance) c.id,
  };
  return (
    today: arenaDayHours(slots: slots, courtIds: ids, day: params.today),
    week: arenaWeekHours(slots: slots, courtIds: ids, from: params.today),
  );
});
