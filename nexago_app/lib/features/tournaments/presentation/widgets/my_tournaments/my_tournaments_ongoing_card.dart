import 'package:flutter/material.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';
import '../../../domain/my_tournaments_models.dart';
import '../../../domain/tournament_discovery_labels.dart';

class MyTournamentsOngoingCard extends StatelessWidget {
  const MyTournamentsOngoingCard({
    super.key,
    required this.enrollment,
    required this.onTap,
    this.onCancel,
  });

  final MyTournamentEnrollment enrollment;
  final VoidCallback onTap;

  /// Cancela a inscrição (só oferecido quando não há nenhum pagamento).
  final VoidCallback? onCancel;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final statusColor = tournamentStatusColor(enrollment.listingStatus);
    final location = enrollment.locationLine;
    final category = enrollment.categoryLabel;
    final format = enrollment.formatLabel;

    return Padding(
      padding: const EdgeInsets.fromLTRB(20, 0, 20, 10),
      child: Material(
        color: context.themeColors.surfaceCard,
        borderRadius: BorderRadius.circular(16),
        clipBehavior: Clip.antiAlias,
        child: InkWell(
          onTap: onTap,
          child: Ink(
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: enrollment.borderColor.withValues(alpha: 0.65),
                width: enrollment.isLive || enrollment.isEventDay ? 1.5 : 1,
              ),
            ),
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    _Badge(
                      label: 'TORNEIO',
                      icon: Icons.emoji_events_outlined,
                      color: MyTournamentsTokens.gold,
                    ),
                    if (format != null && format.isNotEmpty) ...[
                      SizedBox(width: 6),
                      _Badge(
                        label: format.toUpperCase(),
                        color: context.themeColors.onSurfaceMuted,
                      ),
                    ],
                    const Spacer(),
                    if (enrollment.isLive || enrollment.isEventDay)
                      _StatusPill(
                        label: '• DIA DO EVENTO',
                        color: AppColors.live,
                      )
                    else
                      _StatusPill(
                        label: enrollment.statusChipLabel.toUpperCase(),
                        color: statusColor,
                      ),
                  ],
                ),
                SizedBox(height: 12),
                Text(
                  enrollment.displayName,
                  style: theme.textTheme.titleSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    color: context.themeColors.onSurface,
                  ),
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                ),
                if (location.isNotEmpty) ...[
                  SizedBox(height: 6),
                  Row(
                    children: [
                      Icon(
                        Icons.location_on_outlined,
                        size: 14,
                        color: context.themeColors.onSurfaceMuted,
                      ),
                      SizedBox(width: 4),
                      Expanded(
                        child: Text(
                          location,
                          style: theme.textTheme.bodySmall?.copyWith(
                            color: context.themeColors.onSurfaceMuted,
                          ),
                          maxLines: 2,
                          overflow: TextOverflow.ellipsis,
                        ),
                      ),
                    ],
                  ),
                ],
                if (category != null && category.isNotEmpty) ...[
                  SizedBox(height: 4),
                  Text(
                    category,
                    style: theme.textTheme.bodySmall?.copyWith(
                      color: context.themeColors.onSurfaceMuted,
                      fontWeight: FontWeight.w500,
                    ),
                  ),
                ],
                if (onCancel != null)
                  Align(
                    alignment: Alignment.centerRight,
                    child: TextButton(
                      onPressed: onCancel,
                      style: TextButton.styleFrom(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 8,
                          vertical: 4,
                        ),
                        minimumSize: Size.zero,
                        tapTargetSize: MaterialTapTargetSize.shrinkWrap,
                      ),
                      child: Text(
                        'Cancelar inscrição',
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                          fontWeight: FontWeight.w600,
                        ),
                      ),
                    ),
                  ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Badge extends StatelessWidget {
  const _Badge({
    required this.label,
    this.icon,
    required this.color,
  });

  final String label;
  final IconData? icon;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(6),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          if (icon != null) ...[
            Icon(icon, size: 12, color: color),
            SizedBox(width: 4),
          ],
          Text(
            label,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: color,
              letterSpacing: 0.2,
            ),
          ),
        ],
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(6),
        border: Border.all(color: color.withValues(alpha: 0.5)),
      ),
      child: Text(
        label,
        style: AppTypography.mono(
          fontSize: 9,
          fontWeight: FontWeight.w700,
          color: color,
          letterSpacing: 0.2,
        ),
      ),
    );
  }
}
