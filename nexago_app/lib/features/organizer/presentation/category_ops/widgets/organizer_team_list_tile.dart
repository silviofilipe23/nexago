import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/category_ops/category_ops_models.dart';
import 'organizer_team_dual_avatars.dart';

class OrganizerTeamListTile extends StatelessWidget {
  const OrganizerTeamListTile({
    super.key,
    required this.team,
    required this.rank,
    required this.onTap,
  });

  final OrganizerCategoryTeamRow team;
  final int rank;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final isTopRank = rank <= 3;
    final rankColor = isTopRank
        ? AppColors.brand
        : context.themeColors.onSurfaceMuted.withValues(alpha: 0.55);

    return Material(
      color: context.themeColors.surfaceRaised,
      borderRadius: BorderRadius.circular(14),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(14),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(14),
            border: Border.all(color: AppColors.brand.withValues(alpha: 0.28)),
          ),
          child: Row(
            children: [
              Container(
                width: 20,
                height: 20,
                alignment: Alignment.center,
                decoration: BoxDecoration(
                  color: isTopRank
                      ? AppColors.brand.withValues(alpha: 0.14)
                      : context.themeColors.onSurfaceMuted.withValues(
                          alpha: 0.08,
                        ),
                  borderRadius: BorderRadius.circular(6),
                  border: Border.all(
                    color: rankColor.withValues(alpha: isTopRank ? 0.45 : 0.2),
                  ),
                ),
                child: Text(
                  '$rank',
                  style: AppTypography.mono(
                    fontSize: 8,
                    fontWeight: FontWeight.w800,
                    color: rankColor,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              OrganizerTeamDualAvatars(
                player1: team.player1,
                player2: team.player2,
                overlapRingColor: context.themeColors.surfaceRaised,
              ),
              const SizedBox(width: 12),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      team.displayName,
                      maxLines: 2,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 12,
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                        height: 1.25,
                      ),
                    ),
                    const SizedBox(height: 3),
                    Text(
                      team.subtitle,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        fontSize: 10,
                        fontWeight: FontWeight.w500,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 8),
              Column(
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  _StatusPill(status: team.status),
                  const SizedBox(height: 4),
                  _LgpdPill(team: team),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

/// Aceite do termo de uso de imagem/LGPD registrado na inscrição:
/// verde = todos os atletas, âmbar = parcial, apagado = nenhum (inclui
/// inscrições antigas, feitas antes de o termo existir no fluxo).
class _LgpdPill extends StatelessWidget {
  const _LgpdPill({required this.team});

  final OrganizerCategoryTeamRow team;

  @override
  Widget build(BuildContext context) {
    final muted = context.themeColors.onSurfaceMuted;
    final (bg, fg, icon) = team.lgpdAcceptedByAll
        ? (
            AppColors.win.withValues(alpha: 0.18),
            AppColors.win,
            Icons.verified_user_rounded,
          )
        : team.lgpdPartiallyAccepted
            ? (
                AppColors.pending.withValues(alpha: 0.15),
                AppColors.pending,
                Icons.shield_outlined,
              )
            : (
                muted.withValues(alpha: 0.12),
                muted,
                Icons.shield_outlined,
              );

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 11, color: fg),
          const SizedBox(width: 3),
          Text(
            'LGPD',
            style: AppTypography.mono(
              fontSize: 8,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.status});

  final OrganizerTeamRegistrationStatus status;

  @override
  Widget build(BuildContext context) {
    final (label, bg, fg, icon) = switch (status) {
      OrganizerTeamRegistrationStatus.confirmed => (
        'Pago',
        AppColors.win.withValues(alpha: 0.18),
        AppColors.win,
        Icons.check_rounded,
      ),
      OrganizerTeamRegistrationStatus.pending => (
        '',
        AppColors.pending.withValues(alpha: 0.15),
        AppColors.pending,
        Icons.schedule_rounded,
      ),
      OrganizerTeamRegistrationStatus.waitlist => (
        'Fila',
        context.themeColors.onSurfaceMuted.withValues(alpha: 0.12),
        context.themeColors.onSurfaceMuted,
        Icons.hourglass_bottom_rounded,
      ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(20),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 12, color: fg),
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 10,
              fontWeight: FontWeight.w700,
              color: fg,
            ),
          ),
        ],
      ),
    );
  }
}
