import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../core/ui/app_snackbar.dart';
import '../../../athlete/domain/favorites_providers.dart';
import 'arena_dashboard_tokens.dart';
import 'arena_promotions_sheet.dart';

class ArenaDashboardFollowersCard extends StatelessWidget {
  const ArenaDashboardFollowersCard({
    super.key,
    required this.insightsAsync,
    this.arenaId,
  });

  final AsyncValue<ArenaFollowersInsights> insightsAsync;
  final String? arenaId;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return DecoratedBox(
      decoration: ArenaDashboardTokens.cardDecoration(context),
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'Seguidores',
              style: theme.textTheme.titleMedium?.copyWith(
                fontWeight: FontWeight.w800,
                color: context.themeColors.onSurface,
              ),
            ),
            SizedBox(height: 16),
            insightsAsync.when(
              loading: () => SizedBox(
                height: 42,
                child: Align(
                  alignment: Alignment.centerLeft,
                  child: CircularProgressIndicator(strokeWidth: 2),
                ),
              ),
              error: (e, _) => Text(
                'Não foi possível carregar seguidores.',
                style: theme.textTheme.bodyMedium?.copyWith(
                  color: theme.colorScheme.error,
                ),
              ),
              data: (insights) => _FollowersBody(
                insights: insights,
                arenaId: arenaId,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class _FollowersBody extends StatelessWidget {
  const _FollowersBody({
    required this.insights,
    this.arenaId,
  });

  final ArenaFollowersInsights insights;
  final String? arenaId;

  void _comingSoon(BuildContext context, String label) {
    showAppSnackBar(context, '$label em breve.');
  }

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Text(
              '${insights.totalFollowers}',
              style: theme.textTheme.displaySmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.brand,
                height: 1,
              ),
            ),
            SizedBox(width: 12),
            if (insights.qualityBookedPercent > 0)
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
                decoration: BoxDecoration(
                  color: AppColors.win.withValues(alpha: 0.18),
                  borderRadius: BorderRadius.circular(8),
                ),
                child: Text(
                  '${insights.qualityBookedPercent.toStringAsFixed(0)}% já reservaram',
                  style: TextStyle(
                    color: AppColors.win,
                    fontWeight: FontWeight.w700,
                    fontSize: 12,
                  ),
                ),
              ),
          ],
        ),
        SizedBox(height: 8),
        Text(
          '+${insights.growthLastWeek} essa semana • '
          '${insights.activeRecentlyPercent.toStringAsFixed(0)}% ativos recentemente',
          style: theme.textTheme.bodyMedium?.copyWith(
            color: context.themeColors.onSurfaceMuted,
            fontWeight: FontWeight.w500,
          ),
        ),
        SizedBox(height: 18),
        Row(
          children: [
            Expanded(
              child: FilledButton(
                onPressed: arenaId == null || arenaId!.isEmpty
                    ? () => _comingSoon(context, 'Promoções')
                    : () => ArenaPromotionsSheet.show(
                          context,
                          arenaId: arenaId!,
                        ),
                style: FilledButton.styleFrom(
                  backgroundColor: AppColors.brand,
                  foregroundColor: AppColors.black,
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('Promoções'),
              ),
            ),
            SizedBox(width: 10),
            Expanded(
              child: OutlinedButton(
                onPressed: () => _comingSoon(context, 'Criar torneio'),
                style: OutlinedButton.styleFrom(
                  foregroundColor: context.themeColors.onSurface,
                  side: BorderSide(
                    color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.4),
                  ),
                  padding: const EdgeInsets.symmetric(vertical: 14),
                ),
                child: Text('Criar torneio'),
              ),
            ),
          ],
        ),
      ],
    );
  }
}
