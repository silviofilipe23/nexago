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
    this.weatherCreditAppliedReais = 0,
  });

  final String bookingId;
  final ArenaBookingConfirmArgs confirmArgs;
  final double amountToPayNowReais;
  final double amountDueOnsiteReais;
  final double paymentFraction;
  final DateTime? paymentExpiresAt;

  /// Crédito de chuva já descontado na criação. Com crédito o servidor cobra
  /// o resto INTEGRAL (metade de um resto pequeno cairia abaixo do mínimo do
  /// Pix): a tela não oferece o sinal de 50%.
  final double weatherCreditAppliedReais;
}
