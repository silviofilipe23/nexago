import 'package:flutter/foundation.dart';

import '../tournament_create/tournament_create_draft.dart';

enum LeagueCreateStep { identity, season, categories, ranking, stages, review }

extension LeagueCreateStepX on LeagueCreateStep {
  int get index => LeagueCreateStep.values.indexOf(this);
  int get number => index + 1;
  static const total = 6;
}

enum LeagueStageStatus { defined, pending }

enum LeagueCountingStagesMode { best4Of6, best3Of5, allStages }

/// Etapa da temporada (C5).
@immutable
class LeagueStageDraft {
  const LeagueStageDraft({
    required this.id,
    this.name = '',
    required this.order,
    this.status = LeagueStageStatus.pending,
    this.isGrandFinal = false,
    this.locationName = '',
    this.city = '',
    this.state = '',
    this.startAt,
    this.endAt,
    this.dateLabel = '',
    this.tournamentIds = const [],
  });

  final String id;
  final String name;
  final int order;
  final LeagueStageStatus status;
  final bool isGrandFinal;
  final String locationName;
  final String city;
  final String state;
  final DateTime? startAt;
  final DateTime? endAt;
  final String dateLabel;
  final List<String> tournamentIds;

  bool get isDefined => status == LeagueStageStatus.defined;

  LeagueStageDraft copyWith({
    String? id,
    String? name,
    int? order,
    LeagueStageStatus? status,
    bool? isGrandFinal,
    String? locationName,
    String? city,
    String? state,
    DateTime? startAt,
    DateTime? endAt,
    String? dateLabel,
    List<String>? tournamentIds,
  }) {
    return LeagueStageDraft(
      id: id ?? this.id,
      name: name ?? this.name,
      order: order ?? this.order,
      status: status ?? this.status,
      isGrandFinal: isGrandFinal ?? this.isGrandFinal,
      locationName: locationName ?? this.locationName,
      city: city ?? this.city,
      state: state ?? this.state,
      startAt: startAt ?? this.startAt,
      endAt: endAt ?? this.endAt,
      dateLabel: dateLabel ?? this.dateLabel,
      tournamentIds: tournamentIds ?? this.tournamentIds,
    );
  }
}

/// Estado completo do wizard de criação de liga (6 passos).
@immutable
class LeagueCreateDraft {
  const LeagueCreateDraft({
    this.leagueId,
    this.sport = TournamentSport.beachVolleyball,
    this.name = '',
    this.organizationName = '',
    this.coverImagePath,
    this.description = '',
    this.city = '',
    this.state = '',
    this.seasonStartAt,
    this.seasonEndAt,
    this.plannedStagesCount = 6,
    this.grandFinalEnabled = true,
    this.categories = const [],
    this.defaultPriceCents = 22000,
    this.countingStagesMode = LeagueCountingStagesMode.best4Of6,
    this.rankingTableId = 'state_circuit',
    this.rankingPointsByPlace = const {},
    this.grandFinalSpots = 16,
    this.wildcardEnabled = false,
    this.wildcardSpots = 2,
    this.stages = const [],
  });

  final String? leagueId;
  final TournamentSport sport;
  final String name;
  final String organizationName;
  final String? coverImagePath;
  final String description;
  final String city;
  final String state;
  final DateTime? seasonStartAt;
  final DateTime? seasonEndAt;
  final int plannedStagesCount;
  final bool grandFinalEnabled;
  final List<TournamentCategoryDraft> categories;
  final int defaultPriceCents;
  final LeagueCountingStagesMode countingStagesMode;
  final String rankingTableId;
  final Map<String, int> rankingPointsByPlace;
  final int grandFinalSpots;
  final bool wildcardEnabled;
  final int wildcardSpots;
  final List<LeagueStageDraft> stages;

  int get definedStagesCount =>
      stages.where((s) => s.status == LeagueStageStatus.defined).length;

  LeagueCreateDraft copyWith({
    String? leagueId,
    bool clearLeagueId = false,
    TournamentSport? sport,
    String? name,
    String? organizationName,
    String? coverImagePath,
    bool clearCoverImagePath = false,
    String? description,
    String? city,
    String? state,
    DateTime? seasonStartAt,
    DateTime? seasonEndAt,
    int? plannedStagesCount,
    bool? grandFinalEnabled,
    List<TournamentCategoryDraft>? categories,
    int? defaultPriceCents,
    LeagueCountingStagesMode? countingStagesMode,
    String? rankingTableId,
    Map<String, int>? rankingPointsByPlace,
    int? grandFinalSpots,
    bool? wildcardEnabled,
    int? wildcardSpots,
    List<LeagueStageDraft>? stages,
  }) {
    return LeagueCreateDraft(
      leagueId: clearLeagueId ? null : (leagueId ?? this.leagueId),
      sport: sport ?? this.sport,
      name: name ?? this.name,
      organizationName: organizationName ?? this.organizationName,
      coverImagePath: clearCoverImagePath
          ? null
          : (coverImagePath ?? this.coverImagePath),
      description: description ?? this.description,
      city: city ?? this.city,
      state: state ?? this.state,
      seasonStartAt: seasonStartAt ?? this.seasonStartAt,
      seasonEndAt: seasonEndAt ?? this.seasonEndAt,
      plannedStagesCount: plannedStagesCount ?? this.plannedStagesCount,
      grandFinalEnabled: grandFinalEnabled ?? this.grandFinalEnabled,
      categories: categories ?? this.categories,
      defaultPriceCents: defaultPriceCents ?? this.defaultPriceCents,
      countingStagesMode: countingStagesMode ?? this.countingStagesMode,
      rankingTableId: rankingTableId ?? this.rankingTableId,
      rankingPointsByPlace: rankingPointsByPlace ?? this.rankingPointsByPlace,
      grandFinalSpots: grandFinalSpots ?? this.grandFinalSpots,
      wildcardEnabled: wildcardEnabled ?? this.wildcardEnabled,
      wildcardSpots: wildcardSpots ?? this.wildcardSpots,
      stages: stages ?? this.stages,
    );
  }
}
