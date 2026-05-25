import '../../arenas/domain/my_booking_item.dart';

const Duration playTodayGraceAfterEnd = Duration(minutes: 5);

DateTime? parseBookingStartAt(MyBookingItem booking) {
  return _parseDateTime(booking.dateRaw, booking.startTime);
}

DateTime? parseBookingEndAt(MyBookingItem booking) {
  var end = _parseDateTime(booking.dateRaw, booking.endTime);
  final start = parseBookingStartAt(booking);
  if (end != null && start != null && !end.isAfter(start)) {
    end = end.add(const Duration(days: 1));
  }
  return end;
}

bool isBookingCanceled(MyBookingItem booking) {
  final status = booking.rawStatus.trim().toLowerCase();
  return status == 'canceled' || status == 'cancelled';
}

bool isSameCalendarDay(DateTime a, DateTime b) {
  return a.year == b.year && a.month == b.month && a.day == b.day;
}

/// `dateKey` no formato `YYYY-MM-DD`.
bool isDateKeyToday(String dateKey, DateTime now) {
  final trimmed = dateKey.trim();
  if (trimmed.length < 10) return false;
  final day = DateTime.tryParse(trimmed.substring(0, 10));
  if (day == null) return false;
  return isSameCalendarDay(day, now);
}

/// Reserva de hoje cujo horário já passou (+ margem), não cancelada.
bool isEligibleForPlayToday(MyBookingItem booking, DateTime now) {
  if (isBookingCanceled(booking)) return false;

  final start = parseBookingStartAt(booking);
  final end = parseBookingEndAt(booking);
  if (start == null || end == null) return false;
  if (!isSameCalendarDay(start, now)) return false;

  return now.isAfter(end.add(playTodayGraceAfterEnd));
}

DateTime? _parseDateOnly(String raw) {
  final value = raw.trim();
  if (value.isEmpty) return null;
  if (value.length >= 10) {
    final iso = DateTime.tryParse(value.substring(0, 10));
    if (iso != null) return DateTime(iso.year, iso.month, iso.day);
  }
  return null;
}

DateTime? _parseDateTime(String dateRaw, String timeRaw) {
  final day = _parseDateOnly(dateRaw);
  if (day == null) return null;
  final parts = timeRaw.trim().split(':');
  if (parts.isEmpty) return null;
  final hh = int.tryParse(parts[0]) ?? 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}
