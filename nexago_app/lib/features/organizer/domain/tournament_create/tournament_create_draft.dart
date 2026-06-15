import 'package:flutter/foundation.dart';

enum TournamentSport { beachVolleyball, indoorVolleyball, footvolley }

enum TournamentBracketSystem {
  groupsThenKnockout,
  singleElimination,
  roundRobin,
  groupsWithRepechage,
  doubleElimination,
}

enum TournamentBestOf { singleSet, bestOf3, bestOf5 }

enum TournamentPaymentMode { appPixCard, directWithOrganizer }

enum TournamentVisibility { publicListing, linkOnly }

enum TournamentCategoryGender { male, female, mixed }

enum TournamentCategoryDispute { individual, dupla, team }

enum TournamentAgeBand { open, sub19, sub23, plus30, plus35, plus40 }

enum TournamentSkillLevel { beginner, intermediate, advanced, open }

/// Prêmio de uma colocação dentro de uma categoria.
@immutable
class TournamentCategoryPrizeDraft {
  const TournamentCategoryPrizeDraft({
    required this.position,
    required this.valueCents,
    this.label,
  });

  final String position;
  final int valueCents;
  final String? label;

  TournamentCategoryPrizeDraft copyWith({
    String? position,
    int? valueCents,
    String? label,
  }) {
    return TournamentCategoryPrizeDraft(
      position: position ?? this.position,
      valueCents: valueCents ?? this.valueCents,
      label: label ?? this.label,
    );
  }
}

/// Categoria configurada no wizard (B3 / B3.1).
@immutable
class TournamentCategoryDraft {
  const TournamentCategoryDraft({
    required this.id,
    this.name = '',
    this.gender = TournamentCategoryGender.male,
    this.dispute = TournamentCategoryDispute.dupla,
    this.ageBand = TournamentAgeBand.open,
    this.skillLevel = TournamentSkillLevel.open,
    this.spots = 16,
    this.useDefaultPrice = true,
    this.priceCents = 18000,
    this.customFormatEnabled = false,
    this.bracketSystem,
    this.maxRegistrationsPerAthlete = 2,
    this.prizes = const [],
  });

  final String id;
  final String name;
  final TournamentCategoryGender gender;
  final TournamentCategoryDispute dispute;
  final TournamentAgeBand ageBand;
  final TournamentSkillLevel skillLevel;
  final int spots;
  final bool useDefaultPrice;
  final int priceCents;
  final bool customFormatEnabled;
  final TournamentBracketSystem? bracketSystem;
  final int maxRegistrationsPerAthlete;
  final List<TournamentCategoryPrizeDraft> prizes;

  TournamentCategoryDraft copyWith({
    String? id,
    String? name,
    TournamentCategoryGender? gender,
    TournamentCategoryDispute? dispute,
    TournamentAgeBand? ageBand,
    TournamentSkillLevel? skillLevel,
    int? spots,
    bool? useDefaultPrice,
    int? priceCents,
    bool? customFormatEnabled,
    TournamentBracketSystem? bracketSystem,
    bool clearCustomBracketSystem = false,
    int? maxRegistrationsPerAthlete,
    List<TournamentCategoryPrizeDraft>? prizes,
  }) {
    return TournamentCategoryDraft(
      id: id ?? this.id,
      name: name ?? this.name,
      gender: gender ?? this.gender,
      dispute: dispute ?? this.dispute,
      ageBand: ageBand ?? this.ageBand,
      skillLevel: skillLevel ?? this.skillLevel,
      spots: spots ?? this.spots,
      useDefaultPrice: useDefaultPrice ?? this.useDefaultPrice,
      priceCents: priceCents ?? this.priceCents,
      customFormatEnabled: customFormatEnabled ?? this.customFormatEnabled,
      bracketSystem: clearCustomBracketSystem
          ? null
          : (bracketSystem ?? this.bracketSystem),
      maxRegistrationsPerAthlete:
          maxRegistrationsPerAthlete ?? this.maxRegistrationsPerAthlete,
      prizes: prizes ?? this.prizes,
    );
  }
}

/// Estado completo do wizard de criação de torneio (8 passos).
@immutable
class TournamentCreateDraft {
  const TournamentCreateDraft({
    this.tournamentId,
    this.sport = TournamentSport.beachVolleyball,
    this.name = '',
    this.coverImagePath,
    this.description = '',
    this.arenaId,
    this.locationName = '',
    this.locationAddress = '',
    this.city = '',
    this.state = '',
    this.startAt,
    this.endAt,
    this.firstMatchAt,
    this.courtsCount = 4,
    this.categories = const [],
    this.defaultPriceCents = 18000,
    this.bracketSystem = TournamentBracketSystem.groupsThenKnockout,
    this.teamsPerGroup = 4,
    this.qualifiersPerGroup = 2,
    this.bestOf = TournamentBestOf.bestOf3,
    this.finalBestOf5 = true,
    this.registrationOpensAt,
    this.registrationClosesAt,
    this.paymentMode = TournamentPaymentMode.appPixCard,
    this.waitlistEnabled = true,
    this.inviteConfirmEnabled = false,
    this.cashPrizesEnabled = true,
    this.regulationPdfPath,
    this.regulationNotes = '',
    this.uniformRequired = true,
    this.uniformNumberOnShirt = true,
    this.uniformNameOnShirt = true,
    this.rankingEnabled = true,
    this.rankingTableId = 'nexago_standalone',
    this.visibility = TournamentVisibility.publicListing,
  });

  final String? tournamentId;
  final TournamentSport sport;
  final String name;
  final String? coverImagePath;
  final String description;
  final String? arenaId;
  final String locationName;
  final String locationAddress;
  final String city;
  final String state;
  final DateTime? startAt;
  final DateTime? endAt;
  final DateTime? firstMatchAt;
  final int courtsCount;
  final List<TournamentCategoryDraft> categories;
  final int defaultPriceCents;
  final TournamentBracketSystem bracketSystem;
  final int teamsPerGroup;
  final int qualifiersPerGroup;
  final TournamentBestOf bestOf;
  final bool finalBestOf5;
  final DateTime? registrationOpensAt;
  final DateTime? registrationClosesAt;
  final TournamentPaymentMode paymentMode;
  final bool waitlistEnabled;
  final bool inviteConfirmEnabled;
  final bool cashPrizesEnabled;
  final String? regulationPdfPath;
  final String regulationNotes;
  final bool uniformRequired;
  final bool uniformNumberOnShirt;
  final bool uniformNameOnShirt;
  final bool rankingEnabled;
  final String rankingTableId;
  final TournamentVisibility visibility;

  int get totalSpots => categories.fold<int>(0, (sum, c) => sum + c.spots);

  int get totalPrizeCents => categories.fold<int>(
    0,
    (sum, c) => sum + c.prizes.fold<int>(0, (pSum, p) => pSum + p.valueCents),
  );

  TournamentCreateDraft copyWith({
    String? tournamentId,
    bool clearTournamentId = false,
    TournamentSport? sport,
    String? name,
    String? coverImagePath,
    bool clearCoverImagePath = false,
    String? description,
    String? arenaId,
    bool clearArenaId = false,
    String? locationName,
    String? locationAddress,
    String? city,
    String? state,
    DateTime? startAt,
    DateTime? endAt,
    DateTime? firstMatchAt,
    int? courtsCount,
    List<TournamentCategoryDraft>? categories,
    int? defaultPriceCents,
    TournamentBracketSystem? bracketSystem,
    int? teamsPerGroup,
    int? qualifiersPerGroup,
    TournamentBestOf? bestOf,
    bool? finalBestOf5,
    DateTime? registrationOpensAt,
    DateTime? registrationClosesAt,
    TournamentPaymentMode? paymentMode,
    bool? waitlistEnabled,
    bool? inviteConfirmEnabled,
    bool? cashPrizesEnabled,
    String? regulationPdfPath,
    bool clearRegulationPdfPath = false,
    String? regulationNotes,
    bool? uniformRequired,
    bool? uniformNumberOnShirt,
    bool? uniformNameOnShirt,
    bool? rankingEnabled,
    String? rankingTableId,
    TournamentVisibility? visibility,
  }) {
    return TournamentCreateDraft(
      tournamentId:
          clearTournamentId ? null : (tournamentId ?? this.tournamentId),
      sport: sport ?? this.sport,
      name: name ?? this.name,
      coverImagePath: clearCoverImagePath
          ? null
          : (coverImagePath ?? this.coverImagePath),
      description: description ?? this.description,
      arenaId: clearArenaId ? null : (arenaId ?? this.arenaId),
      locationName: locationName ?? this.locationName,
      locationAddress: locationAddress ?? this.locationAddress,
      city: city ?? this.city,
      state: state ?? this.state,
      startAt: startAt ?? this.startAt,
      endAt: endAt ?? this.endAt,
      firstMatchAt: firstMatchAt ?? this.firstMatchAt,
      courtsCount: courtsCount ?? this.courtsCount,
      categories: categories ?? this.categories,
      defaultPriceCents: defaultPriceCents ?? this.defaultPriceCents,
      bracketSystem: bracketSystem ?? this.bracketSystem,
      teamsPerGroup: teamsPerGroup ?? this.teamsPerGroup,
      qualifiersPerGroup: qualifiersPerGroup ?? this.qualifiersPerGroup,
      bestOf: bestOf ?? this.bestOf,
      finalBestOf5: finalBestOf5 ?? this.finalBestOf5,
      registrationOpensAt: registrationOpensAt ?? this.registrationOpensAt,
      registrationClosesAt: registrationClosesAt ?? this.registrationClosesAt,
      paymentMode: paymentMode ?? this.paymentMode,
      waitlistEnabled: waitlistEnabled ?? this.waitlistEnabled,
      inviteConfirmEnabled: inviteConfirmEnabled ?? this.inviteConfirmEnabled,
      cashPrizesEnabled: cashPrizesEnabled ?? this.cashPrizesEnabled,
      regulationPdfPath: clearRegulationPdfPath
          ? null
          : (regulationPdfPath ?? this.regulationPdfPath),
      regulationNotes: regulationNotes ?? this.regulationNotes,
      uniformRequired: uniformRequired ?? this.uniformRequired,
      uniformNumberOnShirt: uniformNumberOnShirt ?? this.uniformNumberOnShirt,
      uniformNameOnShirt: uniformNameOnShirt ?? this.uniformNameOnShirt,
      rankingEnabled: rankingEnabled ?? this.rankingEnabled,
      rankingTableId: rankingTableId ?? this.rankingTableId,
      visibility: visibility ?? this.visibility,
    );
  }
}

enum TournamentCreateStep {
  identity,
  location,
  categories,
  format,
  registration,
  prizes,
  rules,
  review,
}

extension TournamentCreateStepX on TournamentCreateStep {
  int get index => TournamentCreateStep.values.indexOf(this);
  int get number => index + 1;
  static const total = 8;
}
