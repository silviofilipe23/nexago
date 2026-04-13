import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import 'booking_providers.dart';
import 'my_booking_item.dart';

/// Reservas do usuário atual em [arenaBookings] (via [BookingService.watchMyBookings], snapshots).
final myBookingsStreamProvider =
    StreamProvider.autoDispose<List<MyBookingItem>>((ref) {
  final user = ref.watch(authProvider).valueOrNull;
  if (user == null) {
    return Stream.value(const []);
  }
  return ref.watch(bookingServiceProvider).watchMyBookings(user.uid);
});
