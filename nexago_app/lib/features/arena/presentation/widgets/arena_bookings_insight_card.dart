import 'package:flutter/material.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
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
    return DecoratedBox(
      decoration: BoxDecoration(
        color: const Color(0xFF2A2418),
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
                color: context.themeColors.onSurface,
                height: 1.45,
                fontWeight: FontWeight.w500,
              ),
            ),
            if (insight.showPromoCta) ...[
              SizedBox(height: 12),
              InkWell(
                onTap: () {
                  showAppSnackBar(context, 'Criar promoção flash em breve.');
                },
                child: Text(
                  'Criar promoção flash →',
                  style: theme.textTheme.labelLarge?.copyWith(
                    color: AppColors.brand,
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
