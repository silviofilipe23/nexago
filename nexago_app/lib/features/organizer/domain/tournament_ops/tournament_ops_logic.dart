import '../../../tournaments/domain/tournament_detail_logic.dart';
import 'tournament_ops_models.dart';

String organizerTournamentShareLink(String tournamentId) =>
    'https://nexago.app/torneios/$tournamentId';

String organizerTournamentRegistrationShareLink(String tournamentId) =>
    'nexago:///torneios/$tournamentId/inscricao';

String organizerTournamentRegistrationShareMessage({
  required String tournamentName,
  required String tournamentId,
}) {
  final link = organizerTournamentRegistrationShareLink(tournamentId);
  return 'Inscreva-se no $tournamentName no NexaGO:\n$link';
}

OrganizerTournamentListingBadge tournamentListingBadge(String listingStatus) {
  return switch (listingStatus.trim().toLowerCase()) {
    'open' => OrganizerTournamentListingBadge.registrationsOpen,
    'draft' => OrganizerTournamentListingBadge.draft,
    'cancelled' => OrganizerTournamentListingBadge.cancelled,
    _ => OrganizerTournamentListingBadge.registrationsClosed,
  };
}

String tournamentListingBadgeLabel(OrganizerTournamentListingBadge badge) =>
    switch (badge) {
      OrganizerTournamentListingBadge.registrationsOpen =>
        'Inscrições abertas',
      OrganizerTournamentListingBadge.registrationsClosed =>
        'Inscrições encerradas',
      OrganizerTournamentListingBadge.draft => 'Rascunho',
      OrganizerTournamentListingBadge.cancelled => 'Cancelado',
    };

String tournamentContextBadge({
  required bool isLeagueStage,
  int? leagueStageOrder,
}) {
  if (isLeagueStage && leagueStageOrder != null) {
    return 'TORNEIO · $leagueStageOrder ETAPA';
  }
  return 'TORNEIO';
}

String tournamentMetaLine({
  required String locationName,
  required String city,
  required String state,
  required String dateLabel,
}) {
  final parts = <String>[
    if (locationName.trim().isNotEmpty) locationName.trim(),
    if (city.trim().isNotEmpty) city.trim(),
    if (state.trim().isNotEmpty) state.trim(),
    if (dateLabel.trim().isNotEmpty) dateLabel.trim(),
  ];
  return parts.join(' · ');
}

String formatOrganizerMoneyCents(int cents) {
  if (cents <= 0) return 'R\$ 0';
  final reais = cents / 100;
  if (reais >= 1000) {
    final k = reais / 1000;
    return 'R\$ ${k.toStringAsFixed(k.truncateToDouble() == k ? 0 : 1)}K';
  }
  return 'R\$ ${reais.toStringAsFixed(reais.truncateToDouble() == reais ? 0 : 2)}';
}

int netTransferCents(int collectedCents, {double feeRate = 0.06}) {
  if (collectedCents <= 0) return 0;
  return (collectedCents * (1 - feeRate)).round();
}

OrganizerCategoryBracketStatus parseBracketStatus(String? raw) =>
    switch (raw?.trim().toLowerCase()) {
      'draft' => OrganizerCategoryBracketStatus.draft,
      'published' => OrganizerCategoryBracketStatus.published,
      _ => OrganizerCategoryBracketStatus.none,
    };

String categoryBracketStatusLabel(OrganizerCategoryBracketStatus status) =>
    switch (status) {
      OrganizerCategoryBracketStatus.none => 'Chave não gerada',
      OrganizerCategoryBracketStatus.draft => 'Chave em rascunho',
      OrganizerCategoryBracketStatus.published => 'Chave publicada',
    };

String categoryReadyHint(OrganizerTournamentCategorySummary category) {
  if (category.bracketStatus == OrganizerCategoryBracketStatus.published) {
    return 'Chave publicada · ver jogos';
  }
  if (category.isFull) {
    return 'Inscrições lotadas · pronto pra sortear a chave';
  }
  if (category.registrationClosed) {
    return 'Inscrições encerradas';
  }
  return '${category.enrolledCount}/${category.maxTeams} duplas';
}

bool categoryUsesDoubleElimination(String bracketFormat) =>
    isDoubleEliminationBracketFormat(bracketFormat);

String generateBracketRouteFormat(String bracketFormat) =>
    categoryUsesDoubleElimination(bracketFormat)
        ? 'double_elimination'
        : 'groups_knockout';

OrganizerTournamentSummary buildTournamentSummary({
  required String tournamentId,
  required Map<String, dynamic> data,
  required List<OrganizerTournamentCategorySummary> categories,
  required int paidCount,
  required int pendingCount,
  required int collectedCents,
}) {
  return OrganizerTournamentSummary(
    tournamentId: tournamentId,
    name: (data['name'] as String?) ?? 'Torneio',
    locationName: (data['locationName'] as String?) ??
        (data['location'] as String?) ??
        '',
    city: (data['city'] as String?) ?? '',
    state: (data['state'] as String?) ?? '',
    dateLabel: (data['dateLabel'] as String?) ?? '',
    listingStatus: (data['listingStatus'] as String?) ?? 'open',
    leagueStageOrder: (data['leagueStageOrder'] as num?)?.toInt(),
    isLeagueStage: data['isLeagueStage'] as bool? ?? false,
    enrolledCount: paidCount,
    pendingCount: pendingCount,
    categoryCount: categories.length,
    collectedCents: collectedCents,
    defaultEntryFeeCents:
        (data['defaultEntryFeeCents'] as num?)?.toInt() ?? 0,
    courtsCount: (data['courtsCount'] as num?)?.toInt() ?? 4,
    bracketSystem: (data['bracketSystem'] as String?) ?? '',
  );
}

OrganizerTournamentCategorySummary buildCategorySummary({
  required Map<String, dynamic> categoryMap,
  required int paidCount,
  required int pendingCount,
  required int collectedCents,
  OrganizerCategoryBracketStatus bracketStatus =
      OrganizerCategoryBracketStatus.none,
}) {
  final id = (categoryMap['id'] as String?) ??
      (categoryMap['categoryName'] as String?) ??
      '';
  final name = (categoryMap['categoryName'] as String?) ??
      (categoryMap['name'] as String?) ??
      id;
  final maxTeams = (categoryMap['maxTeams'] as num?)?.toInt() ??
      (categoryMap['spotsTotal'] as num?)?.toInt() ??
      16;
  final entryFee = (categoryMap['entryFeeCents'] as num?)?.toInt() ??
      (((categoryMap['entryFee'] as num?)?.toDouble() ?? 0) * 100).round();

  return OrganizerTournamentCategorySummary(
    categoryId: id,
    name: name,
    genderLabel: (categoryMap['genderType'] as String?) ?? '',
    disputeLabel: _disputeLabel(categoryMap['disputeType'] as String?),
    levelLabel: (categoryMap['level'] as String?) ?? 'Open',
    bracketFormat: (categoryMap['bracketFormat'] as String?) ?? '',
    maxTeams: maxTeams,
    enrolledCount: paidCount + pendingCount,
    paidCount: paidCount,
    pendingCount: pendingCount,
    collectedCents: collectedCents,
    entryFeeCents: entryFee,
    registrationClosed: categoryMap['registrationClosed'] as bool? ?? false,
    bracketStatus: bracketStatus,
  );
}

String _disputeLabel(String? raw) => switch (raw?.trim().toLowerCase()) {
      'individual' => 'Individual',
      _ => 'Dupla',
    };
