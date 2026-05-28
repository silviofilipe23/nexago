class TournamentRegistrationSuccessArgs {
  const TournamentRegistrationSuccessArgs({
    required this.tournamentId,
    required this.registrationId,
    required this.tournamentName,
    required this.categoryName,
  });

  final String tournamentId;
  final String registrationId;
  final String tournamentName;
  final String categoryName;
}

