import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../../../core/firebase/firebase_providers.dart';
import '../data/firebase_booking_result_repository.dart';
import 'booking_result_record.dart';
import 'booking_result_repository.dart';

final bookingResultRepositoryProvider = Provider<BookingResultRepository>(
  (ref) => FirebaseBookingResultRepository(ref.watch(firestoreProvider)),
);

/// Uid de quem está logado (vazio sem sessão) — separado para os testes.
final bookingResultUidProvider = Provider<String>(
  (ref) => ref.watch(authProvider).valueOrNull?.uid ?? '',
);

/// Placares em que o atleta logado está com conta (lançados por ele ou para
/// ele confirmar), ao vivo.
final myBookingResultsProvider =
    StreamProvider.autoDispose<List<SavedBookingResult>>((ref) {
  final uid = ref.watch(bookingResultUidProvider);
  return ref.watch(bookingResultRepositoryProvider).watchMine(uid);
});

/// O placar salvo da reserva, se o atleta está nele. `null` enquanto carrega
/// ou sem placar.
final savedBookingResultProvider =
    Provider.autoDispose.family<SavedBookingResult?, String>((ref, bookingId) {
  final all = ref.watch(myBookingResultsProvider).valueOrNull ?? const [];
  for (final r in all) {
    if (r.bookingId == bookingId) return r;
  }
  return null;
});

/// Já carregou a lista (para não mostrar o placar inicial e trocar depois).
final myBookingResultsLoadedProvider = Provider.autoDispose<bool>(
  (ref) => ref.watch(myBookingResultsProvider).hasValue,
);

/// Uma pelada pelo id (detalhe 10c), ao vivo. `null` sem doc ou sem acesso.
final peladaProvider = StreamProvider.autoDispose
    .family<SavedBookingResult?, String>((ref, bookingId) {
      return ref.watch(bookingResultRepositoryProvider).watchOne(bookingId);
    });

/// As peladas confirmadas de outro atleta (perfil público, 10b de terceiros).
final userConfirmedPeladasProvider = StreamProvider.autoDispose
    .family<List<SavedBookingResult>, String>((ref, userId) {
      return ref
          .watch(bookingResultRepositoryProvider)
          .watchConfirmedOf(userId);
    });
