import 'package:flutter/foundation.dart';

import 'arena_date_utils.dart';
import 'arena_manager_booking.dart';

/// Histórico de ocupação do mesmo horário nos últimos N dias da semana.
@immutable
class ArenaSlotWeekdayHistory {
  const ArenaSlotWeekdayHistory({
    required this.filledCount,
    required this.sampleSize,
    required this.occupancyPercent,
    required this.dateLabels,
    required this.filledFlags,
  });

  final int filledCount;
  final int sampleSize;
  final double occupancyPercent;
  final List<String> dateLabels;
  final List<bool> filledFlags;

  bool get hasEnoughData => sampleSize >= 2;
}

abstract final class ArenaSlotWeekdayHistoryBuilder {
  ArenaSlotWeekdayHistoryBuilder._();

  static ArenaSlotWeekdayHistory? build({
    required List<ArenaManagerBooking> bookings,
    required String courtId,
    required String startTime,
    required DateTime slotDate,
    int sampleSize = 6,
  }) {
    final cid = courtId.trim();
    final st = startTime.trim();
    if (cid.isEmpty || st.isEmpty) return null;

    final anchor = arenaDateOnly(slotDate);
    final weekday = anchor.weekday;
    final labels = <String>[];
    final flags = <bool>[];
    var filled = 0;

    for (var i = sampleSize; i >= 1; i--) {
      final d = anchor.subtract(Duration(days: 7 * i));
      if (d.weekday != weekday) continue;
      final key = arenaDateKey(d);
      final label = '${d.day} ${_monthShort(d.month)}';
      final hasBooking = bookings.any((b) {
        if (b.courtId != cid) return false;
        if (b.dateKey != key) return false;
        return b.startTime.trim() == st;
      });
      labels.add(label);
      flags.add(hasBooking);
      if (hasBooking) filled++;
    }

    if (labels.length < 2) return null;

    final total = labels.length;
    return ArenaSlotWeekdayHistory(
      filledCount: filled,
      sampleSize: total,
      occupancyPercent: total == 0 ? 0 : (filled / total) * 100,
      dateLabels: labels,
      filledFlags: flags,
    );
  }

  static String _monthShort(int month) {
    const m = [
      'jan',
      'fev',
      'mar',
      'abr',
      'mai',
      'jun',
      'jul',
      'ago',
      'set',
      'out',
      'nov',
      'dez',
    ];
    return m[month - 1];
  }
}
