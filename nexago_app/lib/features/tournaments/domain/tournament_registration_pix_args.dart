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
    this.ownShareReais,
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

  /// Parcela do PRÓPRIO atleta (o desconto de embaixador dele incide só nela,
  /// mesmo pagando a dupla/equipe inteira). `null` = [shareAmountReais] no
  /// `share`; no `full`, a tela estima pelo tamanho do elenco.
  final double? ownShareReais;
}
