import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/booking_invite_service.dart';
import 'booking_invite_model.dart';

/// Armazena o ID de um convite recebido via deep link enquanto o usuário
/// ainda não está autenticado. Após login, o router lê este valor e redireciona.
final pendingInviteIdProvider = StateProvider<String?>((ref) => null);

final bookingInviteServiceProvider = Provider<BookingInviteService>((ref) {
  return BookingInviteService(ref.watch(firestoreProvider));
});

final bookingInviteProvider =
    FutureProvider.family<BookingInvite?, String>((ref, inviteId) async {
  return ref.read(bookingInviteServiceProvider).fetchInvite(inviteId);
});
