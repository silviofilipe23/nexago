import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/auth/auth_providers.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../athlete/presentation/widgets/athlete_home/athlete_home_section_header.dart';
import '../../domain/tournament_partner_invite.dart';
import '../../domain/tournament_partner_invite_providers.dart';
import '../../domain/tournament_registration_navigation.dart';

/// Cards na Home para convites enviados (aguardando parceiro ou pagamento pendente).
class PendingTournamentInviterInvitesSection extends ConsumerWidget {
  const PendingTournamentInviterInvitesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invitesAsync = ref.watch(ongoingTournamentPartnerInvitesHomeProvider);
    final currentUid = ref.watch(authProvider).valueOrNull?.uid ?? '';

    return invitesAsync.when(
      data: (invites) {
        if (invites.isEmpty) return const SizedBox.shrink();
        final preview = invites.take(3).toList();
        return Column(
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            const AthleteHomeSectionHeader(title: 'Inscrições em andamento'),
            SizedBox(height: 10),
            for (final invite in preview) ...[
              _InviteCard(invite: invite, currentUid: currentUid),
              SizedBox(height: 8),
            ],
          ],
        );
      },
      loading: () => const SizedBox.shrink(),
      error: (_, __) => const SizedBox.shrink(),
    );
  }
}

class _InviteCard extends StatelessWidget {
  const _InviteCard({required this.invite, required this.currentUid});

  final TournamentPartnerInvite invite;
  final String currentUid;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final isInviter = invite.inviterUid == currentUid;
    final partnerName = isInviter ? invite.inviteeName : invite.inviterName;
    final partnerFirst = partnerName.split(' ').first;
    final isPending = invite.isPending;
    final title = isPending ? 'Aguardando $partnerFirst' : 'Pagar inscrição';
    final subtitle = isPending
        ? 'Convite enviado · toque para ver status'
        : '$partnerFirst confirmou · finalize o pagamento';
    final accent = isPending ? AppColors.pending : AppColors.brand;

    return Material(
      color: context.themeColors.surfaceCard,
      borderRadius: BorderRadius.circular(12),
      child: InkWell(
        onTap: () {
          context.pushNamed(
            AppRouteNames.tournamentRegistration,
            pathParameters: {'tournamentId': invite.tournamentId},
            queryParameters: tournamentRegistrationWaitingParams(invite),
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
                  color: accent.withValues(alpha: 0.15),
                  borderRadius: BorderRadius.circular(10),
                ),
                child: Icon(
                  isPending ? Icons.schedule_rounded : Icons.payments_outlined,
                  color: accent,
                ),
              ),
              SizedBox(width: 12),
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
                    SizedBox(height: 2),
                    Text(
                      subtitle,
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
