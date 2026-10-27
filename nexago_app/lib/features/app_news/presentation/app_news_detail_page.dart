import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../application/app_news_providers.dart';
import 'app_news_navigation.dart';
import 'widgets/app_news_parts.dart';
import 'widgets/feature_detail_view.dart';

/// Detalhe de uma novidade: selo (novo / já usou) e versão sobre o corpo
/// comum ([FeatureDetailView]).
class AppNewsDetailPage extends ConsumerWidget {
  const AppNewsDetailPage({super.key, required this.featureId});

  final String featureId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final view = ref.watch(appNewsProvider);
    final feature = view?.feature(featureId);
    if (view == null || feature == null) {
      final loading = ref.watch(appNewsReleasesProvider).isLoading;
      return Scaffold(
        backgroundColor: colors.canvas,
        body: SafeArea(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenH,
              AppSpacing.sm,
              AppSpacing.screenH,
              0,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                NexaIconSquareButton(
                  icon: Icons.arrow_back_rounded,
                  size: 42,
                  tooltip: 'Voltar',
                  onTap: () => context.pop(),
                ),
                Expanded(
                  child: Center(
                    child: loading
                        ? const CircularProgressIndicator(
                            color: AppColors.brand,
                          )
                        : Text(
                            'Esta novidade não está mais disponível.',
                            style: AppTypography.soraRegular(
                              fontSize: 14,
                              fontWeight: FontWeight.w500,
                              color: colors.onSurfaceMuted,
                            ),
                          ),
                  ),
                ),
              ],
            ),
          ),
        ),
      );
    }

    final release = view.releaseOf(featureId);
    final used =
        ref.watch(appNewsUsedProvider).valueOrNull?.contains(featureId) ??
        false;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: FeatureDetailView(
        feature: feature,
        header: Row(
          children: [
            AppNewsBadge(used ? 'JÁ USOU' : 'NOVO'),
            if (release != null) ...[
              const SizedBox(width: 8),
              AppNewsKicker('v${release.version}'),
            ],
          ],
        ),
        onAction: () => openAppNewsFeature(context, ref, feature),
      ),
    );
  }
}
