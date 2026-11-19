/// Como o atleta pagou a última reserva de quadra: lembrada para a próxima
/// abrir já marcada (N1 da tela de confirmar reserva).
enum BookingPaymentMethod {
  /// Paga presencialmente, na chegada.
  onsite('onsite'),

  /// Pix ou cartão pelo app.
  online('online');

  const BookingPaymentMethod(this.storageValue);

  final String storageValue;

  static BookingPaymentMethod? fromStorage(String? raw) {
    for (final m in values) {
      if (m.storageValue == raw) return m;
    }
    return null;
  }
}
