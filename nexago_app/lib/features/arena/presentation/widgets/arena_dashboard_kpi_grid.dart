import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../domain/arena_dashboard_period_metrics.dart';
import 'arena_dashboard_tokens.dart';

/// KPIs em grade 2×N (dark NexaGO).
///
/// Normalmente são 4 (Faturamento, Ocupação, Reservas, Pico), mas quem não lê
/// a área financeira não recebe o item de Faturamento (ver
/// `ArenaDashboardPage`) — a grade precisa acomodar 3 itens também, sem sobrar
/// espaço vazio nem estourar índice.
class ArenaDashboardKpiGrid extends StatelessWidget {
  const ArenaDashboardKpiGrid({
    super.key,
    required this.items,
  });

  final List<ArenaDashboardKpiItem> items;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final rows = <Widget>[];
    for (var i = 0; i < items.length; i += 2) {
      if (i > 0) rows.add(const SizedBox(height: 12));
      final hasSecond = i + 1 < items.length;
      rows.add(
        IntrinsicHeight(
          child: Row(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Expanded(child: _KpiTile(item: items[i], theme: theme)),
              if (hasSecond) ...[
                const SizedBox(width: 12),
                Expanded(child: _KpiTile(item: items[i + 1], theme: theme)),
              ],
            ],
          ),
        ),
      );
    }
    return Column(
      mainAxisSize: MainAxisSize.min,
      children: rows,
    );
  }
}

class ArenaDashboardKpiItem {
  const ArenaDashboardKpiItem({
    required this.label,
    required this.value,
    required this.icon,
    this.badge,
  });

  final String label;
  final String value;
  final IconData icon;
  final ArenaDashboardKpiBadge? badge;
}

class _KpiTile extends StatelessWidget {
  const _KpiTile({
    required this.item,
    required this.theme,
  });

  final ArenaDashboardKpiItem item;
  final ThemeData theme;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.fromLTRB(16, 16, 16, 18),
        child: Stack(
          children: [
            if (item.badge != null)
              Positioned(
                top: 0,
                right: 0,
                child: _KpiBadgeChip(badge: item.badge!),
              ),
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 40,
                  height: 40,
                  decoration: BoxDecoration(
                    color: AppColors.brand.withValues(alpha: 0.15),
                    borderRadius: BorderRadius.circular(10),
                  ),
                  child: Icon(item.icon, color: AppColors.brand, size: 20),
                ),
                const SizedBox(height: 12),
                Text(
                  item.label.toUpperCase(),
                  style: theme.textTheme.labelSmall?.copyWith(
                    color: context.themeColors.onSurfaceMuted,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 0.6,
                    height: 1.2,
                  ),
                ),
                SizedBox(height: 6),
                Text(
                  item.value,
                  maxLines: 2,
                  overflow: TextOverflow.ellipsis,
                  style: theme.textTheme.headlineSmall?.copyWith(
                    fontWeight: FontWeight.w800,
                    letterSpacing: -0.6,
                    height: 1.05,
                    color: context.themeColors.onSurface,
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _KpiBadgeChip extends StatelessWidget {
  const _KpiBadgeChip({required this.badge});

  final ArenaDashboardKpiBadge badge;

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = switch (badge.tone) {
      ArenaDashboardKpiBadgeTone.positive => (
          AppColors.win.withValues(alpha: 0.18),
          AppColors.win,
        ),
      ArenaDashboardKpiBadgeTone.negative => (
          AppColors.live.withValues(alpha: 0.18),
          AppColors.live,
        ),
      ArenaDashboardKpiBadgeTone.neutral => (
          context.themeColors.surfaceRaised,
          context.themeColors.onSurfaceMuted,
        ),
    };

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(8),
      ),
      child: Text(
        badge.label,
        style: TextStyle(
          color: fg,
          fontSize: 11,
          fontWeight: FontWeight.w700,
        ),
      ),
    );
  }
}
