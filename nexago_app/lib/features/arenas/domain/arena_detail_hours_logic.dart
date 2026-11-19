import 'arena_slot.dart';
import 'slots_page_logic.dart';

/// Horário de funcionamento do perfil da arena, tirado da própria grade de
/// reservas: o dia vai do primeiro início ao último fim entre as quadras
/// abertas. É o horário em que dá para reservar — o mesmo que a arena já
/// configura nas quadras —, sem campo novo no cadastro.

/// Janela de reservas de um dia.
class ArenaDayHours {
  const ArenaDayHours({required this.day, this.openMinutes, this.closeMinutes});

  final DateTime day;

  /// Minutos desde a meia-noite; `null` com o dia fechado.
  final int? openMinutes;

  /// Pode passar de 24 h (fecha 00:00 = 1440).
  final int? closeMinutes;

  bool get isClosed => openMinutes == null || closeMinutes == null;

  String get openLabel => isClosed ? '' : _hm(openMinutes!);
  String get closeLabel => isClosed ? '' : _hm(closeMinutes!);

  /// "07:00–23:00" ou "Fechado".
  String get rangeLabel => isClosed ? 'Fechado' : '$openLabel–$closeLabel';
}

String _hm(int minutes) {
  final m = minutes % (24 * 60);
  return '${(m ~/ 60).toString().padLeft(2, '0')}:'
      '${(m % 60).toString().padLeft(2, '0')}';
}

bool _sameDay(DateTime a, DateTime b) =>
    a.year == b.year && a.month == b.month && a.day == b.day;

/// Janela do [day] nas quadras [courtIds] (as abertas), qualquer que seja o
/// status do slot: reservado também é horário de funcionamento.
ArenaDayHours arenaDayHours({
  required List<ArenaSlot> slots,
  required Set<String> courtIds,
  required DateTime day,
}) {
  int? open;
  int? close;
  for (final slot in slots) {
    if (!courtIds.contains(slot.courtId) || !_sameDay(slot.date, day)) {
      continue;
    }
    final start = slotStartMinutes(slot.startTime);
    var end = slotStartMinutes(slot.endTime);
    if (end <= start) end += 24 * 60;
    if (open == null || start < open) open = start;
    if (close == null || end > close) close = end;
  }
  return ArenaDayHours(
    day: slotDayOnly(day),
    openMinutes: open,
    closeMinutes: close,
  );
}

/// Linha "Aberta agora" do topo do perfil.
class ArenaOpenStatus {
  const ArenaOpenStatus({required this.isOpen, required this.label});

  final bool isOpen;
  final String label;
}

ArenaOpenStatus arenaOpenStatus(ArenaDayHours today, DateTime now) {
  if (today.isClosed) {
    return const ArenaOpenStatus(
      isOpen: false,
      label: 'Sem horários de reserva hoje',
    );
  }
  final minute = now.hour * 60 + now.minute;
  if (minute < today.openMinutes!) {
    return ArenaOpenStatus(
      isOpen: false,
      label: 'Abre hoje às ${today.openLabel}',
    );
  }
  if (minute < today.closeMinutes!) {
    return ArenaOpenStatus(
      isOpen: true,
      label: 'Aberta agora · até ${today.closeLabel}',
    );
  }
  return ArenaOpenStatus(
    isOpen: false,
    label: 'Fechada agora · abriu das ${today.openLabel} às '
        '${today.closeLabel}',
  );
}

/// Uma linha dos horários da semana ("Seg–Sex 07:00–23:00").
class ArenaWeekHoursRow {
  const ArenaWeekHoursRow({required this.daysLabel, required this.hoursLabel});

  final String daysLabel;
  final String hoursLabel;
}

const _weekdayShort = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

/// Horários dos próximos 7 dias a partir de [from], mostrados de segunda a
/// domingo, juntando dias seguidos com a mesma janela.
List<ArenaWeekHoursRow> arenaWeekHours({
  required List<ArenaSlot> slots,
  required Set<String> courtIds,
  required DateTime from,
}) {
  final first = slotDayOnly(from);
  final byWeekday = <int, String>{};
  for (var i = 0; i < 7; i++) {
    final day = DateTime(first.year, first.month, first.day + i);
    byWeekday[day.weekday] =
        arenaDayHours(slots: slots, courtIds: courtIds, day: day).rangeLabel;
  }

  final rows = <ArenaWeekHoursRow>[];
  var runStart = 1;
  for (var wd = 2; wd <= 8; wd++) {
    final ended = wd == 8 || byWeekday[wd] != byWeekday[runStart];
    if (!ended) continue;
    final last = wd - 1;
    rows.add(ArenaWeekHoursRow(
      daysLabel: runStart == last
          ? _weekdayShort[runStart - 1]
          : '${_weekdayShort[runStart - 1]}–${_weekdayShort[last - 1]}',
      hoursLabel: byWeekday[runStart]!,
    ));
    runStart = wd;
  }
  return List.unmodifiable(rows);
}
