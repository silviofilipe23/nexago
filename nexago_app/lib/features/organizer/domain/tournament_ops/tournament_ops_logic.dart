import '../../../tournaments/domain/tournament_detail_logic.dart';
import '../tournament_create/tournament_create_logic.dart';
import '../category_ops/category_ops_models.dart';
import 'tournament_ops_models.dart';

String organizerTournamentShareLink(String tournamentId) =>
    'https://nexago.app/torneios/$tournamentId';

/// Aba inicial do detalhe do organizador conforme a fase do torneio: dentro da
/// janela do evento (publicado + entre o início e o fim do dia), abre direto em
/// **Partidas** (operação do dia); fora disso, em **Categorias** (montagem).
OrganizerTournamentDetailTab defaultOrganizerDetailTab({
  required String listingStatus,
  DateTime? startAt,
  DateTime? endAt,
  required DateTime now,
}) {
  if (listingStatus.trim().toLowerCase() != 'open') {
    return OrganizerTournamentDetailTab.categories;
  }
  final start = startAt;
  if (start == null) return OrganizerTournamentDetailTab.categories;

  final windowStart = DateTime(start.year, start.month, start.day);
  final endBase = endAt ?? start;
  final windowEnd =
      DateTime(endBase.year, endBase.month, endBase.day, 23, 59, 59);
  final inWindow = !now.isBefore(windowStart) && !now.isAfter(windowEnd);
  return inWindow
      ? OrganizerTournamentDetailTab.matches
      : OrganizerTournamentDetailTab.categories;
}

String organizerExploreCategoriesSubtitle(int count) =>
    count == 1 ? '1 categoria' : '$count categorias';

String organizerExploreOverviewSubtitle(OrganizerTournamentSummary summary) {
  final registration = summary.listingStatus.trim().toLowerCase() == 'open'
      ? 'Inscrições abertas'
      : 'Inscrições encerradas';
  final date = summary.dateLabel.trim();
  if (date.isNotEmpty) return '$registration · $date';
  return registration;
}

String organizerExploreFinancialSubtitle(OrganizerPaymentsBreakdown breakdown) {
  if (breakdown.totalCollectedCents <= 0) return 'Nenhum pagamento ainda';
  final total = formatOrganizerMoneyShort(breakdown.totalCollectedCents);
  if (breakdown.viaOrganizerCents > 0) {
    final direct = formatOrganizerMoneyShort(breakdown.viaOrganizerCents);
    return '$total arrecadado · $direct direto';
  }
  return '$total arrecadado';
}

/// Formato abreviado (K) para KPIs do header e cards compactos.
String formatOrganizerMoneyShort(int cents) {
  if (cents <= 0) return 'R\$ 0';
  final reais = cents / 100;
  if (reais >= 1000) {
    final k = reais / 1000;
    return 'R\$ ${k.toStringAsFixed(k.truncateToDouble() == k ? 0 : 1)}K';
  }
  return formatOrganizerMoneyDetail(cents);
}

/// Valor completo para telas financeiras de detalhe.
String formatOrganizerMoneyDetail(int cents) {
  if (cents <= 0) return 'R\$ 0';
  final reais = cents / 100;
  return 'R\$ ${reais.toStringAsFixed(reais.truncateToDouble() == reais ? 0 : 2)}';
}

/// Alias legado — prefira [formatOrganizerMoneyShort] ou [formatOrganizerMoneyDetail].
String formatOrganizerMoneyCents(int cents) => formatOrganizerMoneyShort(cents);

int netTransferCents(int viaAppCents, {double feeRate = 0.06}) {
  if (viaAppCents <= 0) return 0;
  return (viaAppCents * (1 - feeRate)).round();
}

String organizerExploreMatchesSubtitle({
  required int total,
  required int live,
}) {
  if (total <= 0) return 'Operação do dia';
  if (live > 0) return '$total partidas · $live ao vivo';
  return total == 1 ? '1 partida' : '$total partidas';
}

String organizerExploreUniformsSubtitle({
  required int pendingCount,
  required int totalAthletes,
}) {
  if (totalAthletes <= 0) return 'Aguardando inscrições';
  if (pendingCount <= 0) return 'Todos confirmados';
  return pendingCount == 1 ? '1 pendente' : '$pendingCount pendentes';
}

/// Habilita atalhos de programação do dia quando ao menos uma categoria já
/// iniciou (chave publicada e partidas geradas).
bool organizerTournamentDayScheduleEnabled(
  List<OrganizerTournamentCategorySummary> categories,
) =>
    categories.any(
      (c) => c.bracketStatus == OrganizerCategoryBracketStatus.published,
    );

/// Novas categorias só podem ser criadas até o dia anterior ao início do
/// torneio (a partir do dia de início, o prazo encerra).
bool organizerCanAddTournamentCategory({
  required DateTime? startAt,
  DateTime? now,
}) {
  final start = startAt;
  if (start == null) return true;
  final clock = now ?? DateTime.now();
  final tournamentDayStart = DateTime(start.year, start.month, start.day);
  return clock.isBefore(tournamentDayStart);
}

/// Atalho "Dia do jogo" só aparece no dia do torneio ou depois que ele começou.
bool organizerTournamentMatchDayVisible({
  required DateTime? startAt,
  DateTime? now,
}) {
  final start = startAt;
  if (start == null) return false;
  final clock = now ?? DateTime.now();
  final tournamentDayStart = DateTime(start.year, start.month, start.day);
  return !clock.isBefore(tournamentDayStart);
}

String organizerTournamentRegistrationShareLink(String tournamentId) =>
    'nexago:///torneios/$tournamentId/inscricao';

String organizerTournamentRegistrationShareMessage({
  required String tournamentName,
  required String tournamentId,
}) {
  final link = organizerTournamentRegistrationShareLink(tournamentId);
  return 'Inscreva-se no $tournamentName no NexaGO:\n$link';
}

/// Mensagem amigável (PT) para erros ao gerenciar o torneio, a partir do
/// `code`/`message` de uma exceção do Firebase. [action] descreve a operação
/// no infinitivo (ex.: "encerrar as inscrições"). Pura para teste; a extração
/// de code/message fica na camada de UI.
String friendlyTournamentOpsError({
  required String action,
  String? code,
  String? message,
}) {
  final msg = message?.trim() ?? '';
  switch (code) {
    case 'unauthenticated':
      return 'Sua sessão expirou. Entre novamente para $action.';
    case 'permission-denied':
      return 'Você não tem permissão para $action.';
    case 'failed-precondition':
      return msg.isNotEmpty ? msg : 'Não foi possível $action agora.';
    case 'unavailable':
    case 'deadline-exceeded':
      return 'Sem conexão. Verifique a internet e tente de novo.';
  }
  return 'Não foi possível $action. Tente novamente.';
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
  return '${category.paidCount}/${category.maxTeams} confirmadas';
}

bool categoryUsesDoubleElimination(String bracketFormat) =>
    isDoubleEliminationBracketFormat(bracketFormat);

String generateBracketRouteFormat(String bracketFormat) {
  if (categoryUsesDoubleElimination(bracketFormat)) {
    return 'double_elimination';
  }
  if (bracketFormatHasGroupsPhase(bracketFormat)) {
    return 'groups_knockout';
  }
  return 'single_elimination';
}

/// Mínimo de duplas confirmadas para publicar qualquer formato de chave.
const int minTeamsToGenerateBracket = 2;

bool canGenerateCategoryBracket({
  required int confirmedCount,
  int minTeams = minTeamsToGenerateBracket,
}) =>
    confirmedCount >= minTeams;

bool showGenerateBracketCta(OrganizerTournamentCategorySummary category) =>
    category.bracketStatus != OrganizerCategoryBracketStatus.published;

bool showGenerateBracketQuickAction({
  required OrganizerTournamentCategorySummary category,
  required int eligibleConfirmedCount,
}) =>
    showGenerateBracketCta(category) &&
    isBracketFormatSupportedRaw(category.bracketFormat) &&
    canGenerateCategoryBracket(confirmedCount: eligibleConfirmedCount);

String generateBracketBlockedHint({
  required int confirmedCount,
  int minTeams = minTeamsToGenerateBracket,
  String? bracketFormat,
}) {
  final unsupported = bracketFormat == null
      ? null
      : unsupportedBracketFormatHint(bracketFormat);
  if (unsupported != null && unsupported.isNotEmpty) return unsupported;

  if (confirmedCount >= minTeams) return '';
  if (confirmedCount == 0) {
    return 'Precisa de pelo menos $minTeams duplas confirmadas para gerar a chave.';
  }
  final missing = minTeams - confirmedCount;
  return 'Falta $missing dupla(s) confirmada(s) para gerar a chave.';
}

OrganizerTournamentSummary buildTournamentSummary({
  required String tournamentId,
  required Map<String, dynamic> data,
  required List<OrganizerTournamentCategorySummary> categories,
  required int paidCount,
  required int pendingCount,
  required OrganizerPaymentsBreakdown paymentsBreakdown,
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
    collectedCents: paymentsBreakdown.totalCollectedCents,
    paymentsBreakdown: paymentsBreakdown,
    paymentMode: (data['paymentMode'] as String?) ?? '',
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
  int viaAppCents = 0,
  int viaOrganizerCents = 0,
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
    genderLabel: _categoryGenderDisplayLabel(categoryMap),
    disputeLabel: _disputeLabel(categoryMap['disputeType'] as String?),
    levelLabel: (categoryMap['level'] as String?) ?? 'Open',
    bracketFormat: (categoryMap['bracketFormat'] as String?) ?? '',
    maxTeams: maxTeams,
    enrolledCount: paidCount + pendingCount,
    paidCount: paidCount,
    pendingCount: pendingCount,
    collectedCents: collectedCents,
    viaAppCents: viaAppCents,
    viaOrganizerCents: viaOrganizerCents,
    entryFeeCents: entryFee,
    registrationClosed: categoryMap['registrationClosed'] as bool? ?? false,
    bracketStatus: bracketStatus,
  );
}

String _categoryGenderDisplayLabel(Map<String, dynamic> categoryMap) {
  final fromType = categoryGenderDisplayLabelFromRaw(
    (categoryMap['genderType'] as String?) ?? '',
  );
  if (fromType.isNotEmpty) return fromType;
  return categoryGenderDisplayLabelFromRaw(
    (categoryMap['categoryName'] as String?) ??
        (categoryMap['name'] as String?) ??
        '',
  );
}

String _disputeLabel(String? raw) => switch (raw?.trim().toLowerCase()) {
      'individual' => 'Individual',
      _ => 'Dupla',
    };
