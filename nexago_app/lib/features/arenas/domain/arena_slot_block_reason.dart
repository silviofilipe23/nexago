/// Motivo de bloqueio persistido em `arenaSlots.blockReason`.
enum ArenaSlotBlockReason {
  manutencao,
  evento,
  aula,
  outro,
}

extension ArenaSlotBlockReasonX on ArenaSlotBlockReason {
  String get firestoreValue => name;

  String get displayLabel => switch (this) {
        ArenaSlotBlockReason.manutencao => 'Manutenção',
        ArenaSlotBlockReason.evento => 'Evento privado',
        ArenaSlotBlockReason.aula => 'Aula',
        ArenaSlotBlockReason.outro => 'Outro',
      };

  static ArenaSlotBlockReason? fromFirestore(String? raw) {
    final v = raw?.trim().toLowerCase();
    if (v == null || v.isEmpty) return null;
    for (final r in ArenaSlotBlockReason.values) {
      if (r.name == v) return r;
    }
    return ArenaSlotBlockReason.outro;
  }
}
