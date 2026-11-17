/// Reserva de balcão em vários horários seguidos: regras puras.
///
/// O servidor (`createArenaManualBooking`) já aceita qualquer intervalo
/// `startTime → endTime` e trava hora a hora; aqui o app só descobre até onde
/// a quadra está livre sem interrupção a partir do horário tocado.
library;

import '../../arenas/domain/arena_slot.dart';

/// Teto de horários numa reserva de balcão (mantém a fileira de opções curta).
const kMaxManualBookingSlots = 8;

const _minutesPerDay = 24 * 60;

int? _minutesOf(String time) {
  final m = RegExp(r'^(\d{1,2}):(\d{2})').firstMatch(time.trim());
  if (m == null) return null;
  return int.parse(m.group(1)!) * 60 + int.parse(m.group(2)!);
}

/// [start] e os horários livres seguintes, colados um no outro (o próximo
/// começa onde o anterior termina), na mesma quadra e dia. Para no primeiro
/// buraco, ocupado, bloqueado ou na meia-noite. Sempre começa por [start].
List<ArenaSlot> consecutiveAvailableSlots(
  ArenaSlot start,
  Iterable<ArenaSlot> daySlots, {
  int max = kMaxManualBookingSlots,
}) {
  final court = start.courtId.trim().toLowerCase();
  final dateKey = start.dateKey;
  final freeByStart = <int, ArenaSlot>{};
  for (final s in daySlots) {
    if (!s.isAvailable) continue;
    if (s.courtId.trim().toLowerCase() != court || s.dateKey != dateKey) {
      continue;
    }
    final m = _minutesOf(s.startTime);
    if (m != null) freeByStart.putIfAbsent(m, () => s);
  }

  final chain = <ArenaSlot>[start];
  var current = start;
  while (chain.length < max) {
    final currentStart = _minutesOf(current.startTime);
    final currentEnd = _minutesOf(current.endTime);
    // Fim 00:00 (ou antes do início) vira o dia: o próximo é de outra data.
    if (currentStart == null ||
        currentEnd == null ||
        currentEnd <= currentStart) {
      break;
    }
    final next = freeByStart[currentEnd];
    if (next == null) break;
    chain.add(next);
    current = next;
  }
  return List.unmodifiable(chain);
}

/// Soma dos preços dos horários; `null` se algum não tem preço (aí vale a
/// cotação do servidor ou o que o gestor digitar).
double? sumSlotPrices(Iterable<ArenaSlot> slots) {
  var total = 0.0;
  for (final s in slots) {
    final price = s.priceReais;
    if (price == null || price <= 0) return null;
    total += price;
  }
  return total;
}

/// Minutos de [startTime] a [endTime]; fim 00:00 = meia-noite. Inválido → 0.
int slotSpanMinutes(String startTime, String endTime) {
  final start = _minutesOf(startTime);
  var end = _minutesOf(endTime);
  if (start == null || end == null) return 0;
  if (end == 0 && start > 0) end = _minutesPerDay;
  return end > start ? end - start : 0;
}
