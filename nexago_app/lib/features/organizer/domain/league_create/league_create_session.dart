import 'package:flutter/foundation.dart';

import '../tournament_create/tournament_create_draft.dart';
import 'league_create_draft.dart';

/// Sessão persistível do wizard de liga (rascunho local ou retomada do Firestore).
@immutable
class LeagueCreateSession {
  const LeagueCreateSession({
    required this.draft,
    required this.currentStep,
    required this.updatedAt,
    required this.managerUid,
  });

  final LeagueCreateDraft draft;
  final LeagueCreateStep currentStep;
  final DateTime updatedAt;
  final String managerUid;

  LeagueCreateSession copyWith({
    LeagueCreateDraft? draft,
    LeagueCreateStep? currentStep,
    DateTime? updatedAt,
    String? managerUid,
  }) {
    return LeagueCreateSession(
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

  static LeagueCreateSession? fromJson(Map<String, dynamic> json) {
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

      return LeagueCreateSession(
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

Map<String, dynamic> _draftToJson(LeagueCreateDraft draft) => {
  'leagueId': draft.leagueId,
  'sport': draft.sport.name,
  'name': draft.name,
  'organizationName': draft.organizationName,
  'coverImagePath': draft.coverImagePath,
  'description': draft.description,
  'city': draft.city,
  'state': draft.state,
  'seasonStartAt': draft.seasonStartAt?.toIso8601String(),
  'seasonEndAt': draft.seasonEndAt?.toIso8601String(),
  'plannedStagesCount': draft.plannedStagesCount,
  'grandFinalEnabled': draft.grandFinalEnabled,
  'categories': draft.categories.map(_categoryToJson).toList(),
  'defaultPriceCents': draft.defaultPriceCents,
  'countingStagesMode': draft.countingStagesMode.name,
  'rankingTableId': draft.rankingTableId,
  'rankingPointsByPlace': draft.rankingPointsByPlace.map(
    (k, v) => MapEntry(k, v),
  ),
  'grandFinalSpots': draft.grandFinalSpots,
  'wildcardEnabled': draft.wildcardEnabled,
  'wildcardSpots': draft.wildcardSpots,
  'stages': draft.stages.map(_stageToJson).toList(),
};

LeagueCreateDraft? _draftFromJson(Map<String, dynamic> json) {
  try {
    return LeagueCreateDraft(
      leagueId: json['leagueId'] as String?,
      sport: _enumByName(
        TournamentSport.values,
        json['sport'] as String?,
        TournamentSport.beachVolleyball,
      ),
      name: json['name'] as String? ?? '',
      organizationName: json['organizationName'] as String? ?? '',
      coverImagePath: json['coverImagePath'] as String?,
      description: json['description'] as String? ?? '',
      city: json['city'] as String? ?? '',
      state: json['state'] as String? ?? '',
      seasonStartAt: _parseDate(json['seasonStartAt']),
      seasonEndAt: _parseDate(json['seasonEndAt']),
      plannedStagesCount: json['plannedStagesCount'] as int? ?? 6,
      grandFinalEnabled: json['grandFinalEnabled'] as bool? ?? true,
      categories: _categoriesFromJson(json['categories']),
      defaultPriceCents: json['defaultPriceCents'] as int? ?? 22000,
      countingStagesMode: _enumByName(
        LeagueCountingStagesMode.values,
        json['countingStagesMode'] as String?,
        LeagueCountingStagesMode.best4Of6,
      ),
      rankingTableId: json['rankingTableId'] as String? ?? 'state_circuit',
      rankingPointsByPlace: _rankingPointsFromJson(
        json['rankingPointsByPlace'],
      ),
      grandFinalSpots: json['grandFinalSpots'] as int? ?? 16,
      wildcardEnabled: json['wildcardEnabled'] as bool? ?? false,
      wildcardSpots: json['wildcardSpots'] as int? ?? 2,
      stages: _stagesFromJson(json['stages']),
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

List<LeagueStageDraft> _stagesFromJson(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map<String, dynamic>>()
      .map(_stageFromJson)
      .whereType<LeagueStageDraft>()
      .toList();
}

LeagueStageDraft? _stageFromJson(Map<String, dynamic> json) {
  try {
    final id = json['id'] as String?;
    if (id == null || id.isEmpty) return null;
    return LeagueStageDraft(
      id: id,
      name: json['name'] as String? ?? '',
      order: json['order'] as int? ?? 1,
      status: _enumByName(
        LeagueStageStatus.values,
        json['status'] as String?,
        LeagueStageStatus.pending,
      ),
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
  } catch (_) {
    return null;
  }
}

Map<String, int> _rankingPointsFromJson(dynamic raw) {
  if (raw is! Map) return const {};
  return raw.map((k, v) => MapEntry(k.toString(), (v as num).toInt()));
}

Map<String, dynamic> _categoryToJson(TournamentCategoryDraft category) => {
  'id': category.id,
  'name': category.name,
  'gender': category.gender.name,
  'dispute': category.dispute.name,
  'ageBand': category.ageBand.name,
  'skillLevel': category.skillLevel.name,
  'spots': category.spots,
  'useDefaultPrice': category.useDefaultPrice,
  'priceCents': category.priceCents,
  'bracketSystem': category.bracketSystem.name,
  'teamsPerGroup': category.teamsPerGroup,
  'qualifiersPerGroup': category.qualifiersPerGroup,
  'bestOf': category.bestOf.name,
  'finalBestOf5': category.finalBestOf5,
  'maxRegistrationsPerAthlete': category.maxRegistrationsPerAthlete,
  'prizes': category.prizes.map(_prizeToJson).toList(),
};

Map<String, dynamic> _prizeToJson(TournamentCategoryPrizeDraft prize) => {
  'position': prize.position,
  'valueCents': prize.valueCents,
  if (prize.label != null) 'label': prize.label,
};

List<TournamentCategoryDraft> _categoriesFromJson(dynamic raw) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map<String, dynamic>>()
      .map(_categoryFromJson)
      .whereType<TournamentCategoryDraft>()
      .toList();
}

TournamentCategoryDraft? _categoryFromJson(Map<String, dynamic> json) {
  try {
    final id = json['id'] as String?;
    if (id == null || id.isEmpty) return null;
    return TournamentCategoryDraft(
      id: id,
      name: json['name'] as String? ?? '',
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
      spots: json['spots'] as int? ?? 16,
      useDefaultPrice: json['useDefaultPrice'] as bool? ?? true,
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
      maxRegistrationsPerAthlete:
          json['maxRegistrationsPerAthlete'] as int? ?? 2,
      prizes: _prizesFromJson(json['prizes']),
    );
  } catch (_) {
    return null;
  }
}

List<TournamentCategoryPrizeDraft> _prizesFromJson(dynamic raw) {
  if (raw is! List) return const [];
  return raw.whereType<Map<String, dynamic>>().map((json) {
    return TournamentCategoryPrizeDraft(
      position: json['position'] as String? ?? '',
      valueCents: json['valueCents'] as int? ?? 0,
      label: json['label'] as String?,
    );
  }).toList();
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

LeagueCreateStep? _parseStep(String? name) {
  if (name == null || name.isEmpty) return null;
  for (final step in LeagueCreateStep.values) {
    if (step.name == name) return step;
  }
  return null;
}
