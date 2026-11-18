import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import 'package:go_router/go_router.dart';
import 'package:nexago_app/core/router/routes.dart';
import '../../domain/arena_bookings_grouping.dart';
import 'arena_dashboard_tokens.dart';

class ArenaBookingsInsightCard extends StatelessWidget {
  const ArenaBookingsInsightCard({
    super.key,
    required this.insight,
  });

  final ArenaBookingsTodayInsight insight;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final colors = context.themeColors;
    return DecoratedBox(
      decoration: BoxDecoration(
        // Tinta âmbar sobre o card do tema: escuro e claro.
        color: Color.alphaBlend(
          AppColors.pending.withValues(alpha: 0.10),
          colors.surfaceCard,
        ),
        borderRadius: BorderRadius.circular(ArenaDashboardTokens.cardRadius),
        border: Border.all(color: AppColors.pending.withValues(alpha: 0.35)),
      ),
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              insight.message,
              style: theme.textTheme.bodyMedium?.copyWith(
                color: colors.onSurface,
                height: 1.45,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (insight.showPromoCta) ...[
              SizedBox(height: 12),
              InkWell(
                // Ação que existe hoje: ver os horários livres na agenda.
                onTap: () => context.go(AppRoutes.arenaSchedule),
                child: Text(
                  'Ver horários livres na agenda →',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: colors.brandText,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
