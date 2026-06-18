/// Nomes de eventos de funil e construção de parâmetros — a parte pura e
/// testável do analytics (o serviço é só a cola sobre o FirebaseAnalytics).
abstract final class AnalyticsEvents {
  AnalyticsEvents._();

  static const onboardingComplete = 'onboarding_complete';
  static const tournamentRegistrationStart = 'tournament_registration_start';
  static const tournamentRegistrationPaymentInitiated =
      'tournament_registration_payment_initiated';
  static const tournamentRegistrationConfirmed =
      'tournament_registration_confirmed';
}

/// Monta os parâmetros de um evento de inscrição, descartando campos vazios
/// (o FirebaseAnalytics rejeita valores nulos e chaves sem valor útil).
Map<String, Object> tournamentRegistrationParams({
  required String tournamentId,
  required String categoryId,
  String? amountType,
}) {
  return {
    if (tournamentId.trim().isNotEmpty) 'tournament_id': tournamentId.trim(),
    if (categoryId.trim().isNotEmpty) 'category_id': categoryId.trim(),
    if (amountType != null && amountType.trim().isNotEmpty)
      'amount_type': amountType.trim(),
  };
}
