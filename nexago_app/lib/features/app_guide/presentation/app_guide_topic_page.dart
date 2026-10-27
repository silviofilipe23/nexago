import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../../app_news/presentation/app_news_navigation.dart';
import '../../app_news/presentation/widgets/app_news_parts.dart';
import '../../app_news/presentation/widgets/feature_detail_view.dart';
import '../application/app_guide_providers.dart';
import '../domain/app_guide.dart';

/// Um guia da Central de ajuda: a categoria sobre o mesmo corpo do detalhe
/// das Novidades ([FeatureDetailView]); o botão abre a função.
class AppGuideTopicPage extends ConsumerWidget {
  const AppGuideTopicPage({super.key, required this.topicId});

  final String topicId;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final guide = ref.watch(appGuideProvider);
    final entry = findAppGuideTopic(guide.valueOrNull ?? const [], topicId);

    if (entry == null) {
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
                    child: guide.isLoading
                        ? const CircularProgressIndicator(
                            color: AppColors.brand,
                          )
                        : Text(
                            'Este guia não está mais disponível.',
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

    return Scaffold(
      backgroundColor: colors.canvas,
      body: FeatureDetailView(
        feature: entry.topic,
        header: AppNewsBadge(entry.category.title.toUpperCase()),
        onAction: () => openFeatureDestination(context, ref, entry.topic),
      ),
    );
  }
}
