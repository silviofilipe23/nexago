import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_logic.dart';
import 'package:nexago_app/features/organizer/domain/tournament_reviews/organizer_tournament_review_models.dart';

import 'tournament_review_models.dart';

/// Exibição pública da avaliação (spec §5): selo do torneio, seção por aspecto e a nota do
/// organizador. Tudo some abaixo de 3 avaliações — um selo de "estreante" seria injusto com quem
/// organizou antes de a feature existir.

/// "★ 4,6 · 23 avaliações", ou `null` sem números públicos.
String? tournamentReviewBadgeLabel(TournamentReviewSummary? summary) {
  if (summary == null || !tournamentReviewHasPublicNumbers(summary)) return null;
  return '★ ${formatTournamentReviewAverage(summary.average!)} · '
      '${tournamentReviewsCountLabel(summary.count)}';
}

/// "★ 4,7 (86 avaliações em 5 torneios)", ou `null` abaixo de 3 avaliações.
String? organizerReputationLabel(OrganizerReputation? reputation) {
  final average = reputation?.average;
  if (reputation == null ||
      average == null ||
      reputation.reviewsCount < kTournamentReviewMinPublic) {
    return null;
  }
  final tournaments = reputation.tournamentsRated == 1
      ? '1 torneio'
      : '${reputation.tournamentsRated} torneios';
  return '★ ${formatTournamentReviewAverage(average)} '
      '(${tournamentReviewsCountLabel(reputation.reviewsCount)} em $tournaments)';
}

class TournamentPublicAspectRow {
  const TournamentPublicAspectRow({required this.aspect, required this.average});

  final TournamentReviewAspect aspect;
  final double average;

  String get label => aspect.label;

  /// "4,8".
  String get valueText => formatTournamentReviewAverage(average);

  /// Largura da barra: média sobre 5.
  double get fraction => (average / 5).clamp(0.0, 1.0);
}

/// Barras da seção "Como os atletas avaliaram": só aspectos com nota, na ordem da lista.
List<TournamentPublicAspectRow> tournamentPublicAspectRows(TournamentReviewSummary? summary) {
  if (summary == null || !tournamentReviewHasPublicNumbers(summary)) return const [];
  final aspects = summary.aspects;
  if (aspects == null) return const [];
  return [
    for (final aspect in TournamentReviewAspect.values)
      if (aspects[aspect] case final stat?)
        TournamentPublicAspectRow(aspect: aspect, average: stat.average),
  ];
}
