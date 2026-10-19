import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:nexago_app/core/auth/auth_providers.dart';
import 'package:nexago_app/core/firebase/firebase_providers.dart';
import '../data/booking_invite_service.dart';
import 'booking_invite_model.dart';

/// Armazena o ID de um convite recebido via deep link enquanto o usuário
/// ainda não está autenticado. Após login, o router lê este valor e redireciona.
final pendingInviteIdProvider = StateProvider<String?>((ref) => null);

final bookingInviteServiceProvider = Provider<BookingInviteService>((ref) {
  return BookingInviteService(ref.watch(firestoreProvider));
});

/// Doc do convite em tempo real (a tela reage ao aceite/cancelamento).
final bookingInviteStreamProvider = StreamProvider.autoDispose
    .family<BookingInvite?, String>((ref, inviteId) {
  return ref.watch(bookingInviteServiceProvider).watchInvite(inviteId);
});

/// Convites de uma reserva (visão do dono).
final bookingInvitesForBookingProvider = StreamProvider.autoDispose
    .family<List<BookingInvite>, String>((ref, bookingId) {
  return ref
      .watch(bookingInviteServiceProvider)
      .watchInvitesForBooking(bookingId);
});

/// Convites para jogar recebidos e ainda sem resposta (mais novo primeiro).
final pendingBookingInvitesProvider =
    StreamProvider.autoDispose<List<BookingInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid;
  if (uid == null || uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(bookingInviteServiceProvider)
      .watchPendingInvitesFor(uid)
      .map(liveReceivedBookingInvites);
});

/// Recebidos que ainda valem: pendentes, não vencidos, do mais novo ao mais
/// antigo.
List<BookingInvite> liveReceivedBookingInvites(
  List<BookingInvite> invites, {
  DateTime? now,
}) {
  final clock = now ?? DateTime.now();
  final live = invites
      .where((i) => i.isPending && !i.isShareLink && clock.isBefore(i.expiresAt))
      .toList()
    ..sort((a, b) => b.createdAt.compareTo(a.createdAt));
  return live;
}
