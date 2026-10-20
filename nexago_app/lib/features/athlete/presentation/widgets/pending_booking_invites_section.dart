import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/router/routes.dart';
import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';
import '../../domain/booking_invite_links.dart';
import '../../domain/booking_invite_model.dart';
import '../../domain/booking_invite_providers.dart';

/// Home: convites para jogar numa reserva, recebidos e ainda sem resposta.
/// O push leva à mesma tela; aqui é a rede de segurança de quem desligou a
/// notificação. Tocar abre `/convite/:inviteId`, onde aceita ou recusa.
class PendingBookingInvitesSection extends ConsumerWidget {
  const PendingBookingInvitesSection({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final invites =
        ref.watch(pendingBookingInvitesProvider).valueOrNull ?? const [];
    if (invites.isEmpty) return const SizedBox.shrink();
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Row(
          children: [
            Text(
              'Convites para jogar',
              style: theme.textTheme.titleSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            const SizedBox(width: 8),
            Container(
              width: 20,
              height: 20,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.brand,
                shape: BoxShape.circle,
              ),
              child: Text(
                '${invites.length}',
                style: AppTypography.mono(
                  fontSize: 11,
                  fontWeight: FontWeight.w800,
                  color: AppColors.black,
                  height: 1,
                ),
              ),
            ),
          ],
        ),
        const SizedBox(height: 10),
        for (final invite in invites) ...[
          _BookingInviteCard(invite: invite),
          const SizedBox(height: 8),
        ],
      ],
    );
  }
}

class _BookingInviteCard extends StatelessWidget {
  const _BookingInviteCard({required this.invite});

  final BookingInvite invite;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    final from = invite.invitedByName.trim().isEmpty
        ? 'Um atleta'
        : invite.invitedByName.trim();
    final start = DateTime.tryParse('${invite.date}T${invite.startTime}');
    final when = start == null ? invite.date : bookingInviteWhenLabel(start);
    final arena = invite.arenaName.trim().isEmpty ? 'Arena' : invite.arenaName;

    return Material(
      color: colors.surfaceCard,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        borderRadius: BorderRadius.circular(16),
        onTap: () => context.push(
          AppRoutes.bookingInvite.replaceAll(':inviteId', invite.id),
        ),
        child: Container(
          padding: const EdgeInsets.all(14),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.35)),
          ),
          child: Row(
            children: [
              Container(
                width: 40,
                height: 40,
                decoration: BoxDecoration(
                  color: AppColors.brand.withValues(alpha: 0.15),
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  Icons.sports_volleyball_outlined,
                  color: colors.brandText,
                  size: 20,
                ),
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      '$from te chamou para jogar',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: colors.onSurface,
                      ),
                    ),
                    const SizedBox(height: 2),
                    Text(
                      '$arena · $when',
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: theme.textTheme.bodySmall?.copyWith(
                        color: colors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Icon(
                Icons.chevron_right_rounded,
                color: colors.brandText,
              ),
            ],
          ),
        ),
      ),
    );
  }
}
