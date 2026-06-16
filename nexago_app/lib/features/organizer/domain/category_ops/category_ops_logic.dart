import 'dart:math';

import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_detail_logic.dart';
import '../tournament_create/tournament_create_logic.dart';
import 'category_ops_models.dart';

String formatCategoryMoneyCents(int cents) {
  if (cents <= 0) return 'R\$ 0';
  final reais = cents / 100;
  return 'R\$ ${reais.toStringAsFixed(reais.truncateToDouble() == reais ? 0 : 2)}';
}

String formatCategoryMoneyShort(int cents) {
  if (cents <= 0) return 'R\$ 0';
  final reais = cents / 100;
  if (reais >= 1000) {
    final k = reais / 1000;
    return 'R\$ ${k.toStringAsFixed(k.truncateToDouble() == k ? 0 : 1)}K';
  }
  return formatCategoryMoneyCents(cents);
}

OrganizerTeamRegistrationStatus registrationStatusFromInscription(
  Map<String, dynamic> data,
) {
  if (data['waitlist'] == true) {
    return OrganizerTeamRegistrationStatus.waitlist;
  }
  if (data['isPaid'] == true) {
    return OrganizerTeamRegistrationStatus.confirmed;
  }
  return OrganizerTeamRegistrationStatus.pending;
}

List<OrganizerCategoryTeamRow> filterCategoryTeams(
  List<OrganizerCategoryTeamRow> teams,
  OrganizerCategoryTeamFilter filter,
  String searchQuery,
) {
  final query = searchQuery.trim().toLowerCase();
  Iterable<OrganizerCategoryTeamRow> result = teams;

  result = switch (filter) {
    OrganizerCategoryTeamFilter.all => result,
    OrganizerCategoryTeamFilter.seeds => result.where(
      (t) => t.seedRank != null,
    ),
    OrganizerCategoryTeamFilter.pending => result.where(
      (t) => t.status == OrganizerTeamRegistrationStatus.pending,
    ),
    OrganizerCategoryTeamFilter.waitlist => result.where(
      (t) => t.status == OrganizerTeamRegistrationStatus.waitlist,
    ),
  };

  if (query.isNotEmpty) {
    result = result.where(
      (t) =>
          t.displayName.toLowerCase().contains(query) ||
          t.player1.name.toLowerCase().contains(query) ||
          t.player2.name.toLowerCase().contains(query),
    );
  }

  return result.toList(growable: false);
}

List<OrganizerCategoryTeamRow> sortCategoryTeams(
  List<OrganizerCategoryTeamRow> teams,
  OrganizerTeamSort sort,
) {
  final copy = [...teams];
  copy.sort((a, b) {
    return switch (sort) {
      OrganizerTeamSort.registrationOrder =>
        (a.registeredAt ?? DateTime(2100)).compareTo(
          b.registeredAt ?? DateTime(2100),
        ),
      OrganizerTeamSort.ranking =>
        (b.player1.rankingPoints + b.player2.rankingPoints).compareTo(
          a.player1.rankingPoints + a.player2.rankingPoints,
        ),
    };
  });
  return copy;
}

OrganizerCategoryPaymentsSummary buildPaymentsSummary({
  required List<OrganizerCategoryTeamRow> teams,
  required int expectedPerTeamCents,
  double feeRate = 0.06,
}) {
  var collected = 0;
  var paid = 0;
  var pending = 0;
  for (final team in teams) {
    if (team.status == OrganizerTeamRegistrationStatus.confirmed) {
      paid++;
      collected += team.paidAmountCents > 0
          ? team.paidAmountCents
          : expectedPerTeamCents;
    } else if (team.status == OrganizerTeamRegistrationStatus.pending) {
      pending++;
    }
  }
  final expected = teams.length * expectedPerTeamCents;
  return OrganizerCategoryPaymentsSummary(
    collectedCents: collected,
    expectedCents: expected,
    paidCount: paid,
    totalSlots: teams.length,
    pendingCount: pending,
    feeRate: feeRate,
  );
}

CategoryOpsState categoryOpsFromMap(Map<String, dynamic>? raw) {
  if (raw == null || raw.isEmpty) return const CategoryOpsState();

  final seedsRaw = raw['seeds'];
  final seeds = <String>[];
  if (seedsRaw is List) {
    for (final e in seedsRaw) {
      if (e is String && e.isNotEmpty) seeds.add(e);
    }
  }

  final groupsRaw = raw['groupsPreview'];
  final groups = <CategoryGroupPreview>[];
  if (groupsRaw is List) {
    for (final g in groupsRaw) {
      if (g is! Map) continue;
      final map = Map<String, dynamic>.from(g);
      final id = (map['id'] as String?) ?? '';
      final teamIdsRaw = map['teamIds'];
      final teamIds = <String>[];
      if (teamIdsRaw is List) {
        for (final t in teamIdsRaw) {
          if (t is String && t.isNotEmpty) teamIds.add(t);
        }
      }
      if (id.isNotEmpty) {
        groups.add(CategoryGroupPreview(id: id, teamIds: teamIds));
      }
    }
  }

  final bracketConfig = raw['bracketConfig'];
  Map<String, dynamic> config = {};
  if (bracketConfig is Map) {
    config = Map<String, dynamic>.from(bracketConfig);
  }

  return CategoryOpsState(
    seeds: seeds,
    seedByRanking: raw['seedByRanking'] as bool? ?? true,
    bracketStatus: _parseBracketStatus(raw['bracketStatus'] as String?),
    bracketFormatOverride: (raw['bracketFormatOverride'] as String?) ?? '',
    winnersAdvantage: config['winnersAdvantage'] as bool? ?? true,
    phaseBestOf: (config['phaseBestOf'] as String?) ?? 'md3',
    finalBestOf5: config['finalBestOf5'] as bool? ?? true,
    thirdPlaceEnabled: config['thirdPlaceEnabled'] as bool? ?? false,
    groupsPreview: groups,
  );
}

CategoryBracketStatus _parseBracketStatus(String? raw) =>
    switch (raw?.trim().toLowerCase()) {
      'draft' => CategoryBracketStatus.draft,
      'published' => CategoryBracketStatus.published,
      _ => CategoryBracketStatus.none,
    };

Map<String, dynamic> categoryOpsToMap(CategoryOpsState state) => {
  'seeds': state.seeds,
  'seedByRanking': state.seedByRanking,
  'bracketStatus': state.bracketStatus.name,
  if (state.bracketFormatOverride.isNotEmpty)
    'bracketFormatOverride': state.bracketFormatOverride,
  'bracketConfig': {
    'winnersAdvantage': state.winnersAdvantage,
    'phaseBestOf': state.phaseBestOf,
    'finalBestOf5': state.finalBestOf5,
    'thirdPlaceEnabled': state.thirdPlaceEnabled,
  },
  'groupsPreview': state.groupsPreview
      .map((g) => {'id': g.id, 'teamIds': g.teamIds})
      .toList(),
};

List<OrganizerCategoryTeamRow> applySeedOrder(
  List<OrganizerCategoryTeamRow> teams,
  List<String> seedTeamIds,
) {
  if (seedTeamIds.isEmpty) return teams;
  final byTeamId = {for (final t in teams) t.teamId: t};
  final ordered = <OrganizerCategoryTeamRow>[];
  for (var i = 0; i < seedTeamIds.length; i++) {
    final team = byTeamId[seedTeamIds[i]];
    if (team == null) continue;
    ordered.add(
      OrganizerCategoryTeamRow(
        registrationId: team.registrationId,
        teamId: team.teamId,
        player1: team.player1,
        player2: team.player2,
        status: team.status,
        seedRank: i + 1,
        paidAmountCents: team.paidAmountCents,
        expectedAmountCents: team.expectedAmountCents,
        registeredAt: team.registeredAt,
        paymentMethod: team.paymentMethod,
      ),
    );
    byTeamId.remove(seedTeamIds[i]);
  }
  ordered.addAll(byTeamId.values);
  return ordered;
}

List<String> defaultSeedOrderByRanking(List<OrganizerCategoryTeamRow> teams) {
  final sorted = sortCategoryTeams(teams, OrganizerTeamSort.ranking);
  return sorted.map((t) => t.teamId).toList(growable: false);
}

/// Distribui duplas em grupos (padrão A/B) com snake draft quando há seeds.
List<CategoryGroupPreview> distributeTeamsIntoGroups({
  required List<String> teamIds,
  required List<String> seedTeamIds,
  required bool respectSeeds,
  int groupCount = 2,
  Random? random,
}) {
  if (teamIds.isEmpty || groupCount < 1) return const [];

  final rng = random ?? Random();
  final groups = List.generate(
    groupCount,
    (index) => CategoryGroupPreview(
      id: String.fromCharCode(65 + index),
      teamIds: const [],
    ),
  );

  List<String> ordered;
  if (respectSeeds && seedTeamIds.isNotEmpty) {
    final remaining = teamIds.toSet();
    ordered = <String>[];
    for (final seed in seedTeamIds) {
      if (remaining.remove(seed)) ordered.add(seed);
    }
    final rest = remaining.toList()..shuffle(rng);
    ordered.addAll(rest);
  } else {
    ordered = [...teamIds]..shuffle(rng);
  }

  final buckets = List<List<String>>.generate(groupCount, (_) => []);
  for (var i = 0; i < ordered.length; i++) {
    final round = i ~/ groupCount;
    final posInRound = i % groupCount;
    final groupIndex =
        round.isEven ? posInRound : groupCount - 1 - posInRound;
    buckets[groupIndex].add(ordered[i]);
  }

  return [
    for (var i = 0; i < groupCount; i++)
      CategoryGroupPreview(id: groups[i].id, teamIds: buckets[i]),
  ];
}

int categoryShellTabCount(OrganizerCategoryShellTab tab) => switch (tab) {
  OrganizerCategoryShellTab.teams => 0,
  OrganizerCategoryShellTab.payments => 0,
  OrganizerCategoryShellTab.bracket => 0,
  OrganizerCategoryShellTab.matches => 0,
};

String categoryShellTabLabel(OrganizerCategoryShellTab tab, {int? count}) {
  final suffix = count != null && count > 0 ? ' ($count)' : '';
  return switch (tab) {
    OrganizerCategoryShellTab.teams => 'Duplas$suffix',
    OrganizerCategoryShellTab.payments => 'Pagamentos$suffix',
    OrganizerCategoryShellTab.bracket => 'Chave',
    OrganizerCategoryShellTab.matches => 'Jogos',
  };
}

String organizerTeamSortLabel(OrganizerTeamSort sort) => switch (sort) {
      OrganizerTeamSort.registrationOrder => 'Ordem de inscrição',
      OrganizerTeamSort.ranking => 'Ranking',
    };

String categoryBracketFormatLabel(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';

  final fromSystem = bracketFormatLabelFromRaw(trimmed);
  if (fromSystem != trimmed) return fromSystem;

  final legacy = bracketFormatLabel(trimmed);
  if (legacy.toLowerCase() != trimmed.toLowerCase()) return legacy;

  if (isDoubleEliminationBracketFormat(trimmed)) {
    return 'Dupla eliminatória';
  }

  return trimmed;
}

String categoryBracketFormatShortLabel(String raw) {
  final trimmed = raw.trim();
  if (trimmed.isEmpty) return '';

  final fromSystem = bracketFormatShortLabelFromRaw(trimmed);
  if (fromSystem != trimmed) return fromSystem;

  if (isDoubleEliminationBracketFormat(trimmed)) return 'Dupla elim.';

  final n = trimmed.toLowerCase();
  return switch (n) {
    'pool play + se' || 'group cross + play-in' => 'Grupos + SE',
    _ => categoryBracketFormatLabel(trimmed),
  };
}
int countTeamsByStatus(
  List<OrganizerCategoryTeamRow> teams,
  OrganizerTeamRegistrationStatus status,
) =>
    teams.where((t) => t.status == status).length;

final _teamActionsDateFmt = DateFormat('dd MMM', 'pt_BR');

String formatTeamRegistrationDate(DateTime date) {
  final raw = _teamActionsDateFmt.format(date);
  if (raw.isEmpty) return raw;
  return '${raw[0].toUpperCase()}${raw.substring(1)}';
}

String teamSeedActionSubtitle(int? seedRank) {
  if (seedRank == null) return 'Definir ordem no chaveamento';
  return 'Atual: ${seedRank}º cabeça da categoria';
}

String teamPaymentActionSubtitle(OrganizerCategoryTeamRow team) {
  final method = team.paymentMethod.trim();
  final paymentLabel = method.isNotEmpty ? method : 'Pix';
  final cents = team.paidAmountCents > 0
      ? team.paidAmountCents
      : team.expectedAmountCents;
  final amount = formatCategoryMoneyCents(cents);
  final registered = team.registeredAt;
  if (registered == null) return '$paymentLabel · $amount';
  return '$paymentLabel · $amount · ${formatTeamRegistrationDate(registered)}';
}

int teamCombinedRankingPoints(OrganizerCategoryTeamRow team) =>
    team.player1.rankingPoints + team.player2.rankingPoints;

String teamReceivedPaymentSubtitle(OrganizerCategoryTeamRow team) {
  final method = team.paymentMethod.trim();
  final paymentLabel = method.isNotEmpty ? method : 'Pix';
  final registered = team.registeredAt;
  if (registered == null) return paymentLabel;
  return '$paymentLabel · ${formatTeamRegistrationDate(registered)}';
}

String teamPendingPaymentSubtitle(OrganizerCategoryTeamRow team) {
  final registered = team.registeredAt;
  if (registered == null) return 'Aguardando pagamento';
  final due = registered.add(const Duration(days: 14));
  return 'Vence em ${formatTeamRegistrationDate(due)}';
}

int teamDisplayAmountCents(OrganizerCategoryTeamRow team) =>
    team.paidAmountCents > 0 ? team.paidAmountCents : team.expectedAmountCents;

String teamRankingPointsLabel(OrganizerCategoryTeamRow team) {
  final pts = teamCombinedRankingPoints(team);
  return '$pts pts no ranking';
}

String seedingCategoryEyebrow({
  String genderLabel = '',
  String levelLabel = 'Open',
}) {
  final gender = genderLabel.trim();
  final level = levelLabel.trim().toUpperCase();
  if (gender.isEmpty) return level;
  return '$gender · $level';
}

int seedingPrimaryHeadCount(CategoryOpsState? ops) {
  final groups = ops?.groupsPreview.length ?? 0;
  if (groups > 0) return groups.clamp(1, 8);
  return 4;
}
