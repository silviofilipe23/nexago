import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../../core/router/routes.dart';
import '../../../../../core/ui/explore_card.dart';
import '../../../domain/tournament_review_logic.dart';
import '../../../domain/tournament_review_providers.dart';

/// Botão da avaliação no detalhe do torneio e na campanha do atleta. Some para quem não tem
/// convite; pede, deixa editar ou avisa que encerrou conforme [tournamentReviewCtaState].
class TournamentReviewCta extends ConsumerWidget {
  const TournamentReviewCta({
    super.key,
    required this.tournamentId,
    this.padding = EdgeInsets.zero,
  });

  final String tournamentId;
  final EdgeInsetsGeometry padding;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invite =
        ref.watch(tournamentReviewInviteProvider(tournamentId)).valueOrNull;
    final state = tournamentReviewCtaState(invite, DateTime.now());
    if (invite == null || state == TournamentReviewCtaState.none) {
      return const SizedBox.shrink();
    }
    final closes = tournamentReviewDayMonth(invite.closesAt);
    void open() => context.pushNamed(
          AppRouteNames.tournamentReview,
          pathParameters: {'tournamentId': tournamentId},
        );

    final Widget card;
    switch (state) {
      case TournamentReviewCtaState.pending:
        card = ExploreCard(
          icon: Icons.star_outline_rounded,
          title: 'Avaliar torneio',
          subtitle:
              'Leva 10 segundos · fecha em $closes · +$kTournamentReviewXp XP',
          onTap: open,
        );
      case TournamentReviewCtaState.submitted:
        final overall = ref
            .watch(myTournamentReviewProvider(tournamentId))
            .valueOrNull
            ?.overall;
        card = ExploreCard(
          icon: Icons.star_rounded,
          title: overall == null
              ? 'Você avaliou este torneio'
              : 'Você avaliou ★ $overall · Editar',
          subtitle: 'Dá pra editar até $closes',
          onTap: open,
        );
      case TournamentReviewCtaState.closed:
      case TournamentReviewCtaState.none:
        card = ExploreCard(
          icon: Icons.star_outline_rounded,
          title: 'Avaliação encerrada em $closes',
          subtitle: 'A nota deste torneio já fechou.',
          enabled: false,
          onTap: () {},
        );
    }
    return Padding(padding: padding, child: card);
  }
}
