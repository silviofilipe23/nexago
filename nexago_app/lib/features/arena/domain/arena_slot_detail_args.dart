import '../../arenas/domain/arena_slot.dart';

/// Argumentos para [ArenaSlotDetailPage] (via `GoRouter` [extra]).
class ArenaSlotDetailArgs {
  const ArenaSlotDetailArgs({
    required this.slot,
    required this.courtName,
  });

  final ArenaSlot slot;
  final String courtName;
}
