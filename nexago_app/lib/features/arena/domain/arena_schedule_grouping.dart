import '../../arenas/domain/arena_slot.dart';
import 'arena_booking_labels.dart';
import 'arena_manager_booking.dart';
import 'arena_schedule_models.dart';

/// Agrupa e filtra slots da agenda do gestor.
abstract final class ArenaScheduleGrouping {
  ArenaScheduleGrouping._();

  /// Garante que reservas em `arenaBookings` apareçam na grade mesmo se o doc em
  /// `arenaSlots` tiver `date` em Timestamp UTC (dia errado) ou merge incompleto.
  static List<ArenaSlot> applyBookingsOverlay({
    required List<ArenaSlot> slots,
    required List<ArenaManagerBooking> bookings,
    required String dateKey,
  }) {
    if (dateKey.isEmpty || bookings.isEmpty) return slots;

    final dayBookings =
        bookings.where((b) => b.dateKey == dateKey).toList(growable: false);
    if (dayBookings.isEmpty) return slots;

    return slots.map((slot) {
      if (slot.isBooked || slot.isBlocked) return slot;

      for (final b in dayBookings) {
        final bookingCourt = b.courtId.trim();
        if (bookingCourt.isNotEmpty &&
            bookingCourt.toLowerCase() != slot.courtId.trim().toLowerCase()) {
          continue;
        }
        if (!_slotOverlapsBooking(slot, b.startTime, b.endTime)) continue;

        return slot.copyWith(
          rawStatus: 'booked',
          bookingId: b.id,
          bookingAthleteId: b.athleteId.isNotEmpty ? b.athleteId : null,
        );
      }
      return slot;
    }).toList(growable: false);
  }

  static bool _slotOverlapsBooking(
    ArenaSlot slot,
    String bookingStart,
    String bookingEnd,
  ) {
    final ss = _timeToMinutes(slot.startTime);
    var se = _timeToMinutes(slot.endTime);
    final bs = _timeToMinutes(bookingStart);
    var be = _timeToMinutes(bookingEnd);
    if (ss == null || se == null || bs == null || be == null) return false;
    if (se <= ss) se += 24 * 60;
    if (be <= bs) be += 24 * 60;
    return ss < be && bs < se;
  }

  static int? _timeToMinutes(String value) {
    final parts = value.trim().split(':');
    if (parts.isEmpty) return null;
    final hh = int.tryParse(parts[0]) ?? 0;
    final mm = parts.length > 1 ? (int.tryParse(parts[1]) ?? 0) : 0;
    return hh * 60 + mm;
  }

  static ArenaScheduleDayStats dayStats(List<ArenaSlot> slots) {
    var available = 0;
    var booked = 0;
    var blocked = 0;
    for (final s in slots) {
      if (s.isBooked) {
        booked++;
      } else if (s.isBlocked) {
        blocked++;
      } else if (s.isAvailable) {
        available++;
      }
    }
    return ArenaScheduleDayStats(
      total: slots.length,
      available: available,
      booked: booked,
      blocked: blocked,
    );
  }

  static int? peakHour(List<ArenaSlot> slots) {
    final hourCounts = <int, int>{};
    for (final s in slots.where((e) => e.isBooked)) {
      final h = _startHour(s.startTime);
      if (h != null) hourCounts[h] = (hourCounts[h] ?? 0) + 1;
    }
    if (hourCounts.isEmpty) return null;
    return hourCounts.entries.reduce((best, e) {
      if (e.value > best.value) return e;
      if (e.value == best.value && e.key < best.key) return e;
      return best;
    }).key;
  }

  static List<ArenaSlot> applyFilters({
    required List<ArenaSlot> slots,
    required ArenaScheduleStatusFilter statusFilter,
    required String? courtIdFilter,
  }) {
    return slots.where((s) {
      if (courtIdFilter != null &&
          courtIdFilter.isNotEmpty &&
          s.courtId != courtIdFilter) {
        return false;
      }
      return switch (statusFilter) {
        ArenaScheduleStatusFilter.all => true,
        ArenaScheduleStatusFilter.available => s.isAvailable,
        ArenaScheduleStatusFilter.booked => s.isBooked,
        ArenaScheduleStatusFilter.blocked => s.isBlocked,
      };
    }).toList(growable: false);
  }

  static Map<String, ArenaScheduleBookingSummary> bookingLookup(
    List<ArenaManagerBooking> bookings,
  ) {
    final map = <String, ArenaScheduleBookingSummary>{};
    for (final b in bookings) {
      final ps = (b.data['paymentStatus'] as String?)?.toLowerCase().trim();
      var paymentShort = arenaBookingPaymentLabel(b.data);
      if (ps == 'paid' || ps == 'approved') {
        paymentShort = 'Pix';
      } else if (paymentShort.contains('Mercado Pago')) {
        paymentShort = 'MP';
      }

      final amount = (b.data['amountReais'] as num?)?.toDouble() ??
          (b.data['priceReais'] as num?)?.toDouble();

      map[b.id] = ArenaScheduleBookingSummary(
        athleteId: b.athleteId,
        paymentShortLabel: paymentShort,
        amountReais: amount,
      );
    }
    return map;
  }

  static List<ArenaScheduleHourGroup> groupByHour({
    required List<ArenaSlot> slots,
    required Map<String, String> courtNames,
    required Map<String, ArenaScheduleBookingSummary> bookingById,
    int? peakHour,
  }) {
    if (slots.isEmpty) return const [];

    final byHour = <int, List<ArenaSlot>>{};
    for (final s in slots) {
      final h = _startHour(s.startTime) ?? 0;
      byHour.putIfAbsent(h, () => []).add(s);
    }

    final hours = byHour.keys.toList()..sort();
    return hours.map((hour) {
      final hourSlots = byHour[hour]!
        ..sort((a, b) {
          final cn = courtNames[a.courtId]?.compareTo(courtNames[b.courtId] ?? '') ?? 0;
          if (cn != 0) return cn;
          return a.courtId.compareTo(b.courtId);
        });

      final first = hourSlots.first;
      final timeRange = '${first.startTime} – ${first.endTime}';
      final reserved = hourSlots.where((s) => s.isBooked).length;

      final rows = hourSlots.map((slot) {
        ArenaScheduleBookingSummary? booking;
        final bid = slot.bookingId;
        if (bid != null && bid.isNotEmpty) {
          booking = bookingById[bid];
        }
        return ArenaScheduleCourtRow(
          slot: slot,
          courtName: courtNames[slot.courtId] ?? slot.courtId,
          booking: booking,
          isPeakHour: peakHour != null && _startHour(slot.startTime) == peakHour,
        );
      }).toList(growable: false);

      return ArenaScheduleHourGroup(
        hour: hour,
        timeRange: timeRange,
        courtCount: rows.length,
        reservedCount: reserved,
        rows: rows,
      );
    }).toList(growable: false);
  }

  static int? _startHour(String startTime) {
    final t = startTime.trim();
    if (t.length < 2) return null;
    return int.tryParse(t.split(':').first);
  }
}
