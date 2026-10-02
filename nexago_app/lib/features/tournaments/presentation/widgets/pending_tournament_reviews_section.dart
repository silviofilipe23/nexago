import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';

import '../../../../core/router/routes.dart';
import '../../domain/tournament_review_logic.dart';
import '../../domain/tournament_review_models.dart';
import '../../domain/tournament_review_providers.dart';

/// "Avalie seus torneios" na Home — um card por convite pendente e aberto, logo abaixo dos
/// convites de dupla recebidos. Some sozinho quando o atleta envia (o convite vira
/// `submitted`) ou quando a janela fecha.
class PendingTournamentReviewsSection extends ConsumerWidget {
  const PendingTournamentReviewsSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final pending =
        ref.watch(pendingTournamentReviewsProvider).valueOrNull ?? const [];
    if (pending.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Text(
          'Avalie seus torneios',
          style:
              theme.textTheme.titleSmall?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
        for (final invite in pending) ...[
          _ReviewInviteCard(invite: invite),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _ReviewInviteCard extends StatelessWidget {
  const _ReviewInviteCard({required this.invite});

  final TournamentReviewInvite invite;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final theme = Theme.of(context);
    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        borderRadius: BorderRadius.circular(14),
        onTap: () => context.pushNamed(
          AppRouteNames.tournamentReview,
          pathParameters: {'tournamentId': invite.tournamentId},
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.45)),
          ),
          child: Row(
            children: [
              const Icon(Icons.star_rounded, color: AppColors.brand),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      tournamentReviewQuestion(invite.tournamentName),
                      style: theme.textTheme.titleSmall
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Leva 10 segundos · fecha em '
                      '${tournamentReviewDayMonth(invite.closesAt)} · +$kTournamentReviewXp XP',
                      style: theme.textTheme.bodySmall
                          ?.copyWith(color: colors.onSurfaceMuted),
                    ),
                  ],
                ),
              ),
              Icon(Icons.chevron_right_rounded, color: colors.onSurfaceMuted),
            ],
          ),
        ),
      ),
    );
  }
}
