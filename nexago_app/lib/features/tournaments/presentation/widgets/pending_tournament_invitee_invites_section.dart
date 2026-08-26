import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';

/// Cards na Home para convites de dupla/equipe RECEBIDOS ainda pendentes —
/// espelha o card "Convites de dupla" do painel web. É o par inverso de
/// `PendingTournamentInviterInvitesSection` (convites ENVIADOS, seção
/// "Inscrições em andamento"): aqui o atleta é quem precisa responder.
class PendingTournamentInviteeInvitesSection extends ConsumerWidget {
  const PendingTournamentInviteeInvitesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitesAsync = ref.watch(pendingTournamentPartnerInvitesProvider);

    return invitesAsync.when(
      data: (invites) {
        if (invites.isEmpty) return const SizedBox.shrink();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AthleteHomeSectionHeader(title: 'Convites de dupla'),
            const SizedBox(height: 10),
            for (final invite in invites) ...[
              _InviteeInviteCard(invite: invite),
              const SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _InviteeInviteCard extends StatelessWidget {
  const _InviteeInviteCard({required this.invite});

  final TournamentPartnerInvite invite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final teamName = invite.teamName;
    final title =
        invite.isTeamInvite && teamName != null && teamName.isNotEmpty
            ? '${invite.inviterName} te chamou pra equipe $teamName'
            : '${invite.inviterName} te chamou pra dupla';

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () {
          context.pushNamed(
            AppRouteNames.tournamentPartnerInvite,
            pathParameters: {'inviteId': invite.id},
          );
        },
        borderRadius: BorderRadius.circular(12),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(12),
            border: Border.all(color: context.themeColors.surfaceRaised),
          ),
          child: Row(
            children: [
              Container(
                width: 44,
                height: 44,
                decoration: BoxDecoration(
                  color: AppColors.pending.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: const Icon(
                  Icons.groups_rounded,
                  color: AppColors.pending,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      title,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      'Convite recebido · toque para responder',
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                      ),
                    ),
                  ],
                ),
              ),
              Icon(
                Icons.chevron_right_rounded,
                color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.6),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
