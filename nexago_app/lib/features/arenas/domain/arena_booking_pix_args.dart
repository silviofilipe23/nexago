import 'arena_booking_confirm_args.dart';

/// Estado passado para a tela de pagamento PIX após criar a reserva.
class ArenaBookingPixArgs {
  const ArenaBookingPixArgs({
    required this.bookingId,
    required this.confirmArgs,
    required this.amountToPayNowReais,
    required this.amountDueOnsiteReais,
    required this.paymentFraction,
    this.paymentExpiresAt,
  });

  final String bookingId;
  final ArenaBookingConfirmArgs confirmArgs;
  final double amountToPayNowReais;
  final double amountDueOnsiteReais;
  final double paymentFraction;
  final DateTime? paymentExpiresAt;
}
