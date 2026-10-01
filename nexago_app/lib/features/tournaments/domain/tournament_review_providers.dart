import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../core/auth/auth_providers.dart';
import '../data/tournament_review_service.dart';
import 'tournament_review_logic.dart';
import 'tournament_review_models.dart';

/// Convites pendentes E ainda abertos (card da Home). Quem decide é o `closesAt`, não só o
/// status — o job que marca `expired` roda uma vez por dia.
final pendingTournamentReviewsProvider =
    StreamProvider.autoDispose<List<TournamentReviewInvite>>((ref) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  if (uid.isEmpty) return Stream.value(const []);
  return ref
      .watch(tournamentReviewServiceProvider)
      .watchPendingInvites(uid)
      .map((invites) => openPendingTournamentReviews(invites, DateTime.now()));
});

final tournamentReviewInviteProvider = StreamProvider.autoDispose
    .family<TournamentReviewInvite?, String>((ref, tournamentId) {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  final id = tournamentId.trim();
  if (uid.isEmpty || id.isEmpty) return Stream.value(null);
  return ref.watch(tournamentReviewServiceProvider).watchInvite(uid, id);
});

/// A avaliação do próprio atleta — "Você avaliou ★ N" e o pré-preenchimento da edição. Só lê
/// depois de o convite dizer `submitted`: antes disso o doc não existe e a rule nega.
final myTournamentReviewProvider = FutureProvider.autoDispose
    .family<MyTournamentReview?, String>((ref, tournamentId) async {
  final uid = ref.watch(authProvider).valueOrNull?.uid.trim() ?? '';
  final invite = ref.watch(tournamentReviewInviteProvider(tournamentId)).valueOrNull;
  if (uid.isEmpty ||
      invite == null ||
      invite.status != TournamentReviewInviteStatus.submitted) {
    return null;
  }
  return ref
      .watch(tournamentReviewServiceProvider)
      .fetchMyReview(uid, tournamentId.trim());
});
