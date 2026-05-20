import 'package:flutter/foundation.dart';

import 'arena_manager_booking.dart';

/// Agrupamento de reservas por `dateKey` (modo Futuras).
@immutable
class ArenaBookingDaySection {
  const ArenaBookingDaySection({
    required this.dateKey,
    required this.title,
    required this.bookings,
    this.subtitle,
  });

  final String dateKey;
  final String title;
  final String? subtitle;
  final List<ArenaManagerBooking> bookings;
}
