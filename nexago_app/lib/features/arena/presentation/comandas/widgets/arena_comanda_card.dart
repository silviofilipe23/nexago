import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/comandas/arena_comanda.dart';
import '../../../domain/comandas/arena_comanda_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaComandaCard extends StatelessWidget {
  const ArenaComandaCard({
    super.key,
    required this.comanda,
    required this.onTap,
  });

  final ArenaComanda comanda;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final openedAt = comanda.openedAt;
    final statusColor = comandaStatusColor(comanda.status);
    final showPartial = comanda.status == ArenaComandaStatus.partiallyPaid;
    final title = comandaListTitle(comanda);

    return Material(
      color: Colors.transparent,
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        child: Container(
          padding: const EdgeInsets.all(16),
          decoration: ArenaDashboardTokens.cardDecoration(context),
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.center,
            children: [
              _TypeIcon(type: comanda.type),
              const SizedBox(width: 10),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        Expanded(
                          child: Text(
                            title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: theme.textTheme.titleMedium?.copyWith(
                              fontWeight: FontWeight.w800,
                              color: context.themeColors.onSurface,
                              fontSize: 17,
                              letterSpacing: -0.2,
                            ),
                          ),
                        ),
                        const SizedBox(width: 8),
                        Text(
                          formatComandaNumber(comanda.displayNumber),
                          style: AppTypography.mono(
                            color: context.themeColors.onSurfaceMuted,
                            fontSize: 12,
                            fontWeight: FontWeight.w600,
                          ),
                        ),
                      ],
                    ),
                    const SizedBox(height: 5),
                    Text(
                      comandaListSubtitle(comanda),
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: AppTypography.soraRegular(
                        color: context.themeColors.onSurfaceMuted,
                        fontWeight: FontWeight.w500,
                        fontSize: 11,
                      ),
                    ),
                    const SizedBox(height: 12),
                    Row(
                      children: [
                        _StatusPill(
                          label: comandaStatusLabel(comanda.status),
                          color: statusColor,
                        ),
                        if (openedAt != null) ...[
                          const SizedBox(width: 10),
                          Expanded(
                            child: Text(
                              formatComandaOpenedSince(openedAt),
                              maxLines: 1,
                              overflow: TextOverflow.ellipsis,
                              style: theme.textTheme.bodySmall?.copyWith(
                                color: context.themeColors.onSurfaceMuted,
                                fontSize: 9,
                              ),
                            ),
                          ),
                        ],
                      ],
                    ),
                  ],
                ),
              ),
              const SizedBox(width: 12),
              Column(
                mainAxisSize: MainAxisSize.min,
                crossAxisAlignment: CrossAxisAlignment.end,
                children: [
                  if (showPartial)
                    Text(
                      formatComandaReais(comanda.totalCents ~/ 2),
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: AppColors.pending,
                        fontSize: 14,
                      ),
                    ),
                  Text(
                    showPartial
                        ? '/ ${formatComandaReais(comanda.totalCents)}'
                        : formatComandaReais(comanda.totalCents),
                    style: theme.textTheme.titleLarge?.copyWith(
                      fontWeight: FontWeight.w800,
                      color: showPartial
                          ? context.themeColors.onSurfaceMuted
                          : context.themeColors.onSurface,
                      fontSize: showPartial ? 13 : 17,
                      letterSpacing: -0.5,
                      height: 1.1,
                    ),
                  ),
                  const SizedBox(height: 6),
                  Icon(
                    Icons.chevron_right_rounded,
                    color: context.themeColors.onSurfaceMuted.withValues(
                      alpha: 0.7,
                    ),
                    size: 22,
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _TypeIcon extends StatelessWidget {
  const _TypeIcon({required this.type});

  final ArenaComandaType type;

  @override
  Widget build(BuildContext context) {
    final icon = switch (type) {
      ArenaComandaType.shared => Icons.groups_rounded,
      ArenaComandaType.individual => Icons.person_outline_rounded,
      ArenaComandaType.table => Icons.table_bar_rounded,
      ArenaComandaType.event => Icons.emoji_events_outlined,
    };

    return Container(
      width: 36,
      height: 36,
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(10),
      ),
      child: Icon(icon, color: AppColors.brand, size: 18),
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
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.16),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Row(
        mainAxisSize: MainAxisSize.min,
        children: [
          Container(
            width: 6,
            height: 6,
            decoration: BoxDecoration(color: color, shape: BoxShape.circle),
          ),
          const SizedBox(width: 6),
          Text(
            label,
            style: AppTypography.mono(
              color: color,
              fontSize: 10,
              fontWeight: FontWeight.w700,
              letterSpacing: 0.5,
            ),
          ),
        ],
      ),
    );
  }
}
