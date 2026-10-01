import 'package:intl/intl.dart';

import 'tournament_review_models.dart';

const int kTournamentReviewXp = 10;
const int kTournamentReviewCommentMax = 1000;

enum TournamentReviewCtaState { none, pending, submitted, closed }

/// Aberto = não expirou E o prazo não passou. O status sozinho não basta: o job que marca
/// `expired` roda uma vez por dia (e para inteiro com a flag desligada).
bool isTournamentReviewOpen(TournamentReviewInvite invite, DateTime now) =>
    invite.status != TournamentReviewInviteStatus.expired &&
    invite.closesAt.isAfter(now);

TournamentReviewCtaState tournamentReviewCtaState(
  TournamentReviewInvite? invite,
  DateTime now,
) {
  if (invite == null) return TournamentReviewCtaState.none;
  if (!isTournamentReviewOpen(invite, now)) return TournamentReviewCtaState.closed;
  return invite.status == TournamentReviewInviteStatus.submitted
      ? TournamentReviewCtaState.submitted
      : TournamentReviewCtaState.pending;
}

/// Convites para o card da Home: pendentes e abertos, o que fecha antes primeiro.
List<TournamentReviewInvite> openPendingTournamentReviews(
  Iterable<TournamentReviewInvite> invites,
  DateTime now,
) {
  final open = invites
      .where((i) =>
          i.status == TournamentReviewInviteStatus.pending &&
          isTournamentReviewOpen(i, now))
      .toList()
    ..sort((a, b) => a.closesAt.compareTo(b.closesAt));
  return open;
}

/// Mesma regra do push (`functions/src/tournament-review-notifications.ts`): o artigo concorda
/// com a palavra "torneio" — "o Liga nexaGO" e "o Copa VH" saíam errados.
String tournamentReviewLabel(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'torneio';
  return RegExp(r'^torneio\b', caseSensitive: false).hasMatch(trimmed)
      ? trimmed
      : 'torneio $trimmed';
}

String tournamentReviewQuestion(String name) =>
    'Como foi o ${tournamentReviewLabel(name)}?';

String tournamentReviewRatingLabel(int? rating) => switch (rating) {
      1 => 'Péssimo',
      2 => 'Ruim',
      3 => 'Ok',
      4 => 'Bom',
      5 => 'Excelente',
      _ => '',
    };

final _dayMonth = DateFormat('dd/MM', 'pt_BR');

String tournamentReviewDayMonth(DateTime at) => _dayMonth.format(at.toLocal());
