import 'package:intl/intl.dart';

import '../league_create/league_create_draft.dart';
import '../tournament_create/tournament_create_draft.dart';
import '../tournament_create/tournament_create_logic.dart';
import 'league_stage_create_draft.dart';

String leagueStageFormatStepLabel(LeagueStageCreateStep step) =>
    'PASSO ${step.number} DE ${LeagueStageCreateStepX.total}';

String leagueStageStepTitle(LeagueStageCreateStep step) => switch (step) {
      LeagueStageCreateStep.location => 'Local e datas',
      LeagueStageCreateStep.categoriesRegistration => 'Categorias & inscrições',
      LeagueStageCreateStep.review => 'Publicar a etapa',
    };

String leagueStageStepSubtitle(LeagueStageCreateStep step) => switch (step) {
      LeagueStageCreateStep.location =>
        'O resto (categorias, formato, ranking) já vem da liga.',
      LeagueStageCreateStep.categoriesRegistration =>
        'Escolha quais categorias abrem nesta etapa e ajuste as vagas.',
      LeagueStageCreateStep.review =>
        'Confira — preço, formato e ranking seguem a liga.',
    };

String stageOrderHint(LeagueStageCreateDraft draft) {
  final order = draft.stage.order;
  if (draft.stage.isGrandFinal) {
    return 'Grande Final da temporada.';
  }
  return 'Etapa $order da temporada.';
}

String leagueContextLabel(LeagueStageCreateDraft draft) {
  final name = draft.leagueName.trim();
  if (name.isEmpty) return 'Liga';
  return name;
}

/// Prioriza slot pending sem torneio; senão append com ordem incrementada.
LeagueStageDraft resolveTargetStage(List<LeagueStageDraft> existingStages) {
  final sorted = [...existingStages]..sort((a, b) => a.order.compareTo(b.order));

  for (final stage in sorted) {
    if (stage.status == LeagueStageStatus.pending &&
        stage.tournamentIds.isEmpty) {
      return stage;
    }
  }

  final regular = sorted.where((s) => !s.isGrandFinal).toList();
  final maxOrder = regular.isEmpty
      ? 0
      : regular.map((s) => s.order).reduce((a, b) => a > b ? a : b);
  final nextOrder = maxOrder + 1;

  return LeagueStageDraft(
    id: 'stage-$nextOrder',
    name: 'Etapa $nextOrder',
    order: nextOrder,
    status: LeagueStageStatus.pending,
  );
}

String defaultStageName(LeagueStageDraft stage) {
  if (stage.name.trim().isNotEmpty) return stage.name.trim();
  if (stage.isGrandFinal) return 'Grande Final';
  return 'Etapa ${stage.order}';
}

bool hasMeaningfulLocalStageDraft(LeagueStageCreateDraft draft) =>
    draft.leagueId.isNotEmpty &&
    (draft.stage.name.trim().isNotEmpty ||
        draft.stage.locationName.trim().isNotEmpty);

bool canContinueFromStageStep(
  LeagueStageCreateDraft draft,
  LeagueStageCreateStep step,
) {
  return switch (step) {
    LeagueStageCreateStep.location =>
      draft.stage.name.trim().isNotEmpty &&
          draft.stage.city.trim().isNotEmpty &&
          draft.stage.locationName.trim().isNotEmpty &&
          draft.stage.startAt != null &&
          draft.stage.endAt != null &&
          !draft.stage.endAt!.isBefore(draft.stage.startAt!) &&
          draft.courtsCount >= 1,
    LeagueStageCreateStep.categoriesRegistration =>
      draft.enabledCategoriesCount > 0 &&
          draft.registrationOpensAt != null &&
          draft.registrationClosesAt != null &&
          !draft.registrationClosesAt!
              .isBefore(draft.registrationOpensAt!),
    LeagueStageCreateStep.review => isValidStageForPublish(draft),
  };
}

bool isValidStageForPublish(LeagueStageCreateDraft draft) {
  return canContinueFromStageStep(draft, LeagueStageCreateStep.location) &&
      canContinueFromStageStep(
        draft,
        LeagueStageCreateStep.categoriesRegistration,
      );
}

String formatStageShortDate(DateTime? date) {
  if (date == null) return '—';
  return DateFormat('dd MMM', 'pt_BR').format(date);
}

String formatStageDateRange(DateTime? start, DateTime? end) {
  if (start == null) return 'Datas a definir';
  if (end == null) return formatStageShortDate(start);
  final startFmt = DateFormat("d", 'pt_BR').format(start);
  final endFmt = DateFormat("d 'de' MMMM", 'pt_BR').format(end);
  if (start.month == end.month && start.year == end.year) {
    return '$startFmt a $endFmt';
  }
  final startFull = DateFormat("d 'de' MMMM", 'pt_BR').format(start);
  return '$startFull a $endFmt';
}

String formatRegistrationRange(DateTime? opens, DateTime? closes) {
  if (opens == null) return 'Período a definir';
  final openFmt = DateFormat('dd MMM', 'pt_BR').format(opens);
  if (closes == null) return openFmt;
  final closeFmt = DateFormat('dd MMM', 'pt_BR').format(closes);
  return '$openFmt–$closeFmt';
}

String reviewStageLeagueSummary(LeagueStageCreateDraft draft) {
  final name = draft.leagueName.trim();
  final order = draft.stage.order;
  final total = draft.plannedStagesCount;
  if (draft.stage.isGrandFinal) {
    return '$name · Grande Final';
  }
  return '$name · Etapa $order de $total';
}

String reviewStageLocationSummary(LeagueStageCreateDraft draft) {
  final location = [
    if (draft.stage.locationName.isNotEmpty) draft.stage.locationName,
    if (draft.stage.city.isNotEmpty) draft.stage.city,
  ].join(', ');
  final dates = formatStageDateRange(draft.stage.startAt, draft.stage.endAt);
  return '$location · $dates';
}

String reviewStageCategoriesSummary(LeagueStageCreateDraft draft) {
  final enabled = draft.categories.where((c) => c.enabled).toList();
  if (enabled.isEmpty) return 'Nenhuma categoria ativa';
  final names = enabled.map((c) => c.name).take(2).join(' + ');
  final extra = enabled.length > 2 ? ' + ${enabled.length - 2}' : '';
  final spots = draft.totalEnabledSpots;
  return '$names$extra · $spots vagas';
}

String reviewStageRegistrationSummary(LeagueStageCreateDraft draft) {
  final range =
      formatRegistrationRange(draft.registrationOpensAt, draft.registrationClosesAt);
  final price = formatCents(draft.defaultPriceCents);
  return '$range · $price (preço da liga)';
}

String reviewStageFormatSummary(LeagueStageCreateDraft draft) {
  final enabled = draft.categories.where((c) => c.enabled).toList();
  if (enabled.isEmpty) return 'Formato por categoria';
  final formats = enabled
      .map((c) => '${c.name.trim()}: ${bracketSystemShortLabel(c.bracketSystem)}')
      .join(' · ');
  return '$formats · pontos somam no circuito';
}

TournamentBracketSystem _parseBracketFormat(String? raw) {
  return switch (raw) {
    'groups_knockout' => TournamentBracketSystem.groupsThenKnockout,
    'single_elimination' => TournamentBracketSystem.singleElimination,
    'round_robin' => TournamentBracketSystem.roundRobin,
    'groups_repechage' => TournamentBracketSystem.groupsWithRepechage,
    'double_elimination' => TournamentBracketSystem.doubleElimination,
    _ => TournamentBracketSystem.groupsThenKnockout,
  };
}

TournamentBestOf _parseBestOf(String? raw) {
  for (final value in TournamentBestOf.values) {
    if (value.name == raw) return value;
  }
  return TournamentBestOf.bestOf3;
}

List<LeagueStageCategoryDraft> categoriesFromLeagueCategories(
  List<dynamic> categoriesRaw,
  int defaultPriceCents,
) {
  return categoriesRaw.whereType<Map>().map((raw) {
    final map = Map<String, dynamic>.from(raw);
    final id = (map['id'] as String?) ?? '';
    if (id.isEmpty) return null;

    final name = (map['categoryName'] as String?) ??
        (map['name'] as String?) ??
        '';
    final spots = (map['maxTeams'] as num?)?.toInt() ??
        (map['spotsTotal'] as num?)?.toInt() ??
        16;
    final price = (map['entryFeeCents'] as num?)?.toInt() ?? defaultPriceCents;
    final bracketRaw = map['bracketFormat'] as String?;

    return LeagueStageCategoryDraft(
      categoryId: id,
      name: name,
      enabled: true,
      spots: spots,
      priceCents: price,
      bracketSystem: bracketRaw != null && bracketRaw.isNotEmpty
          ? _parseBracketFormat(bracketRaw)
          : TournamentBracketSystem.groupsThenKnockout,
      teamsPerGroup: (map['teamsPerGroup'] as num?)?.toInt() ?? 4,
      qualifiersPerGroup: (map['qualifiersPerGroup'] as num?)?.toInt() ?? 2,
      bestOf: _parseBestOf(map['bestOf'] as String?),
      finalBestOf5: map['finalBestOf5'] as bool? ?? true,
    );
  }).whereType<LeagueStageCategoryDraft>().toList();
}

List<LeagueStageDraft> stagesFromLeagueData(List<dynamic>? stagesRaw) {
  if (stagesRaw is! List) return const [];

  return stagesRaw.whereType<Map>().map((raw) {
    final map = Map<String, dynamic>.from(raw);
    final id = (map['id'] as String?) ?? '';
    if (id.isEmpty) return null;

    final idsRaw = map['tournamentIds'];
    final ids = <String>[];
    if (idsRaw is List) {
      for (final e in idsRaw) {
        if (e is String && e.isNotEmpty) ids.add(e);
      }
    }

    return LeagueStageDraft(
      id: id,
      name: (map['name'] as String?) ?? '',
      order: (map['order'] as num?)?.toInt() ?? 1,
      status: (map['status'] as String?) == 'defined'
          ? LeagueStageStatus.defined
          : LeagueStageStatus.pending,
      isGrandFinal: map['isGrandFinal'] as bool? ?? false,
      locationName: (map['locationName'] as String?) ?? '',
      city: (map['city'] as String?) ?? '',
      state: (map['state'] as String?) ?? '',
      dateLabel: (map['dateLabel'] as String?) ?? '',
      tournamentIds: ids,
    );
  }).whereType<LeagueStageDraft>().toList();
}
