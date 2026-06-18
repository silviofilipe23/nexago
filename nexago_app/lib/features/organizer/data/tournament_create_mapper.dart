import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/tournament_create/tournament_create_draft.dart';
import '../domain/tournament_create/tournament_create_logic.dart';

abstract final class TournamentCreateMapper {
  TournamentCreateMapper._();

  static final _dateFmt = DateFormat('dd/MM', 'pt_BR');

  static Map<String, dynamic> toFirestore({
    required TournamentCreateDraft draft,
    required String managerId,
    required bool publish,
    TournamentCreateStep? wizardStep,
    bool isUpdate = false,
  }) {
    final categories = draft.categories
        .map((c) => _categoryToMap(c, draft: draft))
        .toList();
    final capacity = draft.totalSpots;
    final startAt = draft.startAt!;
    final endAt = draft.endAt!;
    final listingStatus = publish ? 'open' : 'draft';
    final name = draft.name.trim();

    return {
      'name': name,
      'sport': draft.sport.name,
      'description': draft.description.trim().isEmpty
          ? null
          : draft.description.trim(),
      'city': draft.city.trim(),
      'state': draft.state.trim().isEmpty ? null : draft.state.trim(),
      'locationName': draft.locationName.trim(),
      'location': draft.locationName.trim(),
      'locationAddress': draft.locationAddress.trim().isEmpty
          ? null
          : draft.locationAddress.trim(),
      'arenaId': draft.arenaId,
      'startAt': Timestamp.fromDate(startAt),
      'endAt': Timestamp.fromDate(endAt),
      'firstMatchAt': draft.firstMatchAt != null
          ? Timestamp.fromDate(draft.firstMatchAt!)
          : null,
      'dateLabel': _formatDateRange(startAt, endAt),
      'courtsCount': draft.courtsCount,
      'format': _disputeFormatValue(draft.categories),
      'capacity': capacity,
      if (!isUpdate) 'enrolledCount': 0,
      'listingStatus': listingStatus,
      'status': listingStatus,
      'visibility': draft.visibility.name,
      'featured': false,
      'liveMatchesNow': 0,
      'managerId': managerId,
      'categories': categories,
      'defaultEntryFeeCents': draft.defaultPriceCents,
      'registrationOpensAt': draft.registrationOpensAt != null
          ? Timestamp.fromDate(draft.registrationOpensAt!)
          : null,
      'registrationClosesAt': draft.registrationClosesAt != null
          ? Timestamp.fromDate(draft.registrationClosesAt!)
          : null,
      'paymentMode': draft.paymentMode.name,
      'waitlistEnabled': draft.waitlistEnabled,
      'inviteConfirmEnabled': draft.inviteConfirmEnabled,
      'cashPrizesEnabled': draft.cashPrizesEnabled,
      'regulationsText': draft.regulationNotes.trim().isEmpty
          ? null
          : draft.regulationNotes.trim(),
      'uniformRequired': draft.uniformRequired,
      'uniformNumberOnShirt':
          draft.uniformRequired && draft.uniformNumberOnShirt,
      'uniformNameOnShirt':
          draft.uniformRequired && draft.uniformNameOnShirt,
      'rankingEnabled': draft.rankingEnabled,
      'rankingTableId':
          draft.rankingEnabled ? draft.rankingTableId : null,
      'keywords': generateKeywords([
        name,
        draft.locationName,
        draft.city,
        draft.description,
        ...draft.categories.map((c) => c.name),
      ]),
      if (wizardStep != null) 'wizardStep': wizardStep.name,
      'updatedAt': FieldValue.serverTimestamp(),
      if (!isUpdate) 'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static ({TournamentCreateDraft draft, TournamentCreateStep? wizardStep})
      fromFirestore(
    Map<String, dynamic> data,
    String id,
  ) {
    final categoriesRaw = data['categories'];
    final tournamentBracketSystem = _parseBracketSystem(
      data['bracketSystem'] as String? ?? data['bracketFormat'] as String?,
    );
    final tournamentTeamsPerGroup = (data['teamsPerGroup'] as num?)?.toInt() ?? 4;
    final tournamentQualifiersPerGroup =
        (data['qualifiersPerGroup'] as num?)?.toInt() ?? 2;
    final tournamentBestOf = _parseBestOf(data['bestOf'] as String?);
    final tournamentFinalBestOf5 = data['finalBestOf5'] as bool? ?? true;

    final categories = categoriesRaw is List
        ? categoriesRaw
            .whereType<Map>()
            .map(
              (raw) => _categoryFromMap(
                Map<String, dynamic>.from(raw),
                fallbackBracketSystem: tournamentBracketSystem,
                fallbackTeamsPerGroup: tournamentTeamsPerGroup,
                fallbackQualifiersPerGroup: tournamentQualifiersPerGroup,
                fallbackBestOf: tournamentBestOf,
                fallbackFinalBestOf5: tournamentFinalBestOf5,
              ),
            )
            .whereType<TournamentCategoryDraft>()
            .toList()
        : <TournamentCategoryDraft>[];

    final draft = TournamentCreateDraft(
      tournamentId: id,
      sport: _parseSport(data['sport'] as String?),
      name: (data['name'] as String?) ?? '',
      description: (data['description'] as String?) ?? '',
      arenaId: data['arenaId'] as String?,
      locationName: (data['locationName'] as String?) ??
          (data['location'] as String?) ??
          '',
      locationAddress: (data['locationAddress'] as String?) ?? '',
      city: (data['city'] as String?) ?? '',
      state: (data['state'] as String?) ?? '',
      startAt: _timestamp(data['startAt']),
      endAt: _timestamp(data['endAt']),
      firstMatchAt: _timestamp(data['firstMatchAt']),
      courtsCount: (data['courtsCount'] as num?)?.toInt() ?? 4,
      categories: categories,
      defaultPriceCents:
          (data['defaultEntryFeeCents'] as num?)?.toInt() ?? 18000,
      registrationOpensAt: _timestamp(data['registrationOpensAt']),
      registrationClosesAt: _timestamp(data['registrationClosesAt']),
      paymentMode: _parsePaymentMode(data['paymentMode'] as String?),
      waitlistEnabled: data['waitlistEnabled'] as bool? ?? true,
      inviteConfirmEnabled: data['inviteConfirmEnabled'] as bool? ?? false,
      cashPrizesEnabled: data['cashPrizesEnabled'] as bool? ?? true,
      regulationNotes: (data['regulationsText'] as String?) ?? '',
      uniformRequired: data['uniformRequired'] as bool? ?? true,
      uniformNumberOnShirt: data['uniformNumberOnShirt'] as bool? ?? true,
      uniformNameOnShirt: data['uniformNameOnShirt'] as bool? ?? true,
      rankingEnabled: data['rankingEnabled'] as bool? ?? true,
      rankingTableId:
          (data['rankingTableId'] as String?) ?? 'nexago_standalone',
      visibility: _parseVisibility(data['visibility'] as String?),
    );

    return (
      draft: draft,
      wizardStep: parseWizardStep(data['wizardStep'] as String?),
    );
  }

  static TournamentCategoryDraft? _categoryFromMap(
    Map<String, dynamic> map, {
    TournamentBracketSystem fallbackBracketSystem =
        TournamentBracketSystem.groupsThenKnockout,
    int fallbackTeamsPerGroup = 4,
    int fallbackQualifiersPerGroup = 2,
    TournamentBestOf fallbackBestOf = TournamentBestOf.bestOf3,
    bool fallbackFinalBestOf5 = true,
  }) {
    final id = map['id'] as String?;
    if (id == null || id.isEmpty) return null;

    final entryFeeCents = (map['entryFeeCents'] as num?)?.toInt() ??
        (((map['entryFee'] as num?)?.toDouble() ?? 0) * 100).round();

    final bracketRaw = map['bracketFormat'] as String?;
    final hasCategoryBracket = bracketRaw != null && bracketRaw.isNotEmpty;
    final customFormatEnabled = map['customFormatEnabled'] as bool? ?? false;

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
      bracketSystem: hasCategoryBracket || customFormatEnabled
          ? _parseBracketSystem(bracketRaw)
          : fallbackBracketSystem,
      teamsPerGroup:
          (map['teamsPerGroup'] as num?)?.toInt() ?? fallbackTeamsPerGroup,
      qualifiersPerGroup: (map['qualifiersPerGroup'] as num?)?.toInt() ??
          fallbackQualifiersPerGroup,
      bestOf: map['bestOf'] != null
          ? _parseBestOf(map['bestOf'] as String?)
          : fallbackBestOf,
      finalBestOf5: map['finalBestOf5'] as bool? ?? fallbackFinalBestOf5,
      maxRegistrationsPerAthlete:
          (map['maxRegistrationsPerAthlete'] as num?)?.toInt() ?? 2,
      prizes: _parsePrizes(map['prizes']),
    );
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

  static TournamentBestOf _parseBestOf(String? raw) {
    for (final value in TournamentBestOf.values) {
      if (value.name == raw) return value;
    }
    return TournamentBestOf.bestOf3;
  }

  static TournamentPaymentMode _parsePaymentMode(String? raw) {
    for (final value in TournamentPaymentMode.values) {
      if (value.name == raw) return value;
    }
    return TournamentPaymentMode.appPixCard;
  }

  static TournamentVisibility _parseVisibility(String? raw) {
    for (final value in TournamentVisibility.values) {
      if (value.name == raw) return value;
    }
    return TournamentVisibility.publicListing;
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
      'intermediate' =>
        TournamentSkillLevel.intermediate,
      'avançado' || 'avancado' || 'advanced' => TournamentSkillLevel.advanced,
      'open' || 'livre' => TournamentSkillLevel.open,
      _ => TournamentSkillLevel.open,
    };
  }

  static Map<String, dynamic> _categoryToMap(
    TournamentCategoryDraft category, {
    required TournamentCreateDraft draft,
  }) {
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
      'uniformType': draft.uniformRequired ? 'top_only' : 'none',
      'uniformNameOnShirt':
          draft.uniformRequired && draft.uniformNameOnShirt,
      'uniformNumberOnShirt':
          draft.uniformRequired && draft.uniformNumberOnShirt,
    };
  }

  static String _disputeFormatValue(List<TournamentCategoryDraft> categories) {
    if (categories.any((c) => c.dispute == TournamentCategoryDispute.individual)) {
      return 'individual';
    }
    return 'dupla';
  }

  static String _formatDateRange(DateTime start, DateTime end) {
    if (start.year == end.year &&
        start.month == end.month &&
        start.day == end.day) {
      return _dateFmt.format(start);
    }
    return '${_dateFmt.format(start)} – ${_dateFmt.format(end)}';
  }
}
