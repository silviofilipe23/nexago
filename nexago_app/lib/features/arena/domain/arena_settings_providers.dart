import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'arena_court_providers.dart';
import 'arena_schedule_providers.dart';
import 'arena_settings_schedule.dart';

/// Template carregado da primeira quadra (para preencher o formulário).
final arenaSettingsTemplateProvider =
    FutureProvider.autoDispose<ArenaSettingsScheduleState>((ref) async {
  final arenaId = ref.watch(managedArenaIdProvider).valueOrNull;
  if (arenaId == null || arenaId.isEmpty) {
    return ArenaSettingsScheduleState.initial();
  }
  final loaded =
      await ref.read(courtServiceProvider).loadScheduleTemplate(arenaId);
  if (loaded == null) {
    return ArenaSettingsScheduleState.initial();
  }
  return ArenaSettingsScheduleState.fromFirestore(
    availabilitySchedule: loaded.schedule,
    slotDurationMinutes: loaded.slotDuration,
  );
});
