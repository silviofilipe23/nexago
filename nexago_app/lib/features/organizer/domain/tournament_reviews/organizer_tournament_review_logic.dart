import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_logic.dart';
import 'package:nexago_app/features/tournaments/domain/tournament_review_models.dart';

import 'organizer_tournament_review_models.dart';

/// Abaixo disso o resumo não tem média e a rule nega os comentários (`MIN_PUBLIC_REVIEWS`).
const int kTournamentReviewMinPublic = 3;

/// Depois disso o job diário (10h) não abre mais a janela (`REVIEW_LOOKBACK_DAYS`).
const Duration kTournamentReviewLookback = Duration(days: 3);

bool tournamentReviewHasPublicNumbers(TournamentReviewSummary s) =>
    s.count >= kTournamentReviewMinPublic && s.average != null;

/// Uma casa, vírgula — a mesma regra do push de fechamento (fase 1).
String formatTournamentReviewAverage(double value) =>
    value.toStringAsFixed(1).replaceAll('.', ',');

String tournamentReviewsCountLabel(int count) => count == 1 ? '1 avaliação' : '$count avaliações';

String tournamentReviewsResponseRate(TournamentReviewSummary s) =>
    '${s.count} de ${s.eligibleCount} atletas';

/// `status` sozinho não basta: o job que fecha pode atrasar.
bool isTournamentReviewWindowOpen(TournamentReviewSummary s, DateTime now) {
  final closesAt = s.closesAt;
  return s.isOpen && closesAt != null && closesAt.isAfter(now);
}

String tournamentReviewsWindowLabel(TournamentReviewSummary s, DateTime now) =>
    isTournamentReviewWindowOpen(s, now)
        ? 'Aberta até ${tournamentReviewDayMonth(s.closesAt!)}'
        : 'Encerrada';

String tournamentReviewsCollectingText(TournamentReviewSummary s) {
  if (s.eligibleCount == 0) return 'Nenhum atleta ficou apto a avaliar este torneio.';
  return '${s.count} de ${s.eligibleCount} atletas avaliaram. '
      'As notas aparecem a partir de $kTournamentReviewMinPublic avaliações.';
}

/// Subtítulo do card "Avaliações" no hub do torneio.
String organizerReviewsCardSubtitle(TournamentReviewSummary? s) {
  if (s == null) return 'Notas dos atletas depois do torneio';
  if (tournamentReviewHasPublicNumbers(s)) {
    return '${formatTournamentReviewAverage(s.average!)} ★ (${s.count})';
  }
  if (s.eligibleCount == 0) return 'Nenhum atleta apto a avaliar';
  return '${s.count} de ${s.eligibleCount} atletas avaliaram';
}

enum TournamentReviewsEmptyState { notEnded, opening, endedBefore, cancelled }

const _cancelledStatuses = {'cancelled', 'canceled', 'cancelado'};
const _completedStatuses = {'completed', 'concluido', 'concluído'};

/// Sem resumo: o que dizer. Espelha `reviewCandidateReason` (functions): concluído ou `endAt`
/// passado entram no job das 10h por até 3 dias; cancelado nunca entra.
TournamentReviewsEmptyState tournamentReviewsEmptyState(
  Map<String, dynamic> tournament,
  DateTime now,
) {
  final status =
      '${tournament['listingStatus'] ?? tournament['status'] ?? ''}'.trim().toLowerCase();
  if (_cancelledStatuses.contains(status)) return TournamentReviewsEmptyState.cancelled;
  final endAt = _dateOf(tournament['endAt']);
  final endAtPassed = endAt != null && !endAt.isAfter(now);
  DateTime? endedAt;
  if (_completedStatuses.contains(status)) {
    endedAt = _dateOf(tournament['completedAt']) ?? (endAtPassed ? endAt : now);
  } else if (endAtPassed) {
    endedAt = endAt;
  }
  if (endedAt == null) return TournamentReviewsEmptyState.notEnded;
  return now.difference(endedAt) <= kTournamentReviewLookback
      ? TournamentReviewsEmptyState.opening
      : TournamentReviewsEmptyState.endedBefore;
}

String tournamentReviewsEmptyText(TournamentReviewsEmptyState state) => switch (state) {
      TournamentReviewsEmptyState.notEnded => 'A avaliação abre quando o torneio terminar.',
      TournamentReviewsEmptyState.opening =>
        'O torneio terminou. O pedido de avaliação sai para os atletas às 10h.',
      TournamentReviewsEmptyState.endedBefore =>
        'Este torneio terminou antes de as avaliações existirem.',
      TournamentReviewsEmptyState.cancelled => 'Torneio cancelado não recebe avaliações.',
    };

class TournamentReviewAspectRow {
  const TournamentReviewAspectRow({
    required this.aspect,
    required this.average,
    required this.count,
  });

  final TournamentReviewAspect aspect;
  final double average;
  final int count;

  String get label => aspect.label;

  /// "3,4 · 18 notas".
  String get valueText =>
      '${formatTournamentReviewAverage(average)} · ${count == 1 ? '1 nota' : '$count notas'}';

  /// Largura da barra: média sobre 5.
  double get fraction => (average / 5).clamp(0.0, 1.0);
}

/// Do mais fraco ao mais forte; no empate, a ordem da lista.
List<TournamentReviewAspectRow> tournamentReviewAspectRows(
  Map<TournamentReviewAspect, TournamentReviewAspectStat>? aspects,
) {
  if (aspects == null) return const [];
  final rows = [
    for (final aspect in TournamentReviewAspect.values)
      if (aspects[aspect] case final stat?)
        TournamentReviewAspectRow(aspect: aspect, average: stat.average, count: stat.count),
  ];
  rows.sort((a, b) {
    final byAverage = a.average.compareTo(b.average);
    return byAverage != 0 ? byAverage : a.aspect.index.compareTo(b.aspect.index);
  });
  return rows;
}

class TournamentReviewDistributionRow {
  const TournamentReviewDistributionRow({
    required this.stars,
    required this.count,
    required this.fraction,
  });

  final int stars;
  final int count;
  final double fraction;

  String get label => '$stars★';
}

List<TournamentReviewDistributionRow> tournamentReviewDistributionRows(
  Map<int, int>? distribution,
) {
  if (distribution == null) return const [];
  final total = distribution.values.fold<int>(0, (sum, n) => sum + n);
  return [
    for (var stars = 5; stars >= 1; stars--)
      TournamentReviewDistributionRow(
        stars: stars,
        count: distribution[stars] ?? 0,
        fraction: total == 0 ? 0 : (distribution[stars] ?? 0) / total,
      ),
  ];
}

/// Avaliação sem texto entra nos números, mas não vira card.
List<AnonymousTournamentReview> tournamentReviewCommentCards(
  Iterable<AnonymousTournamentReview> reviews, {
  required bool lowOnly,
}) {
  final cards = reviews
      .where((r) => r.comment != null && (!lowOnly || r.overall <= 2))
      .toList()
    ..sort((a, b) => a.shuffleKey.compareTo(b.shuffleKey));
  return cards;
}

String tournamentReviewStars(int overall) => '★' * overall + '☆' * (5 - overall);

List<String> tournamentReviewAspectChips(AnonymousTournamentReview review) => [
      for (final aspect in TournamentReviewAspect.values)
        if (review.aspects[aspect] case final value?) '${aspect.label} $value★',
    ];

DateTime? _dateOf(Object? value) {
  if (value is Timestamp) return value.toDate();
  if (value is DateTime) return value;
  return null;
}
