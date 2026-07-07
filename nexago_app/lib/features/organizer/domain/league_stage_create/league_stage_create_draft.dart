import 'package:flutter/foundation.dart';

import '../league_create/league_create_draft.dart';
import '../tournament_create/tournament_create_draft.dart';

enum LeagueStageCreateStep { location, categoriesRegistration, review }

extension LeagueStageCreateStepX on LeagueStageCreateStep {
  int get index => LeagueStageCreateStep.values.indexOf(this);
  int get number => index + 1;
  static const total = 3;
}

/// Categoria herdada da liga com overrides por etapa (D2).
@immutable
class LeagueStageCategoryDraft {
  const LeagueStageCategoryDraft({
    required this.categoryId,
    required this.name,
    this.enabled = true,
    this.spots = 16,
    this.gender = TournamentCategoryGender.male,
    this.dispute = TournamentCategoryDispute.dupla,
    this.ageBand = TournamentAgeBand.open,
    this.skillLevel = TournamentSkillLevel.open,
    this.priceCents = 22000,
    this.bracketSystem = TournamentBracketSystem.groupsThenKnockout,
    this.teamsPerGroup = 4,
    this.qualifiersPerGroup = 2,
    this.bestOf = TournamentBestOf.bestOf3,
    this.finalBestOf5 = true,
  });

  final String categoryId;
  final String name;
  final bool enabled;
  final int spots;
  final TournamentCategoryGender gender;
  final TournamentCategoryDispute dispute;
  final TournamentAgeBand ageBand;
  final TournamentSkillLevel skillLevel;
  final int priceCents;
  final TournamentBracketSystem bracketSystem;
  final int teamsPerGroup;
  final int qualifiersPerGroup;
  final TournamentBestOf bestOf;
  final bool finalBestOf5;

  LeagueStageCategoryDraft copyWith({
    String? categoryId,
    String? name,
    bool? enabled,
    int? spots,
    TournamentCategoryGender? gender,
    TournamentCategoryDispute? dispute,
    TournamentAgeBand? ageBand,
    TournamentSkillLevel? skillLevel,
    int? priceCents,
    TournamentBracketSystem? bracketSystem,
    int? teamsPerGroup,
    int? qualifiersPerGroup,
    TournamentBestOf? bestOf,
    bool? finalBestOf5,
  }) {
    return LeagueStageCategoryDraft(
      categoryId: categoryId ?? this.categoryId,
      name: name ?? this.name,
      enabled: enabled ?? this.enabled,
      spots: spots ?? this.spots,
      gender: gender ?? this.gender,
      dispute: dispute ?? this.dispute,
      ageBand: ageBand ?? this.ageBand,
      skillLevel: skillLevel ?? this.skillLevel,
      priceCents: priceCents ?? this.priceCents,
      bracketSystem: bracketSystem ?? this.bracketSystem,
      teamsPerGroup: teamsPerGroup ?? this.teamsPerGroup,
      qualifiersPerGroup: qualifiersPerGroup ?? this.qualifiersPerGroup,
      bestOf: bestOf ?? this.bestOf,
      finalBestOf5: finalBestOf5 ?? this.finalBestOf5,
    );
  }
}

/// Estado do wizard de adicionar etapa (3 passos).
@immutable
class LeagueStageCreateDraft {
  const LeagueStageCreateDraft({
    this.leagueId = '',
    this.leagueName = '',
    this.plannedStagesCount = 6,
    this.sport = TournamentSport.beachVolleyball,
    this.leagueCity = '',
    this.leagueState = '',
    this.defaultPriceCents = 22000,
    this.rankingTableId = 'state_circuit',
    this.paymentMode = TournamentPaymentMode.appPixCard,
    this.stage = const LeagueStageDraft(id: 'stage-1', order: 1),
    this.categories = const [],
    this.courtsCount = 4,
    this.arenaId,
    this.locationAddress = '',
    this.registrationOpensAt,
    this.registrationClosesAt,
    this.existingStages = const [],
  });

  final String leagueId;
  final String leagueName;
  final int plannedStagesCount;
  final TournamentSport sport;
  final String leagueCity;
  final String leagueState;
  final int defaultPriceCents;
  final String rankingTableId;
  final TournamentPaymentMode paymentMode;
  final LeagueStageDraft stage;
  final List<LeagueStageCategoryDraft> categories;
  final int courtsCount;
  final String? arenaId;
  final String locationAddress;
  final DateTime? registrationOpensAt;
  final DateTime? registrationClosesAt;
  final List<LeagueStageDraft> existingStages;

  int get enabledCategoriesCount => categories.where((c) => c.enabled).length;

  int get totalEnabledSpots => categories
      .where((c) => c.enabled)
      .fold<int>(0, (sum, c) => sum + c.spots);

  LeagueStageCreateDraft copyWith({
    String? leagueId,
    String? leagueName,
    int? plannedStagesCount,
    TournamentSport? sport,
    String? leagueCity,
    String? leagueState,
    int? defaultPriceCents,
    String? rankingTableId,
    TournamentPaymentMode? paymentMode,
    LeagueStageDraft? stage,
    List<LeagueStageCategoryDraft>? categories,
    int? courtsCount,
    String? arenaId,
    bool clearArenaId = false,
    String? locationAddress,
    DateTime? registrationOpensAt,
    DateTime? registrationClosesAt,
    List<LeagueStageDraft>? existingStages,
  }) {
    return LeagueStageCreateDraft(
      leagueId: leagueId ?? this.leagueId,
      leagueName: leagueName ?? this.leagueName,
      plannedStagesCount: plannedStagesCount ?? this.plannedStagesCount,
      sport: sport ?? this.sport,
      leagueCity: leagueCity ?? this.leagueCity,
      leagueState: leagueState ?? this.leagueState,
      defaultPriceCents: defaultPriceCents ?? this.defaultPriceCents,
      rankingTableId: rankingTableId ?? this.rankingTableId,
      paymentMode: paymentMode ?? this.paymentMode,
      stage: stage ?? this.stage,
      categories: categories ?? this.categories,
      courtsCount: courtsCount ?? this.courtsCount,
      arenaId: clearArenaId ? null : (arenaId ?? this.arenaId),
      locationAddress: locationAddress ?? this.locationAddress,
      registrationOpensAt: registrationOpensAt ?? this.registrationOpensAt,
      registrationClosesAt: registrationClosesAt ?? this.registrationClosesAt,
      existingStages: existingStages ?? this.existingStages,
    );
  }
}
