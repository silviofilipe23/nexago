import 'booking_result.dart';
import 'booking_result_record.dart';

/// Placar do pós-jogo no backend. Gravação só pelas callables (a rule de
/// `bookingResults` fecha a escrita do cliente).
abstract class BookingResultRepository {
  /// Placares em que [uid] está com conta, ao vivo. Escuta por query, não por
  /// `doc()`: o placar de uma reserva ainda nasce depois que a tela abre, e o
  /// `get` de doc inexistente é negado pela rule (o listener morreria).
  Stream<List<SavedBookingResult>> watchMine(String uid);

  /// "Salvar placar": cria ou corrige o placar da reserva [bookingId].
  Future<void> save(String bookingId, BookingResult result);

  /// Uma pelada pelo id, ao vivo — para quem está nela ou, confirmada, para
  /// qualquer atleta (link, perfil público). `null` sem doc ou sem acesso.
  Stream<SavedBookingResult?> watchOne(String bookingId);

  /// As peladas CONFIRMADAS de outro atleta (perfil público), ao vivo.
  Stream<List<SavedBookingResult>> watchConfirmedOf(String userId);

  /// Quem está no placar confirma (`confirm: true`) ou contesta a [version]
  /// que viu; contestar exige [reason].
  Future<void> respond(
    String bookingId, {
    required bool confirm,
    required int version,
    String? reason,
  });
}

class BookingResultException implements Exception {
  const BookingResultException(this.message);

  final String message;

  @override
  String toString() => message;
}
