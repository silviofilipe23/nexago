import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/slots_page_logic.dart';
import 'weather_booking_rules.dart';

/// Diferença do horário novo para o valor que a chuva liberou.
enum WeatherRescheduleDeltaKind {
  /// Mesmo valor: nada a pagar, nada sobra.
  same,

  /// Mais caro: a diferença é paga na arena.
  extra,

  /// Mais barato: a sobra vira crédito.
  leftover,

  /// Preço do horário desconhecido (o servidor calcula).
  unknown,
}

class WeatherRescheduleDelta {
  const WeatherRescheduleDelta(this.kind, this.amountReais);

  final WeatherRescheduleDeltaKind kind;

  /// Sempre positivo (a pagar na arena ou a virar crédito).
  final double amountReais;

  /// Quanto fica para pagar na arena.
  double get dueOnsiteReais =>
      kind == WeatherRescheduleDeltaKind.extra ? amountReais : 0;
}

/// Espelha `rescheduleSettlement` do backend: o valor liberado cobre o
/// horário novo; mais caro paga a diferença na arena; mais barato, sobra crédito.
WeatherRescheduleDelta weatherRescheduleDelta({
  required double creditableReais,
  required double? newPriceReais,
}) {
  if (newPriceReais == null) {
    return const WeatherRescheduleDelta(WeatherRescheduleDeltaKind.unknown, 0);
  }
  final diffCents =
      (newPriceReais * 100).round() - (creditableReais * 100).round();
  if (diffCents == 0) {
    return const WeatherRescheduleDelta(WeatherRescheduleDeltaKind.same, 0);
  }
  return diffCents > 0
      ? WeatherRescheduleDelta(
          WeatherRescheduleDeltaKind.extra, diffCents / 100)
      : WeatherRescheduleDelta(
          WeatherRescheduleDeltaKind.leftover,
          -diffCents / 100,
        );
}

/// Quantos horários da grade cabem na duração da reserva original (mesma
/// duração no horário novo). Sem horário legível, as linhas de preço gravadas
/// na criação; sem nada, 1.
int weatherRescheduleSlotCount({
  required Map<String, dynamic> booking,
  required int slotDurationMinutes,
}) {
  final window = weatherBookingWindow(booking);
  if (window != null) {
    final minutes = window.end.difference(window.start).inMinutes;
    final slot = slotDurationMinutes > 0 ? slotDurationMinutes : 60;
    return (minutes / slot).ceil().clamp(1, 24);
  }
  final lines = booking['pricingLineItems'];
  if (lines is List && lines.isNotEmpty) return lines.length.clamp(1, 24);
  return 1;
}

/// Dias oferecidos para o horário novo: de hoje até [until] (inclusive).
List<DateTime> weatherRescheduleDays({
  required DateTime now,
  required DateTime? until,
  int fallbackDays = 30,
  int maxDays = 62,
}) {
  final today = DateTime(now.year, now.month, now.day);
  final last = until == null
      ? today.add(Duration(days: fallbackDays - 1))
      : DateTime(until.year, until.month, until.day);
  if (last.isBefore(today)) return const [];
  final out = <DateTime>[];
  var d = today;
  while (!d.isAfter(last) && out.length < maxDays) {
    out.add(d);
    d = DateTime(d.year, d.month, d.day + 1);
  }
  return out;
}

/// Um horário de início possível para a remarcação.
class WeatherRescheduleOption {
  const WeatherRescheduleOption({
    required this.startTime,
    required this.endTime,
    required this.slotStartTimes,
    required this.priceReais,
    required this.available,
    required this.delta,
  });

  final String startTime;
  final String endTime;

  /// Inícios dos slots cobrados (vai em `selectedSlotStartTimes`).
  final List<String> slotStartTimes;
  final double? priceReais;

  /// Todos os slots livres e contíguos.
  final bool available;
  final WeatherRescheduleDelta delta;
}

/// Horários do dia com a mesma duração da reserva original (que ainda não
/// passaram). Ocupados vêm com `available: false` para a grade riscar.
List<WeatherRescheduleOption> buildWeatherRescheduleOptions({
  required List<ArenaSlot> slots,
  required int slotCount,
  required DateTime day,
  required DateTime now,
  required double creditableReais,
}) {
  final sorted = [...slots]..sort(
      (a, b) => slotStartMinutes(a.startTime)
          .compareTo(slotStartMinutes(b.startTime)),
    );
  final count = slotCount < 1 ? 1 : slotCount;
  final out = <WeatherRescheduleOption>[];
  for (var i = 0; i + count <= sorted.length; i++) {
    final first = sorted[i];
    if (isPastBookableSlot(selectedDay: day, slot: first, now: now)) continue;
    final range = sorted.sublist(i, i + count);
    var contiguous = true;
    for (var k = 0; k + 1 < range.length; k++) {
      if (slotStartMinutes(range[k].endTime) !=
          slotStartMinutes(range[k + 1].startTime)) {
        contiguous = false;
        break;
      }
    }
    if (!contiguous) continue;
    final available = range.every(
      (s) =>
          s.isSelectable &&
          !isPastBookableSlot(selectedDay: day, slot: s, now: now),
    );
    double? price = 0;
    for (final s in range) {
      final p = s.priceReais;
      if (p == null || p <= 0) {
        price = null;
        break;
      }
      price = price! + p;
    }
    if (price != null) price = (price * 100).roundToDouble() / 100;
    out.add(
      WeatherRescheduleOption(
        startTime: first.startTime,
        endTime: range.last.endTime,
        slotStartTimes: [for (final s in range) s.startTime.trim()],
        priceReais: price,
        available: available,
        delta: weatherRescheduleDelta(
          creditableReais: creditableReais,
          newPriceReais: price,
        ),
      ),
    );
  }
  return out;
}
