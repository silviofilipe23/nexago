import '../../arenas/domain/my_booking_item.dart';

/// Próxima reserva confirmada (não cancelada) com início no futuro.
MyBookingItem? findNextAthleteBooking(List<MyBookingItem> bookings) {
  final now = DateTime.now();
  MyBookingItem? next;
  DateTime? nextStart;
  for (final booking in bookings) {
    final status = booking.rawStatus.trim().toLowerCase();
    if (status == 'canceled' || status == 'cancelled') continue;
    final start = parseBookingStart(booking);
    if (start == null || !start.isAfter(now)) continue;
    if (nextStart == null || start.isBefore(nextStart)) {
      nextStart = start;
      next = booking;
    }
  }
  return next;
}

DateTime? parseBookingStart(MyBookingItem item) {
  if (item.dateRaw.length < 10) return null;
  final day = DateTime.tryParse(item.dateRaw.substring(0, 10));
  if (day == null) return null;
  final parts = item.startTime.split(':');
  final hh = parts.isNotEmpty ? int.tryParse(parts[0]) ?? 0 : 0;
  final mm = parts.length > 1 ? int.tryParse(parts[1]) ?? 0 : 0;
  return DateTime(day.year, day.month, day.day, hh, mm);
}

/// Rótulo de countdown até [target] (ex.: "EM 2H 36MIN").
String formatCountdownLabel(DateTime now, DateTime target) {
  final diff = target.difference(now);
  if (diff.isNegative) return 'AGORA';
  final hours = diff.inHours;
  final minutes = diff.inMinutes % 60;
  if (hours > 0) return 'EM ${hours}H ${minutes}MIN';
  if (minutes > 0) return 'EM ${minutes}MIN';
  return 'AGORA';
}

/// Parceiro principal da reserva (primeiro convidado confirmado).
String? bookingPartnerLabel(MyBookingItem booking) {
  if (booking.confirmedAthletes.isEmpty) return null;
  final partner = booking.confirmedAthletes.first;
  final name = partner.displayName?.trim() ?? '';
  if (name.isEmpty) return null;
  return name;
}
