import 'package:flutter/foundation.dart';

enum OrganizerTournamentListingBadge {
  registrationsOpen,
  registrationsClosed,
  draft,
  cancelled,
}

enum OrganizerCategoryBracketStatus { none, draft, published }

enum OrganizerTournamentDetailTab { categories, overview, financial, matches }

@immutable
class OrganizerTournamentSummary {
  const OrganizerTournamentSummary({
    required this.tournamentId,
    required this.name,
    this.locationName = '',
    this.city = '',
    this.state = '',
    this.dateLabel = '',
    this.listingStatus = 'open',
    this.leagueStageOrder,
    this.isLeagueStage = false,
    this.enrolledCount = 0,
    this.pendingCount = 0,
    this.categoryCount = 0,
    this.collectedCents = 0,
    this.defaultEntryFeeCents = 0,
    this.registrationOpensAt,
    this.registrationClosesAt,
    this.courtsCount = 4,
    this.bracketSystem = '',
  });

  final String tournamentId;
  final String name;
  final String locationName;
  final String city;
  final String state;
  final String dateLabel;
  final String listingStatus;
  final int? leagueStageOrder;
  final bool isLeagueStage;
  final int enrolledCount;
  final int pendingCount;
  final int categoryCount;
  final int collectedCents;
  final int defaultEntryFeeCents;
  final DateTime? registrationOpensAt;
  final DateTime? registrationClosesAt;
  final int courtsCount;
  final String bracketSystem;
}

@immutable
class OrganizerTournamentCategorySummary {
  const OrganizerTournamentCategorySummary({
    required this.categoryId,
    required this.name,
    this.genderLabel = '',
    this.disputeLabel = 'Dupla',
    this.levelLabel = 'Open',
    this.bracketFormat = '',
    this.maxTeams = 16,
    this.enrolledCount = 0,
    this.paidCount = 0,
    this.pendingCount = 0,
    this.collectedCents = 0,
    this.entryFeeCents = 0,
    this.registrationClosed = false,
    this.bracketStatus = OrganizerCategoryBracketStatus.none,
    this.prizeTotalCents = 0,
  });

  final String categoryId;
  final String name;
  final String genderLabel;
  final String disputeLabel;
  final String levelLabel;
  final String bracketFormat;
  final int maxTeams;
  final int enrolledCount;
  final int paidCount;
  final int pendingCount;
  final int collectedCents;
  final int entryFeeCents;
  final bool registrationClosed;
  final OrganizerCategoryBracketStatus bracketStatus;
  final int prizeTotalCents;

  /// Lotado quando vagas confirmadas (pagas, fora da waitlist) atingem o máximo.
  bool get isFull => maxTeams > 0 && paidCount >= maxTeams;

  double get fillRatio =>
      maxTeams > 0 ? (paidCount / maxTeams).clamp(0.0, 1.0) : 0.0;

  bool get readyToGenerateBracket =>
      isFull && bracketStatus != OrganizerCategoryBracketStatus.published;
}
