/// Estado passado para a tela de pagamento PIX da inscrição em torneio.
class TournamentRegistrationPixArgs {
  const TournamentRegistrationPixArgs({
    required this.registrationId,
    required this.tournamentId,
    required this.tournamentName,
    required this.categoryName,
    required this.shareAmountReais,
    this.amountType = 'share',
    this.paymentExpiresAt,
    this.holdExpiresAt,
    this.holdMinutes = 30,
  });

  final String registrationId;
  final String tournamentId;
  final String tournamentName;
  final String categoryName;
  final double shareAmountReais;

  /// 'share' (parcela do atleta) ou 'full' (paga a dupla inteira).
  final String amountType;
  final DateTime? paymentExpiresAt;

  /// Prazo absoluto da vaga reservada — mesmo relógio da tela de pagamento.
  final DateTime? holdExpiresAt;

  /// Minutos configurados no torneio — janela fixa do countdown da vaga.
  final int holdMinutes;
}
