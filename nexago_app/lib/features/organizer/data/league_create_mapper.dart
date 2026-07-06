import 'package:cloud_firestore/cloud_firestore.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/league_create/league_create_draft.dart';
import '../domain/league_create/league_create_logic.dart';
import '../domain/tournament_create/tournament_create_draft.dart';
import '../domain/tournament_create/tournament_create_logic.dart';

typedef LeagueDraftLoadResult = ({
  LeagueCreateDraft draft,
  LeagueCreateStep step,
});

abstract final class LeagueCreateMapper {
  LeagueCreateMapper._();

  static Map<String, dynamic> toFirestore({
    required LeagueCreateDraft draft,
    required String managerId,
    required bool publish,
    LeagueCreateStep? wizardStep,
    bool isUpdate = false,
    List<LeagueStageDraft>? stagesWithTournamentIds,
  }) {
    final name = draft.name.trim();
    final listingStatus = publish ? 'open' : 'draft';
    final seasonStart = draft.seasonStartAt!;
    final seasonEnd = draft.seasonEndAt!;
    final stages = stagesWithTournamentIds ?? draft.stages;
    final categories = draft.categories.map(_categoryToMap).toList();
    final points = effectiveRankingPoints(draft);

    return {
      'name': name,
      'sport': draft.sport.name,
      'organizationName': draft.organizationName.trim().isEmpty
          ? null
          : draft.organizationName.trim(),
      'description': draft.description.trim().isEmpty
          ? null
          : draft.description.trim(),
      'city': draft.city.trim(),
      'state': draft.state.trim().isEmpty ? null : draft.state.trim(),
      'seasonLabel': formatLeagueSeasonRange(seasonStart, seasonEnd),
      'seasonStartAt': Timestamp.fromDate(seasonStart),
      'seasonEndAt': Timestamp.fromDate(seasonEnd),
      'plannedStagesCount': draft.plannedStagesCount,
      'grandFinalEnabled': draft.grandFinalEnabled,
      'categories': categories,
      'defaultEntryFeeCents': draft.defaultPriceCents,
      'countingStagesMode': _countingModeFirestore(draft.countingStagesMode),
      'rankingTableId': draft.rankingTableId,
      'rankingPointsByPlace': points,
      'grandFinalSpots': draft.grandFinalSpots,
      'wildcardEnabled': draft.wildcardEnabled,
      'wildcardSpots': draft.wildcardEnabled ? draft.wildcardSpots : 0,
      'stages': stages.map(_stageToMap).toList(),
      'listingStatus': listingStatus,
      'status': listingStatus,
      'managerId': managerId,
      'keywords': generateKeywords([
        name,
        draft.organizationName,
        draft.city,
        draft.description,
        ...draft.categories.map((c) => c.name),
      ]),
      if (wizardStep != null) 'wizardStep': wizardStep.name,
      'updatedAt': FieldValue.serverTimestamp(),
      if (!isUpdate) 'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static LeagueDraftLoadResult fromFirestore(
    Map<String, dynamic> data,
    String id,
  ) {
    final categoriesRaw = data['categories'];
    final categories = categoriesRaw is List
        ? categoriesRaw
            .whereType<Map>()
            .map((raw) => _categoryFromMap(Map<String, dynamic>.from(raw)))
            .whereType<TournamentCategoryDraft>()
            .toList()
        : <TournamentCategoryDraft>[];

    final stagesRaw = data['stages'];
    final stages = stagesRaw is List
        ? stagesRaw
            .whereType<Map>()
            .map((raw) => _stageFromMap(Map<String, dynamic>.from(raw)))
            .whereType<LeagueStageDraft>()
            .toList()
        : <LeagueStageDraft>[];

    final pointsRaw = data['rankingPointsByPlace'];
    final points = <String, int>{};
    if (pointsRaw is Map) {
      pointsRaw.forEach((k, v) {
        if (v is num) points[k.toString()] = v.toInt();
      });
    }

    final draft = LeagueCreateDraft(
      leagueId: id,
      sport: _parseSport(data['sport'] as String?),
      name: (data['name'] as String?) ?? '',
      organizationName: (data['organizationName'] as String?) ?? '',
      description: (data['description'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      state: (data['state'] as String?) ?? '',
      seasonStartAt: _timestamp(data['seasonStartAt']),
      seasonEndAt: _timestamp(data['seasonEndAt']),
      plannedStagesCount: (data['plannedStagesCount'] as num?)?.toInt() ?? 6,
      grandFinalEnabled: data['grandFinalEnabled'] as bool? ?? true,
      categories: categories,
      defaultPriceCents:
          (data['defaultEntryFeeCents'] as num?)?.toInt() ?? 9000,
      countingStagesMode: _parseCountingMode(
        data['countingStagesMode'] as String?,
      ),
      rankingTableId: (data['rankingTableId'] as String?) ?? 'state_circuit',
      rankingPointsByPlace: points,
      grandFinalSpots: (data['grandFinalSpots'] as num?)?.toInt() ?? 16,
      wildcardEnabled: data['wildcardEnabled'] as bool? ?? false,
      wildcardSpots: (data['wildcardSpots'] as num?)?.toInt() ?? 2,
      stages: stages,
    );

    return (
      draft: draft,
      step: parseLeagueWizardStep(data['wizardStep'] as String?) ??
          inferLeagueResumeStep(draft),
    );
  }

  static String _countingModeFirestore(LeagueCountingStagesMode mode) =>
      switch (mode) {
        LeagueCountingStagesMode.best4Of6 => 'best_4_of_6',
        LeagueCountingStagesMode.best3Of5 => 'best_3_of_5',
        LeagueCountingStagesMode.allStages => 'all_stages',
      };

  static LeagueCountingStagesMode _parseCountingMode(String? raw) =>
      switch (raw) {
        'best_3_of_5' => LeagueCountingStagesMode.best3Of5,
        'all_stages' => LeagueCountingStagesMode.allStages,
        _ => LeagueCountingStagesMode.best4Of6,
      };

  static Map<String, dynamic> _stageToMap(LeagueStageDraft stage) => {
        'id': stage.id,
        'name': stage.name,
        'order': stage.order,
        'status': stage.status.name,
        'isGrandFinal': stage.isGrandFinal,
        'locationName': stage.locationName.trim().isEmpty
            ? null
            : stage.locationName.trim(),
        'city': stage.city.trim().isEmpty ? null : stage.city.trim(),
        'state': stage.state.trim().isEmpty ? null : stage.state.trim(),
        'startAt':
            stage.startAt != null ? Timestamp.fromDate(stage.startAt!) : null,
        'endAt': stage.endAt != null ? Timestamp.fromDate(stage.endAt!) : null,
        'dateLabel':
            stage.dateLabel.trim().isEmpty ? null : stage.dateLabel.trim(),
        'tournamentIds': stage.tournamentIds,
      };

  static LeagueStageDraft? _stageFromMap(Map<String, dynamic> map) {
    final id = map['id'] as String?;
    if (id == null || id.isEmpty) return null;
    return LeagueStageDraft(
      id: id,
      name: (map['name'] as String?) ?? '',
      order: (map['order'] as num?)?.toInt() ?? 1,
      status: _parseStageStatus(map['status'] as String?),
      isGrandFinal: map['isGrandFinal'] as bool? ?? false,
      locationName: (map['locationName'] as String?) ?? '',
      city: (map['city'] as String?) ?? '',
      state: (map['state'] as String?) ?? '',
      startAt: _timestamp(map['startAt']),
      endAt: _timestamp(map['endAt']),
      dateLabel: (map['dateLabel'] as String?) ?? '',
      tournamentIds: (map['tournamentIds'] as List?)
              ?.whereType<String>()
              .toList(growable: false) ??
          const [],
    );
  }

  static LeagueStageStatus _parseStageStatus(String? raw) {
    if (raw == 'defined') return LeagueStageStatus.defined;
    return LeagueStageStatus.pending;
  }

  static DateTime? _timestamp(dynamic raw) {
    if (raw is Timestamp) return raw.toDate();
    if (raw is DateTime) return raw;
    return null;
  }

  static TournamentSport _parseSport(String? raw) {
    for (final value in TournamentSport.values) {
      if (value.name == raw) return value;
    }
    return TournamentSport.beachVolleyball;
  }

  static Map<String, dynamic> _categoryToMap(TournamentCategoryDraft category) {
    return {
      'id': category.id,
      'categoryName': category.name.trim().isEmpty
          ? suggestCategoryName(category)
          : category.name.trim(),
      'genderType': genderTypeFirestoreValue(category.gender),
      'disputeType': category.dispute.name,
      'ageBand': category.ageBand.name,
      'level': skillLevelLabel(category.skillLevel),
      'maxTeams': category.spots,
      'spotsTotal': category.spots,
      'spotsLeft': category.spots,
      'entryFee': category.priceCents / 100,
      'entryFeeCents': category.priceCents,
      'useDefaultPrice': category.useDefaultPrice,
      'bracketFormat': bracketFormatFirestoreValue(category.bracketSystem),
      'teamsPerGroup': category.teamsPerGroup,
      'qualifiersPerGroup': category.qualifiersPerGroup,
      'bestOf': category.bestOf.name,
      'finalBestOf5': category.finalBestOf5,
      'maxRegistrationsPerAthlete': category.maxRegistrationsPerAthlete,
      'registrationClosed': false,
      'isCompleted': false,
      'prizes': category.prizes
          .map(
            (p) => {
              'position': p.position,
              'value': (p.valueCents / 100).toStringAsFixed(0),
              'valueCents': p.valueCents,
              if (p.label != null) 'label': p.label,
            },
          )
          .toList(),
      'uniformType': null,
      'uniformNameOnShirt': false,
      'uniformNumberOnShirt': false,
    };
  }

  static TournamentCategoryDraft? _categoryFromMap(Map<String, dynamic> map) {
    final id = map['id'] as String?;
    if (id == null || id.isEmpty) return null;

    final entryFeeCents = (map['entryFeeCents'] as num?)?.toInt() ??
        (((map['entryFee'] as num?)?.toDouble() ?? 0) * 100).round();

    final bracketRaw = map['bracketFormat'] as String?;

    return TournamentCategoryDraft(
      id: id,
      name: (map['categoryName'] as String?) ?? (map['name'] as String?) ?? '',
      gender: _parseGender(map['genderType'] as String? ?? map['gender'] as String?),
      dispute: _parseDispute(map['disputeType'] as String? ?? map['dispute'] as String?),
      ageBand: _parseAgeBand(map['ageBand'] as String?),
      skillLevel: _parseSkillLevel(map['level'] as String?),
      spots: (map['maxTeams'] as num?)?.toInt() ??
          (map['spotsTotal'] as num?)?.toInt() ??
          16,
      useDefaultPrice: map['useDefaultPrice'] as bool? ?? true,
      priceCents: entryFeeCents,
      bracketSystem: bracketRaw != null && bracketRaw.isNotEmpty
          ? _parseBracketSystem(bracketRaw)
          : TournamentBracketSystem.groupsThenKnockout,
      teamsPerGroup: (map['teamsPerGroup'] as num?)?.toInt() ?? 4,
      qualifiersPerGroup: (map['qualifiersPerGroup'] as num?)?.toInt() ?? 2,
      bestOf: _parseBestOf(map['bestOf'] as String?),
      finalBestOf5: map['finalBestOf5'] as bool? ?? true,
      maxRegistrationsPerAthlete:
          (map['maxRegistrationsPerAthlete'] as num?)?.toInt() ?? 2,
      prizes: _parsePrizes(map['prizes']),
    );
  }

  static TournamentBestOf _parseBestOf(String? raw) {
    for (final value in TournamentBestOf.values) {
      if (value.name == raw) return value;
    }
    return TournamentBestOf.bestOf3;
  }

  static List<TournamentCategoryPrizeDraft> _parsePrizes(dynamic raw) {
    if (raw is! List) return const [];
    return raw.whereType<Map>().map((item) {
      final map = Map<String, dynamic>.from(item);
      final rawValue = map['value'];
      final valueReais = rawValue is num
          ? rawValue.toDouble()
          : double.tryParse(rawValue?.toString() ?? '') ?? 0;
      final valueCents =
          (map['valueCents'] as num?)?.toInt() ?? (valueReais * 100).round();
      return TournamentCategoryPrizeDraft(
        position: (map['position'] as String?) ?? '',
        valueCents: valueCents,
        label: map['label'] as String?,
      );
    }).toList();
  }

  static TournamentBracketSystem _parseBracketSystem(String? raw) {
    return switch (raw) {
      'groups_knockout' => TournamentBracketSystem.groupsThenKnockout,
      'single_elimination' => TournamentBracketSystem.singleElimination,
      'round_robin' => TournamentBracketSystem.roundRobin,
      'groups_repechage' => TournamentBracketSystem.groupsWithRepechage,
      'double_elimination' => TournamentBracketSystem.doubleElimination,
      _ => TournamentBracketSystem.groupsThenKnockout,
    };
  }

  static TournamentCategoryGender _parseGender(String? raw) {
    return switch (raw) {
      'male' || 'masc' || 'masculino' => TournamentCategoryGender.male,
      'female' || 'fem' || 'feminino' => TournamentCategoryGender.female,
      'mixed' || 'misto' => TournamentCategoryGender.mixed,
      _ => TournamentCategoryGender.male,
    };
  }

  static TournamentCategoryDispute _parseDispute(String? raw) {
    for (final value in TournamentCategoryDispute.values) {
      if (value.name == raw) return value;
    }
    return TournamentCategoryDispute.dupla;
  }

  static TournamentAgeBand _parseAgeBand(String? raw) {
    for (final value in TournamentAgeBand.values) {
      if (value.name == raw) return value;
    }
    return TournamentAgeBand.open;
  }

  static TournamentSkillLevel _parseSkillLevel(String? raw) {
    if (raw == null) return TournamentSkillLevel.open;
    for (final value in TournamentSkillLevel.values) {
      if (value.name == raw) return value;
    }
    return switch (raw.toLowerCase()) {
      'iniciante' || 'beginner' => TournamentSkillLevel.beginner,
      'intermediário' ||
      'intermediario' ||
      'intermediate' => TournamentSkillLevel.intermediate,
      'iniciante 1' || 'iniciante_1' => TournamentSkillLevel.iniciante1,
      'iniciante 2' || 'iniciante_2' => TournamentSkillLevel.iniciante2,
      'intermediário 1' ||
      'intermediario 1' ||
      'intermediario_1' => TournamentSkillLevel.intermediario1,
      'intermediário 2' ||
      'intermediario 2' ||
      'intermediario_2' => TournamentSkillLevel.intermediario2,
      'open' || 'livre' => TournamentSkillLevel.open,
      _ => TournamentSkillLevel.open,
    };
  }
}
