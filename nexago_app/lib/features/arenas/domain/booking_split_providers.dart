import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../data/booking_split_repository.dart';
import 'arenas_providers.dart';
import 'booking_split.dart';

final bookingSplitRepositoryProvider = Provider<BookingSplitRepository>((ref) {
  return BookingSplitRepository(firestore: ref.watch(firestoreProvider));
});

/// Fatias ao vivo de `arenaBookings/{bookingId}/paymentShares` — quem já pagou.
final bookingPaymentSharesProvider = StreamProvider.autoDispose
    .family<List<BookingPaymentShare>, String>((ref, bookingId) {
  return ref.watch(bookingSplitRepositoryProvider).watchShares(bookingId);
});
