/// Check-in da reserva pelo QR da quadra (`docs/product/reservas-por-capacidade.md`, PR 4c).
/// Espelha `functions/src/arena-booking-qr-checkin.ts`. Puro — a tela e os testes usam direto.
library;

/// O check-in pelo QR abre 20 min antes do início e vai até o fim do horário.
const Duration kBookingQrOpensBefore = Duration(minutes: 20);

enum BookingCourtQrStage {
  /// Reserva comum, de convidado, cancelada, encerrada ou com falta: sem card.
  hidden,

  /// Ainda cedo: o card explica o que fazer na chegada, sem botão.
  early,

  /// Pode ler o QR.
  open,

  /// Check-in feito — mostra a quadra.
  done,
}

class BookingCourtQrState {
  const BookingCourtQrState(this.stage, {this.courtName});

  final BookingCourtQrStage stage;

  /// Quadra da reserva depois do check-in.
  final String? courtName;
}

String _str(Object? v) => v is String ? v.trim() : '';

/// Reserva de arena que define a quadra (tem `allocationStatus`, mesmo depois de definida).
bool isCapacityBooking(Map<String, dynamic>? data) =>
    _str(data?['allocationStatus']).isNotEmpty;

BookingCourtQrState bookingCourtQrState(
  Map<String, dynamic>? data, {
  required DateTime startAt,
  required DateTime endAt,
  required DateTime now,
}) {
  const hidden = BookingCourtQrState(BookingCourtQrStage.hidden);
  if (data == null || !isCapacityBooking(data)) return hidden;
  if (data['isClassSession'] == true || _str(data['classSessionId']).isNotEmpty) {
    return hidden;
  }
  final status = _str(data['status']).toLowerCase();
  if (status != 'active' && status != 'confirmed' && status != 'pending_payment') {
    return hidden;
  }
  final attendance = _str(data['attendanceStatus']).toLowerCase();
  if (attendance == 'checked_in') {
    final court = _str(data['courtName']);
    return BookingCourtQrState(
      BookingCourtQrStage.done,
      courtName: court.isEmpty ? 'Quadra' : court,
    );
  }
  if (attendance == 'no_show' || !now.isBefore(endAt)) return hidden;
  if (now.isBefore(startAt.subtract(kBookingQrOpensBefore))) {
    return const BookingCourtQrState(BookingCourtQrStage.early);
  }
  return const BookingCourtQrState(BookingCourtQrStage.open);
}
