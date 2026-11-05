/// Regras dos blocos nexaGO (Torneio, Arena, Ranking) na leitura. O status do
/// torneio sai da lógica que o Competir já usa — aqui só se escolhe o que
/// cabe no card.
library;

import '../../../core/sports/sport_catalog.dart';
import '../../arenas/domain/arena_court.dart';
import '../../arenas/domain/arena_slot.dart';
import '../../arenas/domain/slots_page_logic.dart';
import '../../ranking/domain/ranking_list_models.dart';
import '../../tournaments/domain/tournament_detail_logic.dart';
import '../../tournaments/domain/tournament_detail_model.dart';
import '../../tournaments/domain/tournament_discovery_labels.dart';
import '../../tournaments/domain/tournament_listing_status.dart';
import 'blog_post.dart';

/// O que o card do torneio mostra no cabeçalho.
class BlogTournamentCardStatus {
  const BlogTournamentCardStatus({
    required this.label,
    required this.registrationOpen,
    this.closesLabel,
  });

  /// "Inscrições abertas", "Inscrições em breve", "Em andamento"…
  final String label;

  /// Aceita inscrição agora: o botão vira "Inscrever minha dupla".
  final bool registrationOpen;

  /// "fecham em 6 dias" / "fecham amanhã" / "fecham hoje"; `null` sem prazo.
  final String? closesLabel;
}

/// Torneio que pode aparecer num post: existe e não é rascunho nem
/// cancelado (mesma regra do catálogo). "Por link" aparece: o post é um link.
bool blogTournamentVisible(TournamentDetail? t) =>
    t != null && isPubliclyListedTournament(t.listingStatusRaw ?? 'open');

BlogTournamentCardStatus blogTournamentCardStatus(
  TournamentDetail t, {
  required DateTime now,
}) {
  final notYetOpen = tournamentRegistrationNotYetOpen(
    t.registrationOpensAt,
    now: now,
  );
  final closesAt = t.registrationClosesAt;
  final deadlinePassed = closesAt != null && now.isAfter(closesAt);
  final open =
      canRegisterForTournament(t.status) &&
      !notYetOpen &&
      !deadlinePassed &&
      !isRegistrationListingClosed(t.listingStatusRaw);

  // Prazo vencido com o torneio ainda "aberto" no doc: o servidor já recusa
  // (`assertTournamentAcceptsRegistration`), então o card não promete vaga.
  final label = deadlinePassed && canRegisterForTournament(t.status)
      ? 'Inscrições encerradas'
      : tournamentStatusLabelFromRaw(
          status: t.status,
          listingStatusRaw: t.listingStatusRaw,
          registrationNotYetOpen: notYetOpen,
        );

  return BlogTournamentCardStatus(
    label: label,
    registrationOpen: open,
    closesLabel: open && closesAt != null
        ? blogClosesInLabel(closesAt, now)
        : null,
  );
}

/// "fecham hoje" / "fecham amanhã" / "fecham em N dias", pelo dia local.
String blogClosesInLabel(DateTime closesAt, DateTime now) {
  final a = now.toLocal();
  final b = closesAt.toLocal();
  final days =
      (DateTime(
                b.year,
                b.month,
                b.day,
              ).difference(DateTime(a.year, a.month, a.day)).inHours /
              24)
          .round();
  if (days <= 0) return 'fecham hoje';
  if (days == 1) return 'fecham amanhã';
  return 'fecham em $days dias';
}

/// Vagas restantes no torneio inteiro, só com a contagem real das
/// inscrições resolvida e capacidade conhecida (os contadores gravados no
/// doc do torneio não são mantidos). `null` = não mostrar.
int? blogTournamentSpotsLeft(
  TournamentDetail t, {
  required Map<String, int>? enrollmentByCategoryId,
}) {
  if (enrollmentByCategoryId == null) return null;
  final stats = tournamentDetailStats(
    t,
    enrollmentByCategoryId: enrollmentByCategoryId,
    enrollmentCountsResolved: true,
  );
  if (stats.spotsTotal <= 0) return null;
  final left = stats.spotsTotal - stats.spotsEnrolled;
  return left < 0 ? 0 : left;
}

/// Um horário livre de hoje no card da arena: o início e a quadra onde está
/// livre (a primeira, na ordem das quadras), para abrir a reserva já nele.
class BlogArenaFreeTime {
  const BlogArenaFreeTime({required this.slot});

  /// O slot livre (a tela de reservar abre já nele).
  final ArenaSlot slot;

  /// "HH:mm", como na grade.
  String get startTime => slot.startTime;
  String get courtId => slot.courtId;

  @override
  bool operator ==(Object other) =>
      other is BlogArenaFreeTime &&
      other.startTime == startTime &&
      other.courtId == courtId;

  @override
  int get hashCode => Object.hash(startTime, courtId);
}

/// Os próximos [max] horários livres de hoje, sem repetir início, com o MESMO
/// predicado da tela de reservar (`isAvailable` + `isPastBookableSlot`, que já
/// cobre o corte de 5 min depois do início). Quadra em manutenção fica fora.
/// Duração mínima e pico continuam sendo da tela de reservar, ao escolher.
List<BlogArenaFreeTime> blogArenaFreeTimes({
  required List<ArenaCourt> courts,
  required Map<String, List<ArenaSlot>> slotsByCourtId,
  required DateTime today,
  required DateTime now,
  int max = 4,
}) {
  final byStart = <String, BlogArenaFreeTime>{};
  for (final court in courts) {
    if (court.isMaintenance) continue;
    for (final slot in slotsByCourtId[court.id] ?? const <ArenaSlot>[]) {
      if (!slot.isAvailable) continue;
      if (isPastBookableSlot(selectedDay: today, slot: slot, now: now)) {
        continue;
      }
      byStart.putIfAbsent(slot.startTime, () => BlogArenaFreeTime(slot: slot));
    }
  }
  final times = byStart.values.toList()
    ..sort(
      (a, b) => slotStartMinutes(
        a.startTime,
      ).compareTo(slotStartMinutes(b.startTime)),
    );
  return times.take(max).toList(growable: false);
}

/// O recorte do ranking do bloco, no formato da tela de ranking: temporada
/// [year], esporte pelo código de perfil, modo e gênero. `null` para esporte
/// que o catálogo deste build não conhece (o bloco some).
RankingPageFilter? blogRankingFilter(
  BlogRankingEmbed block, {
  required int year,
}) {
  final sport = SportCatalog.resolve(block.sport)?.profileCode;
  if (sport == null || sport.isEmpty) return null;
  return RankingPageFilter(
    mode: switch (block.mode) {
      BlogRankingMode.athletes => RankingListMode.athletes,
      BlogRankingMode.teams => RankingListMode.teams,
    },
    year: year,
    gender: switch (block.gender) {
      BlogRankingGender.all => RankingGenderFilter.all,
      BlogRankingGender.masculino => RankingGenderFilter.male,
      BlogRankingGender.feminino => RankingGenderFilter.female,
      BlogRankingGender.misto => RankingGenderFilter.mixed,
    },
    sport: sport,
  );
}
