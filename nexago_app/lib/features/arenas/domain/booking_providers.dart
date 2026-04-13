import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/booking_service.dart';
import 'arenas_providers.dart';

final bookingServiceProvider = Provider<BookingService>((ref) {
  return BookingService(ref.watch(firestoreProvider));
});
