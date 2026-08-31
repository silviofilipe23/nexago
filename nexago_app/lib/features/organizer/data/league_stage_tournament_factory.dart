import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:intl/intl.dart';

import '../../../core/search/search_keywords.dart';
import '../domain/league_create/league_create_draft.dart';
import '../domain/league_stage_create/league_stage_create_draft.dart';
import '../domain/match_ops/match_ops_logic.dart';
import '../domain/tournament_create/tournament_create_draft.dart';
import '../domain/tournament_create/tournament_create_logic.dart';

abstract final class LeagueStageTournamentFactory {
  LeagueStageTournamentFactory._();

  static final _dateFmt = DateFormat('dd/MM', 'pt_BR');

  /// Monta documento Firestore de torneio de etapa a partir da liga + etapa.
  static Map<String, dynamic> build({
    required LeagueCreateDraft league,
    required LeagueStageDraft stage,
    required String managerId,
    required String tournamentId,
  }) {
    final categories = league.categories.map(_categoryToMap).toList();
    final capacity = league.categories.fold<int>(0, (sum, c) => sum + c.spots);
    final startAt = stage.startAt ?? league.seasonStartAt ?? DateTime.now();
    final endAt = stage.endAt ?? stage.startAt ?? league.seasonEndAt ?? startAt;
    final name = stage.name.trim().isEmpty
        ? '${league.name.trim()} · Etapa ${stage.order}'
        : stage.name.trim();
    final locationName = stage.locationName.trim();
    final city =
        stage.city.trim().isEmpty ? league.city.trim() : stage.city.trim();
    final state =
        stage.state.trim().isEmpty ? league.state.trim() : stage.state.trim();

    return _baseTournamentMap(
      name: name,
      sport: league.sport,
      description: league.description,
      city: city,
      state: state,
      locationName: locationName,
      locationAddress: '',
      arenaId: null,
      startAt: startAt,
      endAt: endAt,
      dateLabel: stage.dateLabel.trim().isNotEmpty
          ? stage.dateLabel.trim()
          : _formatDateRange(startAt, endAt),
      courtsCount: 4,
      categories: categories,
      capacity: capacity > 0 ? capacity : 16,
      managerId: managerId,
      defaultPriceCents: league.defaultPriceCents,
      rankingTableId: league.rankingTableId,
      leagueId: league.leagueId ?? '',
      stage: stage,
      publish: true,
      registrationOpensAt: null,
      registrationClosesAt: null,
      paymentMode: TournamentPaymentMode.appPixCard,
      keywords: generateKeywords([
        name,
        league.name,
        locationName,
        city,
        ...league.categories.map((c) => c.name),
      ]),
    );
  }

  /// Monta torneio a partir do wizard D1–D3 (nova etapa pós-publish).
  static Map<String, dynamic> buildFromStageCreate({
    required LeagueStageCreateDraft draft,
    required String managerId,
    required String tournamentId,
    required bool publish,
  }) {
    final stage = draft.stage;
    final startAt = stage.startAt ?? DateTime.now();
    final endAt = stage.endAt ?? startAt;
    final name = stage.name.trim().isEmpty
        ? '${draft.leagueName.trim()} · Etapa ${stage.order}'
        : stage.name.trim();

    final categories = draft.categories.map(_stageCategoryToMap).toList();
    final capacity = draft.totalEnabledSpots;

    return _baseTournamentMap(
      name: name,
      sport: draft.sport,
      description: '',
      city: stage.city.trim().isEmpty ? draft.leagueCity : stage.city.trim(),
      state: stage.state.trim().isEmpty ? draft.leagueState : stage.state.trim(),
      locationName: stage.locationName.trim(),
      locationAddress: draft.locationAddress,
      arenaId: draft.arenaId,
      startAt: startAt,
      endAt: endAt,
      dateLabel: stage.dateLabel.trim().isNotEmpty
          ? stage.dateLabel.trim()
          : _formatDateRange(startAt, endAt),
      courtsCount: draft.courtsCount,
      categories: categories,
      capacity: capacity > 0 ? capacity : 16,
      managerId: managerId,
      defaultPriceCents: draft.defaultPriceCents,
      rankingTableId: draft.rankingTableId,
      leagueId: draft.leagueId,
      stage: stage,
      publish: publish,
      registrationOpensAt: draft.registrationOpensAt,
      registrationClosesAt: draft.registrationClosesAt,
      paymentMode: draft.paymentMode,
      keywords: generateKeywords([
        name,
        draft.leagueName,
        stage.locationName,
        stage.city,
        ...draft.categories.where((c) => c.enabled).map((c) => c.name),
      ]),
    );
  }

  static Map<String, dynamic> _baseTournamentMap({
    required String name,
    required TournamentSport sport,
    required String description,
    required String city,
    required String state,
    required String locationName,
    required String locationAddress,
    required String? arenaId,
    required DateTime startAt,
    required DateTime endAt,
    required String dateLabel,
    required int courtsCount,
    required List<Map<String, dynamic>> categories,
    required int capacity,
    required String managerId,
    required int defaultPriceCents,
    required String rankingTableId,
    required String leagueId,
    required LeagueStageDraft stage,
    required bool publish,
    required DateTime? registrationOpensAt,
    required DateTime? registrationClosesAt,
    required TournamentPaymentMode paymentMode,
    required List<String> keywords,
  }) {
    final listingStatus = publish ? 'open' : 'draft';

    return {
      'name': name,
      'sport': sport.name,
      'description': description.trim().isEmpty ? null : description.trim(),
      'city': city,
      'state': state.isEmpty ? null : state,
      'locationName': locationName,
      'location': locationName,
      'locationAddress':
          locationAddress.trim().isEmpty ? null : locationAddress.trim(),
      'arenaId': arenaId,
      'startAt': Timestamp.fromDate(startAt),
      'endAt': Timestamp.fromDate(endAt),
      'dateLabel': dateLabel,
      'courtsCount': courtsCount,
      'courts': MatchOpsLogic.defaultCourtsFromCount(courtsCount)
          .map((c) => c.toMap())
          .toList(),
      'format': _disputeFormatFromMaps(categories),
      'capacity': capacity,
      'enrolledCount': 0,
      'collectedCents': 0,
      'listingStatus': listingStatus,
      'status': listingStatus,
      'visibility': TournamentVisibility.publicListing.name,
      'featured': false,
      'liveMatchesNow': 0,
      'managerId': managerId,
      'categories': categories,
      'defaultEntryFeeCents': defaultPriceCents,
      'registrationOpensAt': registrationOpensAt != null
          ? Timestamp.fromDate(registrationOpensAt)
          : null,
      'registrationClosesAt': registrationClosesAt != null
          ? Timestamp.fromDate(registrationClosesAt)
          : null,
      'paymentMode': paymentMode.name,
      'waitlistEnabled': true,
      'inviteConfirmEnabled': false,
      // Etapa de liga não passa pelo wizard de torneio: nasce aceitando
      // inscrição individual (o padrão histórico).
      'requireFormedPair': false,
      'cashPrizesEnabled': false,
      'rankingEnabled': true,
      'rankingTableId': rankingTableId,
      'leagueId': leagueId,
      'leagueStageId': stage.id,
      'leagueStageOrder': stage.order,
      'leagueStageName': stage.name,
      'isLeagueStage': true,
      'isGrandFinalStage': stage.isGrandFinal,
      'keywords': keywords,
      'updatedAt': FieldValue.serverTimestamp(),
      'createdAt': FieldValue.serverTimestamp(),
    };
  }

  static Map<String, dynamic> _stageCategoryToMap(
    LeagueStageCategoryDraft category,
  ) {
    return {
      'id': category.categoryId,
      'categoryName': category.name.trim(),
      'genderType': isTeamDispute(category.dispute) && category.genderFree
          ? 'mixed'
          : genderTypeFirestoreValue(category.gender),
      'disputeType': category.dispute.name,
      'teamSize': disputeTeamSize(category.dispute),
      if (isTeamDispute(category.dispute)) ...{
        'genderMode': category.genderFree ? 'free' : 'composition',
        'genderComposition':
            category.genderFree ||
                category.menCount == null ||
                category.womenCount == null
            ? null
            : {'men': category.menCount, 'women': category.womenCount},
      },
      'ageBand': category.ageBand.name,
      'level': skillLevelLabel(category.skillLevel),
      // Faixa de nível herdada da liga — o app não a edita, só preserva o
      // que já estava no doc (ver `minLevel` em LeagueStageCategoryDraft).
      'minLevel': category.minLevel.isEmpty ? null : category.minLevel,
      'maxTeams': category.spots,
      'spotsTotal': category.spots,
      'spotsLeft': category.spots,
      'entryFee': category.priceCents / 100,
      'entryFeeCents': category.priceCents,
      'useDefaultPrice': true,
      'bracketFormat': bracketFormatFirestoreValue(category.bracketSystem),
      'teamsPerGroup': category.teamsPerGroup,
      'qualifiersPerGroup': category.qualifiersPerGroup,
      'bestOf': category.bestOf.name,
      'finalBestOf5': category.finalBestOf5,
      'maxRegistrationsPerAthlete': 2,
      'registrationClosed': !category.enabled,
      'isCompleted': false,
      'prizes': const [],
      'uniformType': null,
      'uniformNameOnShirt': false,
      'uniformNumberOnShirt': false,
    };
  }

  static Map<String, dynamic> _categoryToMap(TournamentCategoryDraft category) {
    return {
      'id': category.id,
      'categoryName': category.name.trim().isEmpty
          ? suggestCategoryName(category)
          : category.name.trim(),
      'genderType': isTeamDispute(category.dispute) && category.genderFree
          ? 'mixed'
          : genderTypeFirestoreValue(category.gender),
      'disputeType': category.dispute.name,
      'teamSize': disputeTeamSize(category.dispute),
      if (isTeamDispute(category.dispute)) ...{
        'genderMode': category.genderFree ? 'free' : 'composition',
        'genderComposition':
            category.genderFree ||
                category.menCount == null ||
                category.womenCount == null
            ? null
            : {'men': category.menCount, 'women': category.womenCount},
      },
      'ageBand': category.ageBand.name,
      'level': skillLevelLabel(category.skillLevel),
      // Faixa de nível gravada pelo portal web — o app não a edita, só
      // preserva o que já estava no doc (ver `minLevel` em TournamentCategoryDraft).
      'minLevel': category.minLevel.isEmpty ? null : category.minLevel,
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
      'prizes': const [],
      'uniformType': null,
      'uniformNameOnShirt': false,
      'uniformNumberOnShirt': false,
    };
  }

  static String _disputeFormatFromMaps(List<Map<String, dynamic>> categories) {
    for (final map in categories) {
      if (map['disputeType'] == TournamentCategoryDispute.individual.name) {
        return 'individual';
      }
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

  /// Converte etapa para mapa Firestore (embed em leagues.stages).
  static Map<String, dynamic> stageToFirestoreMap(
    LeagueStageDraft stage, {
    bool markDefined = false,
  }) {
    final status = markDefined ? 'defined' : stage.status.name;
    return {
      'id': stage.id,
      'name': stage.name,
      'order': stage.order,
      'status': status,
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
  }

  /// Merge etapa no array stages[] da liga.
  static List<Map<String, dynamic>> mergeStageIntoLeagueStages({
    required List<LeagueStageDraft> existingStages,
    required LeagueStageDraft updatedStage,
  }) {
    var found = false;
    final merged = existingStages.map((stage) {
      if (stage.id == updatedStage.id) {
        found = true;
        return stageToFirestoreMap(updatedStage, markDefined: true);
      }
      return stageToFirestoreMap(stage);
    }).toList();

    if (!found) {
      merged.add(stageToFirestoreMap(updatedStage, markDefined: true));
      merged.sort((a, b) {
        final ao = (a['order'] as num?)?.toInt() ?? 0;
        final bo = (b['order'] as num?)?.toInt() ?? 0;
        return ao.compareTo(bo);
      });
    }

    return merged;
  }
}
