import 'package:flutter/foundation.dart';

import '../league_create/league_create_draft.dart';
import '../tournament_create/tournament_create_draft.dart';
import 'league_stage_create_draft.dart';

@immutable
class LeagueStageCreateSession {
  const LeagueStageCreateSession({
    required this.draft,
    required this.currentStep,
    required this.updatedAt,
    required this.managerUid,
  });

  final LeagueStageCreateDraft draft;
  final LeagueStageCreateStep currentStep;
  final DateTime updatedAt;
  final String managerUid;

  LeagueStageCreateSession copyWith({
    LeagueStageCreateDraft? draft,
    LeagueStageCreateStep? currentStep,
    DateTime? updatedAt,
    String? managerUid,
  }) {
    return LeagueStageCreateSession(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
      updatedAt: updatedAt ?? this.updatedAt,
      managerUid: managerUid ?? this.managerUid,
    );
  }

  Map<String, dynamic> toJson() => {
    'version': 1,
    'managerUid': managerUid,
    'updatedAt': updatedAt.toIso8601String(),
    'currentStep': currentStep.name,
    'draft': _draftToJson(draft),
  };

  static LeagueStageCreateSession? fromJson(Map<String, dynamic> json) {
    try {
      final version = json['version'] as int? ?? 1;
      if (version != 1) return null;

      final managerUid = json['managerUid'] as String? ?? '';
      if (managerUid.isEmpty) return null;

      final updatedAtRaw = json['updatedAt'] as String?;
      final updatedAt = updatedAtRaw != null
          ? DateTime.tryParse(updatedAtRaw)
          : null;
      if (updatedAt == null) return null;

      final currentStep = _parseStep(json['currentStep'] as String?);
      if (currentStep == null) return null;

      final draftJson = json['draft'];
      if (draftJson is! Map<String, dynamic>) return null;
      final draft = _draftFromJson(draftJson);
      if (draft == null) return null;

      return LeagueStageCreateSession(
        draft: draft,
        currentStep: currentStep,
        updatedAt: updatedAt,
        managerUid: managerUid,
      );
    } catch (_) {
      return null;
    }
  }
}

Map<String, dynamic> _draftToJson(LeagueStageCreateDraft draft) => {
  'leagueId': draft.leagueId,
  'leagueName': draft.leagueName,
  'plannedStagesCount': draft.plannedStagesCount,
  'sport': draft.sport.name,
  'leagueCity': draft.leagueCity,
  'leagueState': draft.leagueState,
  'defaultPriceCents': draft.defaultPriceCents,
  'rankingTableId': draft.rankingTableId,
  'paymentMode': draft.paymentMode.name,
  'stage': _stageToJson(draft.stage),
  'categories': draft.categories.map(_categoryToJson).toList(),
  'courtsCount': draft.courtsCount,
  'arenaId': draft.arenaId,
  'locationAddress': draft.locationAddress,
  'registrationOpensAt': draft.registrationOpensAt?.toIso8601String(),
  'registrationClosesAt': draft.registrationClosesAt?.toIso8601String(),
};

LeagueStageCreateDraft? _draftFromJson(Map<String, dynamic> json) {
  try {
    final stageJson = json['stage'];
    if (stageJson is! Map<String, dynamic>) return null;
    final stage = _stageFromJson(stageJson);
    if (stage == null) return null;

    return LeagueStageCreateDraft(
      leagueId: json['leagueId'] as String? ?? '',
      leagueName: json['leagueName'] as String? ?? '',
      plannedStagesCount: json['plannedStagesCount'] as int? ?? 6,
      sport: _enumByName(
        TournamentSport.values,
        json['sport'] as String?,
        TournamentSport.beachVolleyball,
      ),
      leagueCity: json['leagueCity'] as String? ?? '',
      leagueState: json['leagueState'] as String? ?? '',
      defaultPriceCents: json['defaultPriceCents'] as int? ?? 22000,
      rankingTableId: json['rankingTableId'] as String? ?? 'state_circuit',
      paymentMode: _enumByName(
        TournamentPaymentMode.values,
        json['paymentMode'] as String?,
        TournamentPaymentMode.appPixCard,
      ),
      stage: stage,
      categories: _categoriesFromJson(json['categories']),
      courtsCount: json['courtsCount'] as int? ?? 4,
      arenaId: json['arenaId'] as String?,
      locationAddress: json['locationAddress'] as String? ?? '',
      registrationOpensAt: _parseDate(json['registrationOpensAt']),
      registrationClosesAt: _parseDate(json['registrationClosesAt']),
    );
  } catch (_) {
    return null;
  }
}

Map<String, dynamic> _stageToJson(LeagueStageDraft stage) => {
  'id': stage.id,
  'name': stage.name,
  'order': stage.order,
  'status': stage.status.name,
  'isGrandFinal': stage.isGrandFinal,
  'locationName': stage.locationName,
  'city': stage.city,
  'state': stage.state,
  'startAt': stage.startAt?.toIso8601String(),
  'endAt': stage.endAt?.toIso8601String(),
  'dateLabel': stage.dateLabel,
  'tournamentIds': stage.tournamentIds,
};

LeagueStageDraft? _stageFromJson(Map<String, dynamic> json) {
  final id = json['id'] as String?;
  if (id == null || id.isEmpty) return null;
  return LeagueStageDraft(
    id: id,
    name: json['name'] as String? ?? '',
    order: json['order'] as int? ?? 1,
    status: json['status'] == 'defined'
        ? LeagueStageStatus.defined
        : LeagueStageStatus.pending,
    isGrandFinal: json['isGrandFinal'] as bool? ?? false,
    locationName: json['locationName'] as String? ?? '',
    city: json['city'] as String? ?? '',
    state: json['state'] as String? ?? '',
    startAt: _parseDate(json['startAt']),
    endAt: _parseDate(json['endAt']),
    dateLabel: json['dateLabel'] as String? ?? '',
    tournamentIds:
        (json['tournamentIds'] as List?)?.whereType<String>().toList(
          growable: false,
        ) ??
        const [],
  );
}

Map<String, dynamic> _categoryToJson(LeagueStageCategoryDraft category) => {
  'categoryId': category.categoryId,
  'name': category.name,
  'enabled': category.enabled,
  'spots': category.spots,
  'gender': category.gender.name,
  'dispute': category.dispute.name,
  'ageBand': category.ageBand.name,
  'skillLevel': category.skillLevel.name,
  'priceCents': category.priceCents,
  'bracketSystem': category.bracketSystem.name,
  'teamsPerGroup': category.teamsPerGroup,
  'qualifiersPerGroup': category.qualifiersPerGroup,
  'bestOf': category.bestOf.name,
  'finalBestOf5': category.finalBestOf5,
  'genderFree': category.genderFree,
  if (category.menCount != null) 'menCount': category.menCount,
  if (category.womenCount != null) 'womenCount': category.womenCount,
  if (category.minLevel.isNotEmpty) 'minLevel': category.minLevel,
};

List<LeagueStageCategoryDraft> _categoriesFromJson(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map<String, dynamic>>()
      .map(_categoryFromJson)
      .whereType<LeagueStageCategoryDraft>()
      .toList();
}

LeagueStageCategoryDraft? _categoryFromJson(Map<String, dynamic> json) {
  final id = json['categoryId'] as String?;
  if (id == null || id.isEmpty) return null;
  return LeagueStageCategoryDraft(
    categoryId: id,
    name: json['name'] as String? ?? '',
    enabled: json['enabled'] as bool? ?? true,
    spots: json['spots'] as int? ?? 16,
    gender: _enumByName(
      TournamentCategoryGender.values,
      json['gender'] as String?,
      TournamentCategoryGender.male,
    ),
    dispute: _enumByName(
      TournamentCategoryDispute.values,
      json['dispute'] as String?,
      TournamentCategoryDispute.dupla,
    ),
    ageBand: _enumByName(
      TournamentAgeBand.values,
      json['ageBand'] as String?,
      TournamentAgeBand.open,
    ),
    skillLevel: _enumByName(
      TournamentSkillLevel.values,
      json['skillLevel'] as String?,
      TournamentSkillLevel.open,
    ),
    priceCents: json['priceCents'] as int? ?? 22000,
    bracketSystem: _enumByName(
      TournamentBracketSystem.values,
      json['bracketSystem'] as String?,
      TournamentBracketSystem.groupsThenKnockout,
    ),
    teamsPerGroup: json['teamsPerGroup'] as int? ?? 4,
    qualifiersPerGroup: json['qualifiersPerGroup'] as int? ?? 2,
    bestOf: _enumByName(
      TournamentBestOf.values,
      json['bestOf'] as String?,
      TournamentBestOf.bestOf3,
    ),
    finalBestOf5: json['finalBestOf5'] as bool? ?? true,
    genderFree: json['genderFree'] as bool? ?? false,
    menCount: json['menCount'] as int?,
    womenCount: json['womenCount'] as int?,
    minLevel: json['minLevel'] as String? ?? '',
  );
}

T _enumByName<T extends Enum>(List<T> values, String? name, T fallback) {
  if (name == null) return fallback;
  for (final value in values) {
    if (value.name == name) return value;
  }
  return fallback;
}

DateTime? _parseDate(dynamic raw) {
  if (raw is String) return DateTime.tryParse(raw);
  return null;
}

LeagueStageCreateStep? _parseStep(String? name) {
  if (name == null || name.isEmpty) return null;
  for (final step in LeagueStageCreateStep.values) {
    if (step.name == name) return step;
  }
  return null;
}
