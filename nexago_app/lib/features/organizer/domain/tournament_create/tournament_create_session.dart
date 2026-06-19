import 'package:flutter/foundation.dart';

import 'tournament_create_draft.dart';

/// Sessão persistível do wizard (rascunho local ou retomada do Firestore).
@immutable
class TournamentCreateSession {
  const TournamentCreateSession({
    required this.draft,
    required this.currentStep,
    required this.updatedAt,
    required this.managerUid,
    this.isEditingPublished = false,
  });

  final TournamentCreateDraft draft;
  final TournamentCreateStep currentStep;
  final DateTime updatedAt;
  final String managerUid;
  final bool isEditingPublished;

  TournamentCreateSession copyWith({
    TournamentCreateDraft? draft,
    TournamentCreateStep? currentStep,
    DateTime? updatedAt,
    String? managerUid,
    bool? isEditingPublished,
  }) {
    return TournamentCreateSession(
      draft: draft ?? this.draft,
      currentStep: currentStep ?? this.currentStep,
      updatedAt: updatedAt ?? this.updatedAt,
      managerUid: managerUid ?? this.managerUid,
      isEditingPublished: isEditingPublished ?? this.isEditingPublished,
    );
  }

  Map<String, dynamic> toJson() => {
        'version': 2,
        'managerUid': managerUid,
        'updatedAt': updatedAt.toIso8601String(),
        'currentStep': currentStep.name,
        'isEditingPublished': isEditingPublished,
        'draft': _draftToJson(draft),
      };

  static TournamentCreateSession? fromJson(Map<String, dynamic> json) {
    try {
      final version = json['version'] as int? ?? 1;
      if (version != 1 && version != 2) return null;

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
      final draft = _draftFromJson(draftJson, version: version);
      if (draft == null) return null;

      return TournamentCreateSession(
        draft: draft,
        currentStep: currentStep,
        updatedAt: updatedAt,
        managerUid: managerUid,
        isEditingPublished: json['isEditingPublished'] as bool? ?? false,
      );
    } catch (_) {
      return null;
    }
  }
}

Map<String, dynamic> _draftToJson(TournamentCreateDraft draft) => {
      'tournamentId': draft.tournamentId,
      'sport': draft.sport.name,
      'name': draft.name,
      'coverImagePath': draft.coverImagePath,
      'coverImageUrl': draft.coverImageUrl,
      'description': draft.description,
      'arenaId': draft.arenaId,
      'locationName': draft.locationName,
      'locationAddress': draft.locationAddress,
      'city': draft.city,
      'state': draft.state,
      'startAt': draft.startAt?.toIso8601String(),
      'endAt': draft.endAt?.toIso8601String(),
      'firstMatchAt': draft.firstMatchAt?.toIso8601String(),
      'courtsCount': draft.courtsCount,
      'categories': draft.categories.map(_categoryToJson).toList(),
      'defaultPriceCents': draft.defaultPriceCents,
      'registrationOpensAt': draft.registrationOpensAt?.toIso8601String(),
      'registrationClosesAt': draft.registrationClosesAt?.toIso8601String(),
      'paymentMode': draft.paymentMode.name,
      'waitlistEnabled': draft.waitlistEnabled,
      'inviteConfirmEnabled': draft.inviteConfirmEnabled,
      'cashPrizesEnabled': draft.cashPrizesEnabled,
      'regulationPdfPath': draft.regulationPdfPath,
      'regulationNotes': draft.regulationNotes,
      'uniformRequired': draft.uniformRequired,
      'uniformNumberOnShirt': draft.uniformNumberOnShirt,
      'uniformNameOnShirt': draft.uniformNameOnShirt,
      'rankingEnabled': draft.rankingEnabled,
      'rankingTableId': draft.rankingTableId,
      'visibility': draft.visibility.name,
    };

TournamentCreateDraft? _draftFromJson(
  Map<String, dynamic> json, {
  required int version,
}) {
  try {
    final legacyBracketSystem = version == 1
        ? _enumByName(
            TournamentBracketSystem.values,
            json['bracketSystem'] as String?,
            TournamentBracketSystem.groupsThenKnockout,
          )
        : TournamentBracketSystem.groupsThenKnockout;
    final legacyTeamsPerGroup = version == 1
        ? json['teamsPerGroup'] as int? ?? 4
        : 4;
    final legacyQualifiersPerGroup = version == 1
        ? json['qualifiersPerGroup'] as int? ?? 2
        : 2;
    final legacyBestOf = version == 1
        ? _enumByName(
            TournamentBestOf.values,
            json['bestOf'] as String?,
            TournamentBestOf.bestOf3,
          )
        : TournamentBestOf.bestOf3;
    final legacyFinalBestOf5 =
        version == 1 ? json['finalBestOf5'] as bool? ?? true : true;

    var categories = _categoriesFromJson(
      json['categories'],
      fallbackBracketSystem: legacyBracketSystem,
      fallbackTeamsPerGroup: legacyTeamsPerGroup,
      fallbackQualifiersPerGroup: legacyQualifiersPerGroup,
      fallbackBestOf: legacyBestOf,
      fallbackFinalBestOf5: legacyFinalBestOf5,
    );

    if (version == 1 && categories.isEmpty) {
      categories = const [];
    }

    return TournamentCreateDraft(
      tournamentId: json['tournamentId'] as String?,
      sport: _enumByName(
        TournamentSport.values,
        json['sport'] as String?,
        TournamentSport.beachVolleyball,
      ),
      name: json['name'] as String? ?? '',
      coverImagePath: json['coverImagePath'] as String?,
      coverImageUrl: json['coverImageUrl'] as String?,
      description: json['description'] as String? ?? '',
      arenaId: json['arenaId'] as String?,
      locationName: json['locationName'] as String? ?? '',
      locationAddress: json['locationAddress'] as String? ?? '',
      city: json['city'] as String? ?? '',
      state: json['state'] as String? ?? '',
      startAt: _parseDate(json['startAt']),
      endAt: _parseDate(json['endAt']),
      firstMatchAt: _parseDate(json['firstMatchAt']),
      courtsCount: json['courtsCount'] as int? ?? 4,
      categories: categories,
      defaultPriceCents: json['defaultPriceCents'] as int? ?? 18000,
      registrationOpensAt: _parseDate(json['registrationOpensAt']),
      registrationClosesAt: _parseDate(json['registrationClosesAt']),
      paymentMode: _enumByName(
        TournamentPaymentMode.values,
        json['paymentMode'] as String?,
        TournamentPaymentMode.appPixCard,
      ),
      waitlistEnabled: json['waitlistEnabled'] as bool? ?? true,
      inviteConfirmEnabled: json['inviteConfirmEnabled'] as bool? ?? false,
      cashPrizesEnabled: json['cashPrizesEnabled'] as bool? ?? true,
      regulationPdfPath: json['regulationPdfPath'] as String?,
      regulationNotes: json['regulationNotes'] as String? ?? '',
      uniformRequired: json['uniformRequired'] as bool? ?? true,
      uniformNumberOnShirt: json['uniformNumberOnShirt'] as bool? ?? true,
      uniformNameOnShirt: json['uniformNameOnShirt'] as bool? ?? true,
      rankingEnabled: json['rankingEnabled'] as bool? ?? true,
      rankingTableId: json['rankingTableId'] as String? ?? 'nexago_standalone',
      visibility: _enumByName(
        TournamentVisibility.values,
        json['visibility'] as String?,
        TournamentVisibility.publicListing,
      ),
    );
  } catch (_) {
    return null;
  }
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

List<TournamentCategoryDraft> _categoriesFromJson(
  dynamic raw, {
  required TournamentBracketSystem fallbackBracketSystem,
  required int fallbackTeamsPerGroup,
  required int fallbackQualifiersPerGroup,
  required TournamentBestOf fallbackBestOf,
  required bool fallbackFinalBestOf5,
}) {
  if (raw is! List) return const [];
  return raw
      .whereType<Map<String, dynamic>>()
      .map(
        (json) => _categoryFromJson(
          json,
          fallbackBracketSystem: fallbackBracketSystem,
          fallbackTeamsPerGroup: fallbackTeamsPerGroup,
          fallbackQualifiersPerGroup: fallbackQualifiersPerGroup,
          fallbackBestOf: fallbackBestOf,
          fallbackFinalBestOf5: fallbackFinalBestOf5,
        ),
      )
      .whereType<TournamentCategoryDraft>()
      .toList();
}

TournamentCategoryDraft? _categoryFromJson(
  Map<String, dynamic> json, {
  required TournamentBracketSystem fallbackBracketSystem,
  required int fallbackTeamsPerGroup,
  required int fallbackQualifiersPerGroup,
  required TournamentBestOf fallbackBestOf,
  required bool fallbackFinalBestOf5,
}) {
  try {
    final id = json['id'] as String?;
    if (id == null || id.isEmpty) return null;

    final hasBracket = json['bracketSystem'] != null;
    final customFormatEnabled = json['customFormatEnabled'] as bool? ?? false;

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
      priceCents: json['priceCents'] as int? ?? 18000,
      bracketSystem: hasBracket || customFormatEnabled
          ? _enumByName(
              TournamentBracketSystem.values,
              json['bracketSystem'] as String?,
              fallbackBracketSystem,
            )
          : fallbackBracketSystem,
      teamsPerGroup: json['teamsPerGroup'] as int? ?? fallbackTeamsPerGroup,
      qualifiersPerGroup:
          json['qualifiersPerGroup'] as int? ?? fallbackQualifiersPerGroup,
      bestOf: json['bestOf'] != null
          ? _enumByName(
              TournamentBestOf.values,
              json['bestOf'] as String?,
              fallbackBestOf,
            )
          : fallbackBestOf,
      finalBestOf5: json['finalBestOf5'] as bool? ?? fallbackFinalBestOf5,
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

T _enumByName<T extends Enum>(
  List<T> values,
  String? name,
  T fallback,
) {
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

TournamentCreateStep? _parseStep(String? name) {
  if (name == null || name.isEmpty) return null;
  if (name == 'format') return TournamentCreateStep.categories;
  if (name == 'prizes') return TournamentCreateStep.rules;
  for (final step in TournamentCreateStep.values) {
    if (step.name == name) return step;
  }
  return null;
}
