class TournamentRegistrationSuccessArgs {
  const TournamentRegistrationSuccessArgs({
    required this.tournamentId,
    required this.registrationId,
    required this.tournamentName,
    required this.categoryName,
    this.paymentId,
  });

  final String tournamentId;
  final String registrationId;
  final String tournamentName;
  final String categoryName;

  /// Pagamento do Asaas que acabou de confirmar (= id do lote de cashback).
  /// Só vem do PIX pago nesta sessão; reabrir o card não traz.
  final String? paymentId;
}

