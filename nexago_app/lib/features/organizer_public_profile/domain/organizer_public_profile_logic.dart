import '../../../core/search/search_keywords.dart';
import '../../../core/text/safe_display_text.dart';
import '../../../core/time/nexago_event_timezone.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart';
import '../../organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';
import '../../tournaments/domain/tournament_detail_model.dart';
import '../../tournaments/domain/tournament_listing_status.dart';
import '../../tournaments/domain/tournament_review_models.dart';
import 'organizer_event.dart';
import 'organizer_public_profile_models.dart';

/// Regras de exibição do perfil público do organizador e da lista "Organizadores" — spec
/// `docs/superpowers/specs/2026-10-02-organizer-public-profile-design.md`, seção "O que o
/// atleta vê". Tudo puro: nada aqui lê relógio ou Firestore.

// ── Formatação ───────────────────────────────────────────────────────────────

/// "38", "1.240", "12,4 mil", "1,2 mi". Trunca (nunca arredonda pra cima): "9,9 mil" nunca vira
/// "10 mil" com 9.950 seguidores.
String formatOrganizerCount(int value) {
  final n = value < 0 ? 0 : value;
  if (n < 10000) return _groupThousands(n);
  if (n < 1000000) return '${_oneDecimalFloor(n / 1000)} mil';
  return '${_oneDecimalFloor(n / 1000000)} mi';
}

String _groupThousands(int n) {
  final digits = '$n';
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write('.');
    buffer.write(digits[i]);
  }
  return buffer.toString();
}

String _oneDecimalFloor(double value) {
  if (value >= 100) return '${value.floor()}';
  final tenths = (value * 10).floor();
  final whole = tenths ~/ 10;
  final decimal = tenths % 10;
  return decimal == 0 ? '$whole' : '$whole,$decimal';
}

/// "Goiânia · GO"; partes vazias somem. `null` sem nenhuma das duas.
String? organizerLocationLine(String? city, String? state) {
  final parts = [
    if (city != null && city.trim().isNotEmpty) city.trim(),
    if (state != null && state.trim().isNotEmpty) state.trim().toUpperCase(),
  ];
  return parts.isEmpty ? null : parts.join(' · ');
}

/// "Organizador desde 2021" — ano do primeiro evento listado, no fuso dos eventos.
String? organizerSinceLabel(DateTime? since) {
  if (since == null) return null;
  return 'Organizador desde ${toNexagoEventLocal(since).year}';
}

const _initialsStopWords = {'de', 'da', 'do', 'das', 'dos', 'e', '&'};

/// "Liga Amadora Goiânia" → "LAG"; "Arena Sul" → "AS"; "Fulano" → "FU". Conectores ficam de fora.
String organizerInitials(String name) {
  final words = sanitizeUtf16(
    name,
  ).trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
  if (words.isEmpty) return '?';
  final significant = words
      .where((w) => !_initialsStopWords.contains(w.toLowerCase()))
      .toList();
  final source = significant.isEmpty ? words : significant;
  if (source.length == 1) return firstGraphemesUpper(source.first, 2);
  return source.take(3).map((w) => firstGraphemesUpper(w, 1)).join();
}

const _sportLabels = {
  'beachvolleyball': 'Vôlei de praia',
  'indoorvolleyball': 'Vôlei de quadra',
  'footvolley': 'Futevôlei',
  'beachtennis': 'Beach Tennis',
  'padel': 'Padel',
};

/// Rótulo do código de `tournaments.sport` (camelCase do `TournamentSport`). Código fora do mapa
/// sai como veio — melhor o código cru que um chip vazio.
String organizerSportLabel(String code) {
  final key = code.trim().toLowerCase();
  return _sportLabels[key] ?? code.trim();
}

/// `https://wa.me/{dígitos}`, ou `null` sem número que abra conversa (DDI + DDD + 8/9 dígitos).
Uri? organizerWhatsappUri(String? whatsapp) {
  final digits = (whatsapp ?? '').replaceAll(RegExp(r'\D'), '');
  if (digits.length < 12) return null;
  return Uri.parse('https://wa.me/$digits');
}

// ── Cabeçalho ────────────────────────────────────────────────────────────────

class OrganizerHeaderStat {
  const OrganizerHeaderStat({
    required this.value,
    required this.label,
    this.isRating = false,
  });

  final String value;
  final String label;

  /// A nota leva estrela ao lado do número.
  final bool isRating;
}

/// Reputação pública: média presente e 3+ avaliações (abaixo disso o servidor já zera a média).
bool organizerHasPublicReputation(OrganizerReputation? reputation) =>
    reputation != null &&
    reputation.average != null &&
    reputation.reviewsCount >= kTournamentReviewMinPublic;

/// Eventos realizados, atletas, nota média (só com reputação pública) e seguidores.
List<OrganizerHeaderStat> organizerHeaderStats(
  OrganizerPublicProfile profile,
  OrganizerReputation? reputation,
) {
  return [
    OrganizerHeaderStat(
      value: formatOrganizerCount(profile.stats.eventsCompleted),
      label: profile.stats.eventsCompleted == 1
          ? 'Evento realizado'
          : 'Eventos realizados',
    ),
    OrganizerHeaderStat(
      value: formatOrganizerCount(profile.stats.athletes),
      label: profile.stats.athletes == 1 ? 'Atleta' : 'Atletas',
    ),
    if (organizerHasPublicReputation(reputation))
      OrganizerHeaderStat(
        value: formatTournamentReviewAverage(reputation!.average!),
        label: 'Nota média',
        isRating: true,
      ),
    OrganizerHeaderStat(
      value: formatOrganizerCount(profile.followersCount),
      label: profile.followersCount == 1 ? 'Seguidor' : 'Seguidores',
    ),
  ];
}

// ── Eventos ──────────────────────────────────────────────────────────────────

/// O evento já terminou no relógio (fim efetivo no passado).
bool organizerEventEnded(OrganizerEvent event, DateTime now) {
  final start = event.detail.startDate;
  final end = event.detail.endDate ?? start;
  return tournamentEffectiveEndAt(start, end).isBefore(now);
}

/// Próximos: abertos ou fechados que ainda não terminaram, do mais cedo ao mais tarde.
List<OrganizerEvent> organizerUpcomingEvents(
  List<OrganizerEvent> events,
  DateTime now,
) {
  final upcoming = [
    for (final event in events)
      if (event.listing != OrganizerEventListing.completed &&
          !organizerEventEnded(event, now))
        event,
  ];
  upcoming.sort((a, b) => a.detail.startDate.compareTo(b.detail.startDate));
  return upcoming;
}

/// Realizados (`listingStatus == completed`, a mesma régua de `stats.eventsCompleted`), do mais
/// recente ao mais antigo.
List<OrganizerEvent> organizerCompletedEvents(List<OrganizerEvent> events) {
  final completed = [
    for (final event in events)
      if (event.listing == OrganizerEventListing.completed) event,
  ];
  completed.sort((a, b) => b.detail.startDate.compareTo(a.detail.startDate));
  return completed;
}

/// Preenchimento a partir do qual o card diz "Últimas vagas".
const double kOrganizerEventLastSpotsThreshold = 0.8;

enum OrganizerEventBadge {
  registrationOpen('Inscrições abertas'),
  lastSpots('Últimas vagas'),
  live('Ao vivo'),
  comingSoon('Em breve'),
  registrationClosed('Inscrições encerradas');

  const OrganizerEventBadge(this.label);

  final String label;
}

/// Selo do card de evento. Ordem: no dia do evento é "Ao vivo"; evento fechado (ou com prazo de
/// inscrição vencido) é "Inscrições encerradas"; `registrationOpensAt` futuro é "Em breve";
/// preenchimento ≥ 80% é "Últimas vagas"; senão "Inscrições abertas".
OrganizerEventBadge organizerEventBadge(
  OrganizerEvent event, {
  required int enrolled,
  required int capacity,
  required DateTime now,
}) {
  final detail = event.detail;
  if (isTournamentEventDay(
    startAt: detail.startDate,
    endAt: detail.endDate,
    now: now,
  )) {
    return OrganizerEventBadge.live;
  }
  if (event.listing != OrganizerEventListing.open) {
    return OrganizerEventBadge.registrationClosed;
  }
  if (tournamentRegistrationNotYetOpen(detail.registrationOpensAt, now: now)) {
    return OrganizerEventBadge.comingSoon;
  }
  final closesAt = detail.registrationClosesAt;
  if (closesAt != null && !closesAt.isAfter(now)) {
    return OrganizerEventBadge.registrationClosed;
  }
  if (organizerEventFill(enrolled: enrolled, capacity: capacity) >=
      kOrganizerEventLastSpotsThreshold) {
    return OrganizerEventBadge.lastSpots;
  }
  return OrganizerEventBadge.registrationOpen;
}

/// "Inscrever" só com inscrição aberta; o resto é "Acompanhar". Os dois levam ao evento.
bool organizerEventCtaIsRegister(OrganizerEventBadge badge) =>
    badge == OrganizerEventBadge.registrationOpen ||
    badge == OrganizerEventBadge.lastSpots;

/// Fração preenchida (0–1). Capacidade desconhecida é 0.
double organizerEventFill({required int enrolled, required int capacity}) {
  if (capacity <= 0) return 0;
  return (enrolled / capacity).clamp(0.0, 1.0);
}

/// "Torneio · Vôlei de praia" ou "Liga · Etapa 5 · Beach Tennis".
String organizerEventTypeLabel(TournamentDetail detail) {
  final isLeague = (detail.leagueId ?? '').trim().isNotEmpty;
  final order = detail.leagueStageOrder;
  final type = !isLeague
      ? 'Torneio'
      : (order != null && order > 0 ? 'Liga · Etapa $order' : 'Liga');
  final sport = detail.sport.trim();
  return sport.isEmpty ? type : '$type · ${organizerSportLabel(sport)}';
}

/// "a partir de R$ 140 por dupla" — "por inscrição" quando há categoria de equipe (trio+).
/// `null` sem preço definido.
String? organizerEventPriceLabel(TournamentDetail detail) {
  if (detail.priceValue <= 0) return null;
  final unit = detail.categoryOffers.any((c) => c.isTeamCategory)
      ? 'inscrição'
      : 'dupla';
  return 'a partir de ${detail.priceLabel} por $unit';
}

const _shortMonths = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/// "14 fev 2026", "02–03 mai 2026", "30 abr – 02 mai 2026". Sem [withYear], o ano some.
/// Meses escritos à mão (o `MMM` do intl põe ponto). Datas na parede do evento (SP).
String organizerEventDateLabel(
  TournamentDetail detail, {
  bool withYear = true,
}) {
  final start = toNexagoEventLocal(detail.startDate);
  final end = toNexagoEventLocal(detail.endDate ?? detail.startDate);
  String day(DateTime d) => d.day.toString().padLeft(2, '0');
  String month(DateTime d) => _shortMonths[d.month - 1];
  final year = withYear ? ' ${end.year}' : '';
  final sameDay =
      start.year == end.year &&
      start.month == end.month &&
      start.day == end.day;
  if (sameDay || end.isBefore(start)) {
    return '${day(start)} ${month(start)}${withYear ? ' ${start.year}' : ''}';
  }
  if (start.year == end.year && start.month == end.month) {
    return '${day(start)}–${day(end)} ${month(end)}$year';
  }
  if (start.year == end.year) {
    return '${day(start)} ${month(start)} – ${day(end)} ${month(end)}$year';
  }
  final startYear = withYear ? ' ${start.year}' : '';
  return '${day(start)} ${month(start)}$startYear – ${day(end)} ${month(end)}$year';
}

/// "Campeões: Lima / Prado" da primeira categoria com campeão de nome conhecido. `null` sem
/// nenhum.
String? organizerEventChampionLine(
  OrganizerEvent event,
  Map<String, String> teamNames,
) {
  for (final champion in event.champions) {
    final name = teamNames[champion.teamId]?.trim() ?? '';
    if (name.isNotEmpty) return 'Campeões: $name';
  }
  return null;
}

/// Campeões de todas as categorias com nome conhecido, para a aba Resultados.
List<({String category, String team})> organizerEventChampionRows(
  OrganizerEvent event,
  Map<String, String> teamNames,
) {
  return [
    for (final champion in event.champions)
      if ((teamNames[champion.teamId]?.trim() ?? '').isNotEmpty)
        (
          category: champion.categoryName.isEmpty
              ? 'Categoria'
              : champion.categoryName,
          team: teamNames[champion.teamId]!.trim(),
        ),
  ];
}

/// Ids de equipe campeã dos eventos — chave da busca de nomes.
Set<String> organizerChampionTeamIds(List<OrganizerEvent> events) => {
  for (final event in events)
    for (final champion in event.champions) champion.teamId,
};

// ── Reputação ────────────────────────────────────────────────────────────────

/// Rótulo curto do aspecto no perfil do organizador (decisão do dono).
String organizerAspectLabel(TournamentReviewAspect aspect) => switch (aspect) {
  TournamentReviewAspect.organization => 'Organização',
  TournamentReviewAspect.schedule => 'Pontualidade',
  TournamentReviewAspect.refereeing => 'Arbitragem',
  TournamentReviewAspect.venue => 'Estrutura',
  TournamentReviewAspect.prizes => 'Premiação',
};

class OrganizerAspectRow {
  const OrganizerAspectRow({required this.label, required this.average});

  final String label;
  final double average;

  String get valueText => formatTournamentReviewAverage(average);

  double get fraction => (average / 5).clamp(0.0, 1.0);
}

class OrganizerDistributionRow {
  const OrganizerDistributionRow({
    required this.stars,
    required this.count,
    required this.fraction,
  });

  final int stars;
  final int count;
  final double fraction;
}

class OrganizerReputationView {
  const OrganizerReputationView({
    required this.average,
    required this.reviewsCount,
    required this.aspects,
    required this.distribution,
  });

  final double average;
  final int reviewsCount;
  final List<OrganizerAspectRow> aspects;

  /// De 5 a 1 estrela.
  final List<OrganizerDistributionRow> distribution;

  String get averageText => formatTournamentReviewAverage(average);

  String get countLabel => tournamentReviewsCountLabel(reviewsCount);
}

/// Card/aba de reputação. `null` sem reputação pública ("Ainda sem avaliações suficientes").
OrganizerReputationView? organizerReputationView(
  OrganizerReputation? reputation,
) {
  if (!organizerHasPublicReputation(reputation)) return null;
  final r = reputation!;
  final aspects = r.aspects ?? const {};
  final distribution = r.distribution ?? const {};
  final total = distribution.values.fold<int>(0, (sum, n) => sum + n);
  return OrganizerReputationView(
    average: r.average!,
    reviewsCount: r.reviewsCount,
    aspects: [
      for (final aspect in TournamentReviewAspect.values)
        if (aspects[aspect] case final stat?)
          OrganizerAspectRow(
            label: organizerAspectLabel(aspect),
            average: stat.average,
          ),
    ],
    distribution: [
      for (var stars = 5; stars >= 1; stars--)
        OrganizerDistributionRow(
          stars: stars,
          count: distribution[stars] ?? 0,
          fraction: total <= 0 ? 0 : (distribution[stars] ?? 0) / total,
        ),
    ],
  );
}

class OrganizerEventReviewRow {
  const OrganizerEventReviewRow({
    required this.tournamentId,
    required this.name,
    required this.average,
    required this.count,
    this.dateLabel,
  });

  final String tournamentId;
  final String name;
  final double average;
  final int count;
  final String? dateLabel;

  String get averageText => formatTournamentReviewAverage(average);

  String get countLabel => tournamentReviewsCountLabel(count);
}

/// Nota por evento: só resumos fechados com 3+ avaliações. Do evento mais recente ao mais antigo
/// (data do evento listado; sem ele, vai para o fim pelo nome).
List<OrganizerEventReviewRow> organizerEventReviewRows(
  List<TournamentReviewSummary> summaries,
  Map<String, OrganizerEvent> eventsById,
) {
  final rows =
      <({OrganizerEventReviewRow row, DateTime? startAt})>[
        for (final summary in summaries)
          if (!summary.isOpen && tournamentReviewHasPublicNumbers(summary))
            (
              row: OrganizerEventReviewRow(
                tournamentId: summary.tournamentId,
                name: summary.tournamentName.isNotEmpty
                    ? summary.tournamentName
                    : (eventsById[summary.tournamentId]?.detail.name ??
                          'Evento'),
                average: summary.average!,
                count: summary.count,
                dateLabel: eventsById[summary.tournamentId] == null
                    ? null
                    : organizerEventDateLabel(
                        eventsById[summary.tournamentId]!.detail,
                      ),
              ),
              startAt: eventsById[summary.tournamentId]?.detail.startDate,
            ),
      ]..sort((a, b) {
        final sa = a.startAt;
        final sb = b.startAt;
        if (sa != null && sb != null) return sb.compareTo(sa);
        if (sa != null) return -1;
        if (sb != null) return 1;
        return a.row.name.compareTo(b.row.name);
      });
  return [for (final r in rows) r.row];
}

// ── Lista "Organizadores" ────────────────────────────────────────────────────

String _foldForSearch(String text) => text
    .split(RegExp(r'\s+'))
    .map(normalizeSearchTerm)
    .where((t) => t.isNotEmpty)
    .join(' ');

/// Busca no cliente por nome e cidade, sem acento nem caixa: cada palavra da busca precisa
/// aparecer em algum lugar ("goi liga" acha "Liga Amadora Goiânia").
List<OrganizerPublicProfile> filterOrganizersDirectory(
  List<OrganizerPublicProfile> organizers,
  String query,
) {
  final tokens = _foldForSearch(
    query,
  ).split(' ').where((t) => t.isNotEmpty).toList();
  if (tokens.isEmpty) return organizers;
  return [
    for (final organizer in organizers)
      if (_matchesAll(
        _foldForSearch(
          '${organizer.name} ${organizer.city ?? ''} ${organizer.state ?? ''}',
        ),
        tokens,
      ))
        organizer,
  ];
}

bool _matchesAll(String haystack, List<String> tokens) {
  for (final token in tokens) {
    if (!haystack.contains(token)) return false;
  }
  return true;
}

/// Ordem da lista: com inscrição aberta primeiro, depois mais seguidores, depois nome.
List<OrganizerPublicProfile> sortOrganizersDirectory(
  List<OrganizerPublicProfile> organizers,
) {
  final sorted = [...organizers];
  sorted.sort((a, b) {
    final aOpen = a.stats.openEvents > 0 ? 0 : 1;
    final bOpen = b.stats.openEvents > 0 ? 0 : 1;
    if (aOpen != bOpen) return aOpen.compareTo(bOpen);
    final byFollowers = b.followersCount.compareTo(a.followersCount);
    if (byFollowers != 0) return byFollowers;
    return _foldForSearch(a.name).compareTo(_foldForSearch(b.name));
  });
  return sorted;
}

/// "3 com inscrição aberta" / "1 com inscrição aberta"; `null` sem nenhuma.
String? organizerOpenEventsLabel(int openEvents) {
  if (openEvents <= 0) return null;
  return '$openEvents com inscrição aberta';
}

/// Linha de números do card da lista: "★ 4,8 · 38 eventos · 2.100 seguidores". A nota só entra
/// com reputação pública.
String organizerDirectoryMetaLine(
  OrganizerPublicProfile profile,
  OrganizerReputation? reputation,
) {
  final events = profile.stats.eventsCompleted;
  final followers = profile.followersCount;
  return [
    if (organizerHasPublicReputation(reputation))
      '★ ${formatTournamentReviewAverage(reputation!.average!)}',
    '${formatOrganizerCount(events)} ${events == 1 ? 'evento' : 'eventos'}',
    '${formatOrganizerCount(followers)} '
        '${followers == 1 ? 'seguidor' : 'seguidores'}',
  ].join(' · ');
}

/// Nome na linha "Organizado por" do torneio: o da marca quando o perfil público é exibível
/// (`isOrganizer`); senão o nome de antes (perfil do usuário / e-mail).
String organizerDisplayNameFor(
  OrganizerPublicProfile? profile, {
  required String fallback,
}) {
  if (profile != null && profile.isDisplayable) return profile.name;
  return fallback;
}
