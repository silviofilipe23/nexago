import 'dart:math';

import 'package:intl/intl.dart';

import '../../../tournaments/domain/tournament_detail_logic.dart';
import '../tournament_create/tournament_create_logic.dart';
import '../tournament_ops/tournament_ops_models.dart';
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

/// Paridade com `generateCategoryBracket` (CF): pago, fora da fila, dupla completa.
bool isTeamEligibleForBracketDraw(OrganizerCategoryTeamRow team) {
  if (team.status != OrganizerTeamRegistrationStatus.confirmed) return false;
  if (team.partnerPending) return false;
  return true;
}

List<OrganizerCategoryTeamRow> teamsEligibleForBracketDraw(
  Iterable<OrganizerCategoryTeamRow> teams,
) =>
    teams.where(isTeamEligibleForBracketDraw).toList(growable: false);

Set<String> publishedBracketTeamIds(CategoryOpsState ops) {
  final ids = <String>{};
  for (final seed in ops.seeds) {
    final id = seed.trim();
    if (id.isNotEmpty) ids.add(id);
  }
  for (final group in ops.groupsPreview) {
    for (final teamId in group.teamIds) {
      final id = teamId.trim();
      if (id.isNotEmpty) ids.add(id);
    }
  }
  return ids;
}

/// Após chave publicada, só participantes da chave aparecem na categoria.
List<OrganizerCategoryTeamRow> visibleCategoryTeams({
  required List<OrganizerCategoryTeamRow> teams,
  required CategoryOpsState? ops,
}) {
  if (ops?.bracketStatus != CategoryBracketStatus.published) {
    return teams;
  }
  final allowed = publishedBracketTeamIds(ops!);
  if (allowed.isEmpty) return teams;
  return teams
      .where((t) => allowed.contains(t.teamId))
      .toList(growable: false);
}

List<String> filterSeedTeamIdsToEligible(
  List<String> seedTeamIds,
  Iterable<OrganizerCategoryTeamRow> eligibleTeams,
) {
  final eligibleIds = eligibleTeams.map((t) => t.teamId).toSet();
  return seedTeamIds
      .where((id) => eligibleIds.contains(id))
      .toList(growable: false);
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

const kOrganizerDirectPaymentMethod = 'organizer_direct';

/// `paidAmount` no Firestore é em reais; o app trabalha em centavos.
int inscriptionPaidAmountCents(num? paidAmountReais) {
  if (paidAmountReais == null) return 0;
  final reais = paidAmountReais.toDouble();
  if (reais <= 0) return 0;
  return (reais * 100).round();
}

String paymentMethodLabel(String method) {
  return switch (method.trim().toLowerCase()) {
    'pix' => 'Pix',
    'card' || 'credit_card' => 'Cartão',
    kOrganizerDirectPaymentMethod => 'Direto com você',
    '' => 'Pix',
    _ => method.trim(),
  };
}

int teamCollectedCents(OrganizerCategoryTeamRow team) {
  if (team.status != OrganizerTeamRegistrationStatus.confirmed) return 0;
  if (team.paidAmountCents > 0) return team.paidAmountCents;
  return team.expectedAmountCents;
}

OrganizerPaymentChannel teamPaymentChannel(OrganizerCategoryTeamRow team) {
  final method = team.paymentMethod.trim().toLowerCase();
  if (method == kOrganizerDirectPaymentMethod) {
    return OrganizerPaymentChannel.viaOrganizer;
  }
  if (team.paidAmountCents > 0) return OrganizerPaymentChannel.viaApp;
  return OrganizerPaymentChannel.viaOrganizer;
}

({OrganizerPaymentChannel channel, int cents})? confirmedInscriptionPayment({
  required Map<String, dynamic> inscription,
  required int entryFeeCents,
}) {
  if (inscription['waitlist'] == true) return null;
  if (inscription['isPaid'] != true) return null;
  final paidCents =
      inscriptionPaidAmountCents(inscription['paidAmount'] as num?);
  final method =
      (inscription['paymentMethod'] as String?)?.trim().toLowerCase() ?? '';
  final cents = paidCents > 0 ? paidCents : entryFeeCents;
  final channel = method == kOrganizerDirectPaymentMethod
      ? OrganizerPaymentChannel.viaOrganizer
      : paidCents > 0
          ? OrganizerPaymentChannel.viaApp
          : OrganizerPaymentChannel.viaOrganizer;
  return (channel: channel, cents: cents);
}

OrganizerPaymentsBreakdown buildPaymentsBreakdown({
  required List<OrganizerCategoryTeamRow> teams,
  required int expectedPerTeamCents,
  double feeRate = 0.06,
}) {
  var viaApp = 0;
  var viaOrganizer = 0;
  var paid = 0;
  var pending = 0;
  for (final team in teams) {
    if (team.status == OrganizerTeamRegistrationStatus.confirmed) {
      paid++;
      final amount = teamCollectedCents(team);
      switch (teamPaymentChannel(team)) {
        case OrganizerPaymentChannel.viaApp:
          viaApp += amount;
        case OrganizerPaymentChannel.viaOrganizer:
          viaOrganizer += amount;
      }
    } else if (team.status == OrganizerTeamRegistrationStatus.pending) {
      pending++;
    }
  }
  final expected = teams.length * expectedPerTeamCents;
  return OrganizerPaymentsBreakdown(
    viaAppCents: viaApp,
    viaOrganizerCents: viaOrganizer,
    expectedCents: expected,
    paidCount: paid,
    totalSlots: teams.length,
    pendingCount: pending,
    feeRate: feeRate,
  );
}

/// Alias legado.
OrganizerPaymentsBreakdown buildPaymentsSummary({
  required List<OrganizerCategoryTeamRow> teams,
  required int expectedPerTeamCents,
  double feeRate = 0.06,
}) =>
    buildPaymentsBreakdown(
      teams: teams,
      expectedPerTeamCents: expectedPerTeamCents,
      feeRate: feeRate,
    );

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
    // copyWith, não reconstrução campo a campo: a versão manual esquecia
    // `partnerPending`, `lgpdAcceptedUids` e o pedido de cancelamento, e a
    // dupla cabeça de chave perdia esses dados na tela do organizador.
    ordered.add(team.copyWith(seedRank: i + 1));
    byTeamId.remove(seedTeamIds[i]);
  }
  ordered.addAll(byTeamId.values);
  return ordered;
}

List<String> defaultSeedOrderByRanking(List<OrganizerCategoryTeamRow> teams) {
  final sorted = sortCategoryTeams(teams, OrganizerTeamSort.ranking);
  return sorted.map((t) => t.teamId).toList(growable: false);
}

/// Estrutura de uma chave eliminatória para N duplas: tamanho (potência de 2),
/// byes (vagas vazias) e nº de rodadas.
({int bracketSize, int byes, int rounds}) bracketStructure(int teamCount) {
  if (teamCount < 2) return (bracketSize: 0, byes: 0, rounds: 0);
  var size = 1;
  var rounds = 0;
  while (size < teamCount) {
    size *= 2;
    rounds++;
  }
  return (bracketSize: size, byes: size - teamCount, rounds: rounds);
}

/// Resumo legível da estrutura da chave (para a prévia da geração).
String bracketStructureSummary(int teamCount) {
  if (teamCount < 2) return 'Mínimo de 2 duplas para gerar a chave.';
  final s = bracketStructure(teamCount);
  if (s.byes == 0) {
    return '$teamCount duplas · chave de ${s.bracketSize} · sem byes';
  }
  final byeWord = s.byes == 1 ? 'bye' : 'byes';
  final advWord = s.byes == 1 ? 'avança' : 'avançam';
  return '$teamCount duplas · chave de ${s.bracketSize} · '
      '${s.byes} $byeWord (top ${s.byes} $advWord direto)';
}

/// Quantidade default de grupos para a prévia: distribui as duplas em grupos
/// de no máximo [teamsPerGroup] duplas (arredondando para cima).
int defaultGroupCountForCategory({
  required int teamCount,
  required int teamsPerGroup,
}) {
  if (teamCount <= 0) return 1;
  final perGroup = teamsPerGroup < 2 ? 4 : teamsPerGroup;
  return ((teamCount + perGroup - 1) ~/ perGroup).clamp(1, teamCount);
}

/// Total de classificados no mata-mata (grupos × classificados por grupo).
int totalKnockoutQualifiers({
  required int groupCount,
  required int qualifiersPerGroup,
}) =>
    groupCount * qualifiersPerGroup;

/// Mata-mata equilibrado exige TOTAL de classificados potência de 2 (2, 4,
/// 8…). O teste antigo de `total >> 1` aceitava totais ímpares (3, 5…) por
/// causa do arredondamento — mesma regra do servidor
/// (`isBalancedQualifierTotal`) e do portal web.
bool isBalancedKnockoutQualifierCount(int totalQualifiers) {
  return totalQualifiers >= 2 &&
      (totalQualifiers & (totalQualifiers - 1)) == 0;
}

/// Cabeça de chave na prévia: top [primaryHeadCount] da ordem de seeds (1 por grupo).
bool isGroupDrawPrimaryHead({
  required int? seedRank,
  required int primaryHeadCount,
}) {
  if (seedRank == null || primaryHeadCount < 1) return false;
  return seedRank <= primaryHeadCount;
}

/// Rótulo de badge na prévia do sorteio: cabeça (`C1`) ou posição global (`#8`).
String groupDrawTeamBadgeLabel({
  required OrganizerCategoryTeamRow team,
  required Map<String, int> overallRankByTeamId,
  required int primaryHeadCount,
}) {
  if (isGroupDrawPrimaryHead(
    seedRank: team.seedRank,
    primaryHeadCount: primaryHeadCount,
  )) {
    return 'C${team.seedRank}';
  }
  return '#${overallRankByTeamId[team.teamId] ?? '?'}';
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

String organizerCategoryExploreTeamsSubtitle({
  required int teamCount,
  required int pendingCount,
}) {
  if (teamCount <= 0) return 'Nenhuma inscrição';
  if (pendingCount > 0) {
    final pendingLabel =
        pendingCount == 1 ? '1 pendente' : '$pendingCount pendentes';
    return teamCount == 1
        ? '1 dupla · $pendingLabel'
        : '$teamCount duplas · $pendingLabel';
  }
  return teamCount == 1 ? '1 dupla' : '$teamCount duplas';
}

String organizerCategoryExplorePaymentsSubtitle(
  OrganizerPaymentsBreakdown breakdown,
) {
  if (breakdown.totalCollectedCents <= 0) {
    if (breakdown.pendingCount > 0) {
      return breakdown.pendingCount == 1
          ? '1 pagamento pendente'
          : '${breakdown.pendingCount} pendentes';
    }
    return 'Nenhum pagamento';
  }
  final total = formatCategoryMoneyShort(breakdown.totalCollectedCents);
  if (breakdown.viaOrganizerCents > 0 && breakdown.viaAppCents > 0) {
    final direct = formatCategoryMoneyShort(breakdown.viaOrganizerCents);
    return '$total arrecadado · $direct direto';
  }
  if (breakdown.viaOrganizerCents > 0) {
    return '$total recebido direto';
  }
  return '$total arrecadado';
}

String organizerCategoryExploreBracketSubtitle(
  OrganizerCategoryBracketStatus status,
) =>
    switch (status) {
      OrganizerCategoryBracketStatus.none => 'Chave não gerada',
      OrganizerCategoryBracketStatus.draft => 'Chave em rascunho',
      OrganizerCategoryBracketStatus.published => 'Chave publicada',
    };

String organizerCategoryExploreMatchesSubtitle({
  required int total,
  required int live,
}) {
  if (total <= 0) return 'Aguardando chave publicada';
  if (live > 0) return '$total jogos · $live ao vivo';
  return total == 1 ? '1 jogo' : '$total jogos';
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
  final paymentLabel = paymentMethodLabel(team.paymentMethod);
  final cents = teamCollectedCents(team);
  final amount = formatCategoryMoneyCents(cents);
  final registered = team.registeredAt;
  if (registered == null) return '$paymentLabel · $amount';
  return '$paymentLabel · $amount · ${formatTeamRegistrationDate(registered)}';
}

/// A inscrição declarou o pagamento direto e o organizador ainda não deu baixa
/// ("A conferir" do portal web). `declaredPaidAt` — e não o método de pagamento
/// — é a âncora: inscrição direta anterior a este fluxo não entra
/// retroativamente numa fila de conferência que ninguém vai fazer.
bool teamAwaitsPaymentVerification(OrganizerCategoryTeamRow team) =>
    team.declaredPaidAt != null && !team.paymentVerifiedByOrganizer;

/// Pagamento resolvido: a vaga está garantida (`isPaid`) E não sobrou
/// conferência pendente. É o estado em que não há mais nada a confirmar.
bool isTeamPaymentSettled(OrganizerCategoryTeamRow team) =>
    team.status == OrganizerTeamRegistrationStatus.confirmed &&
    !teamAwaitsPaymentVerification(team);

OrganizerAthletePaymentState athletePaymentState(
  OrganizerCategoryTeamRow team,
  String athleteUid,
) {
  final uid = athleteUid.trim();
  if (uid.isEmpty) return OrganizerAthletePaymentState.pending;
  if (team.organizerConfirmedShareUids.contains(uid)) {
    return OrganizerAthletePaymentState.organizerConfirmed;
  }
  if (team.sharePaidUids.contains(uid)) {
    return OrganizerAthletePaymentState.declared;
  }
  return OrganizerAthletePaymentState.pending;
}

/// Espelha `bulkConfirmBlockedByPartialShare` (CF): parte do elenco já quitou a
/// própria parte e parte não. Confirmar "a inscrição inteira" nesse estado
/// marcaria como pago quem não pagou — a callable RECUSA
/// (`failed-precondition`), então a ação em bloco some da tela.
bool teamHasPartialPayment(OrganizerCategoryTeamRow team) {
  final uids = team.participantUids;
  if (uids.length <= 1) return false;
  if (team.sharePaidUids.isEmpty) return false;
  return !uids.every(team.sharePaidUids.contains);
}

/// Confirmar/desfazer por atleta só faz sentido em dupla que ainda não fechou:
/// "a conferir" já é elenco completo declarado e "pago" não tem mais o que
/// dividir.
bool showsAthletePaymentBreakdown(OrganizerCategoryTeamRow team) {
  if (team.participantUids.length <= 1) return false;
  if (teamAwaitsPaymentVerification(team)) return false;
  return team.status != OrganizerTeamRegistrationStatus.confirmed;
}

/// Quantos atletas da inscrição já quitaram a própria parte.
int teamSharePaidCount(OrganizerCategoryTeamRow team) =>
    team.participantUids.where(team.sharePaidUids.contains).length;

/// Selo do pagamento parcial na lista ("1/2 PAGO") — sem ele o organizador só
/// descobre quem pagou pela metade abrindo dupla por dupla.
String teamPartialPaymentLabel(OrganizerCategoryTeamRow team) =>
    '${teamSharePaidCount(team)}/${team.participantUids.length} PAGO';

String athletePaymentStateLabel(OrganizerAthletePaymentState state) =>
    switch (state) {
      OrganizerAthletePaymentState.organizerConfirmed => 'Confirmado por você',
      OrganizerAthletePaymentState.declared =>
        'Declarado pelo atleta · aguardando conferência',
      OrganizerAthletePaymentState.pending => 'Pagamento pendente',
    };

/// Rótulo do botão do atleta. Em quem já declarou, o organizador não está
/// lançando um pagamento novo: está dando baixa numa declaração.
String athletePaymentActionLabel(OrganizerAthletePaymentState state) =>
    switch (state) {
      OrganizerAthletePaymentState.organizerConfirmed => 'Desfazer',
      OrganizerAthletePaymentState.declared => 'Confirmar recebimento',
      OrganizerAthletePaymentState.pending => 'Confirmar pagamento',
    };

/// Rótulo da ação em bloco — mesma distinção do rótulo por atleta, agora no
/// nível da inscrição (todo mundo declarou, falta a baixa).
String teamConfirmPaymentActionLabel(OrganizerCategoryTeamRow team) =>
    teamAwaitsPaymentVerification(team)
        ? 'Confirmar recebimento'
        : 'Confirmar pagamento';

int teamCombinedRankingPoints(OrganizerCategoryTeamRow team) =>
    team.player1.rankingPoints + team.player2.rankingPoints;

String teamReceivedPaymentSubtitle(OrganizerCategoryTeamRow team) {
  final paymentLabel = paymentMethodLabel(team.paymentMethod);
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
    teamCollectedCents(team);

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
