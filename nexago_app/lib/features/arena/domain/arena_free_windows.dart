import 'package:flutter/foundation.dart';

import '../../../core/deep_link/app_domains.dart';
import '../../arenas/domain/arena_slot.dart';
import 'arena_date_utils.dart';
import 'arena_now.dart';

/// Um horário livre na linha do dia: horários vagos seguidos de uma ou mais
/// quadras com o mesmo início e fim ("Livre 19h–21h · Quadras 1 e 4").
@immutable
class ArenaFreeWindow {
  const ArenaFreeWindow({
    required this.startTime,
    required this.endTime,
    required this.courtIds,
    required this.courtNames,
  });

  final String startTime;
  final String endTime;
  final List<String> courtIds;
  final List<String> courtNames;

  int get startMinutes => arenaNowMinutes(startTime) ?? 0;

  /// "19h–21h", "19h30–21h".
  String get rangeLabel =>
      '${arenaHourLabel(startTime)}–${arenaHourLabel(endTime)}';

  /// "Quadra 1", "Quadras 1 e 4", "Quadras 1, 2 e 4".
  String get courtsLabel => arenaCourtsLabel(courtNames);

  @override
  bool operator ==(Object other) =>
      other is ArenaFreeWindow &&
      other.startTime == startTime &&
      other.endTime == endTime &&
      listEquals(other.courtIds, courtIds);

  @override
  int get hashCode => Object.hash(startTime, endTime, Object.hashAll(courtIds));

  @override
  String toString() => 'ArenaFreeWindow($rangeLabel · $courtsLabel)';
}

/// "19:00" → "19h"; "19:30" → "19h30"; fim "00:00" → "24h".
String arenaHourLabel(String hhmm) {
  final parts = hhmm.trim().split(':');
  final h = int.tryParse(parts.first);
  if (h == null) return hhmm;
  final m = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
  return m == 0 ? '${h}h' : '${h}h${m.toString().padLeft(2, '0')}';
}

/// Junta os nomes das quadras: "Quadra 1", "Quadras 1 e 4", "Quadras 1, 2 e 4".
/// Nome sem número entra inteiro ("Central e Quadra 2").
String arenaCourtsLabel(List<String> names) {
  if (names.isEmpty) return '';
  if (names.length == 1) return names.first;
  final numbers = <String>[];
  for (final n in names) {
    final m = RegExp(r'^quadra\s+(\S+)$', caseSensitive: false).firstMatch(n);
    if (m == null) {
      numbers.clear();
      break;
    }
    numbers.add(m.group(1)!);
  }
  final parts = numbers.length == names.length ? numbers : names;
  final joined =
      '${parts.sublist(0, parts.length - 1).join(', ')} e ${parts.last}';
  return numbers.length == names.length ? 'Quadras $joined' : joined;
}

/// Horários livres do dia [dateKey] a partir da grade já com as reservas
/// aplicadas (`applyBookingsOverlay`). Junta horários vagos seguidos de cada
/// quadra e agrupa as quadras com a mesma janela. Hoje, só o que ainda vai
/// começar; dia passado não tem horário livre. Função pura.
List<ArenaFreeWindow> buildArenaFreeWindows({
  required List<ArenaSlot> slots,
  required String dateKey,
  required DateTime now,
  required Map<String, String> courtNames,
}) {
  final todayKey = arenaDateKey(arenaDateOnly(now));
  if (dateKey.compareTo(todayKey) < 0) return const [];
  final nowMin = dateKey == todayKey ? now.hour * 60 + now.minute : -1;

  final byCourt = <String, List<ArenaSlot>>{};
  for (final s in slots) {
    if (s.dateKey != dateKey || !s.isAvailable) continue;
    final start = arenaNowMinutes(s.startTime);
    if (start == null || start < nowMin) continue;
    byCourt.putIfAbsent(s.courtId, () => []).add(s);
  }

  // (início, fim) → quadras.
  final windows = <(int, int), List<String>>{};
  final labels = <(int, int), (String, String)>{};
  for (final entry in byCourt.entries) {
    final list = entry.value
      ..sort(
        (a, b) => (arenaNowMinutes(a.startTime) ?? 0)
            .compareTo(arenaNowMinutes(b.startTime) ?? 0),
      );
    // Horários seguidos da quadra viram uma janela só.
    final runs = <(String, String)>[];
    for (final s in list) {
      if (runs.isNotEmpty && runs.last.$2 == s.startTime) {
        runs[runs.length - 1] = (runs.last.$1, s.endTime);
      } else {
        runs.add((s.startTime, s.endTime));
      }
    }
    for (final (start, end) in runs) {
      final key = (
        arenaNowMinutes(start) ?? 0,
        arenaNowMinutes(end, isEnd: true) ?? 0,
      );
      windows.putIfAbsent(key, () => []).add(entry.key);
      labels[key] = (start, end);
    }
  }

  final keys = windows.keys.toList()
    ..sort(
        (a, b) => a.$1 != b.$1 ? a.$1.compareTo(b.$1) : a.$2.compareTo(b.$2));
  return [
    for (final k in keys)
      () {
        final ids = windows[k]!
          ..sort(
            (a, b) => (courtNames[a] ?? a).compareTo(courtNames[b] ?? b),
          );
        return ArenaFreeWindow(
          startTime: labels[k]!.$1,
          endTime: labels[k]!.$2,
          courtIds: List.unmodifiable(ids),
          courtNames: List.unmodifiable(
              [for (final id in ids) courtNames[id] ?? 'Quadra']),
        );
      }(),
  ];
}

/// Link público para reservar na arena (portal do atleta; quem tem o app
/// cai nele).
String arenaPublicBookingUrl(String arenaId) =>
    AppShareLinks.arenaBooking(arenaId);

/// Texto do "Divulgar" de um horário livre.
String arenaFreeWindowShareText({
  required ArenaFreeWindow window,
  required String dayLabel,
  required String arenaName,
  required String arenaId,
}) {
  final where = arenaName.trim().isEmpty ? '' : ' na ${arenaName.trim()}';
  return 'Horário livre $dayLabel, ${window.rangeLabel}, '
      '${window.courtsLabel}$where. Reserve pelo nexaGO: '
      '${arenaPublicBookingUrl(arenaId)}';
}
