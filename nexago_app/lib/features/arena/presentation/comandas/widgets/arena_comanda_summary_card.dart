import 'package:flutter/material.dart';
import 'package:nexago_app/core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:nexago_app/core/theme/app_typography.dart';

import '../../../domain/comandas/arena_comanda.dart';
import '../../../domain/comandas/arena_comanda_logic.dart';
import '../../widgets/arena_dashboard_tokens.dart';

class ArenaComandaSummaryCard extends StatelessWidget {
  const ArenaComandaSummaryCard({
    super.key,
    required this.comanda,
  });

  final ArenaComanda comanda;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final openedAt = comanda.openedAt;
    final statusColor = comandaStatusColor(comanda.status);
    final location = comanda.locationLabel ?? comanda.customerName;

    return Container(
      padding: const EdgeInsets.all(18),
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              _TypeIcon(type: comanda.type),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      location,
                      style: theme.textTheme.titleMedium?.copyWith(
                        fontWeight: FontWeight.w800,
                        color: context.themeColors.onSurface,
                      ),
                    ),
                    if (openedAt != null) ...[
                      const SizedBox(height: 4),
                      Text(
                        formatComandaOpenedAtLabel(openedAt),
                        style: theme.textTheme.bodySmall?.copyWith(
                          color: context.themeColors.onSurfaceMuted,
                        ),
                      ),
                    ],
                  ],
                ),
              ),
              _StatusPill(
                label: comandaStatusLabel(comanda.status),
                color: statusColor,
              ),
            ],
          ),
          const SizedBox(height: 20),
          Text(
            formatComandaReais(comanda.totalCents),
            style: theme.textTheme.headlineMedium?.copyWith(
              fontWeight: FontWeight.w900,
              color: AppColors.brand,
              letterSpacing: -0.5,
            ),
          ),
          const SizedBox(height: 6),
          Text(
            formatConsumptionBreakdown(
              rentalCents: comanda.rentalCents,
              consumptionCents: comanda.consumptionCents,
            ),
            style: theme.textTheme.bodyMedium?.copyWith(
              color: context.themeColors.onSurfaceMuted,
              fontWeight: FontWeight.w500,
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: [
              CircleAvatar(
                radius: 16,
                backgroundColor: AppColors.brand.withValues(alpha: 0.18),
                child: Text(
                  customerInitials(comanda.customerName),
                  style: const TextStyle(
                    color: AppColors.brand,
                    fontWeight: FontWeight.w800,
                    fontSize: 12,
                  ),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  comanda.customerName,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.bodyMedium?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ),
              if (comanda.bookingDisplayCode != null &&
                  comanda.bookingDisplayCode!.isNotEmpty)
                Container(
                  padding:
                      const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                  decoration: BoxDecoration(
                    color: AppColors.win.withValues(alpha: 0.14),
                    borderRadius: BorderRadius.circular(999),
                  ),
                  child: Text(
                    comanda.bookingDisplayCode!,
                    style: AppTypography.mono(
                      color: AppColors.win,
                      fontSize: 10,
                      fontWeight: FontWeight.w700,
                    ),
                  ),
                ),
            ],
          ),
        ],
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
      width: 48,
      height: 48,
      decoration: BoxDecoration(
        color: AppColors.brand.withValues(alpha: 0.14),
        borderRadius: BorderRadius.circular(14),
      ),
      child: Icon(icon, color: AppColors.brand, size: 24),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({
    required this.label,
    required this.color,
  });

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
