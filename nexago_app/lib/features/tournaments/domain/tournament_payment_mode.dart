/// Modo de pagamento da inscrição (`tournaments.paymentMode` no Firestore).
enum TournamentPaymentMode {
  appPixCard,
  directWithOrganizer,
}

TournamentPaymentMode parseTournamentPaymentMode(String? raw) {
  final value = raw?.trim();
  if (value == TournamentPaymentMode.directWithOrganizer.name) {
    return TournamentPaymentMode.directWithOrganizer;
  }
  return TournamentPaymentMode.appPixCard;
}
