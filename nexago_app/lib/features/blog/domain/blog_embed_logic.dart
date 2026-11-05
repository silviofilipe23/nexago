/// Regras dos blocos nexaGO (Torneio, Produto) na leitura. O status do
/// torneio sai da lógica que o Competir já usa — aqui só se escolhe o que
/// cabe no card.
library;

import '../../tournaments/domain/tournament_detail_logic.dart';
import '../../tournaments/domain/tournament_detail_model.dart';
import '../../tournaments/domain/tournament_discovery_labels.dart';
import '../../tournaments/domain/tournament_listing_status.dart';

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
