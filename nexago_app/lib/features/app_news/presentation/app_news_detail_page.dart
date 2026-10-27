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

/// Detalhe de uma novidade: a imagem da funcionalidade, a explicação, os
/// passos de "Como funciona", onde encontrar no app e o botão fixo no rodapé.
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
    final media = MediaQuery.of(context);
    final artHeight = (media.size.height * 0.44).clamp(280.0, 380.0);
    final bottomInset = media.padding.bottom;

    return Scaffold(
      backgroundColor: colors.canvas,
      body: Stack(
        children: [
          ListView(
            padding: EdgeInsets.only(bottom: 130 + bottomInset),
            children: [
              AppNewsArt(
                feature: feature,
                height: artHeight,
                radius: 0,
                bordered: false,
              ),
              Padding(
                padding: const EdgeInsets.fromLTRB(
                  AppSpacing.screenH,
                  24,
                  AppSpacing.screenH,
                  0,
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Row(
                      children: [
                        AppNewsBadge(used ? 'JÁ USOU' : 'NOVO'),
                        if (release != null) ...[
                          const SizedBox(width: 8),
                          AppNewsKicker('v${release.version}'),
                        ],
                      ],
                    ),
                    const SizedBox(height: 14),
                    Semantics(
                      header: true,
                      child: Text(
                        feature.title,
                        style: AppTypography.soraRegular(
                          fontSize: 30,
                          fontWeight: FontWeight.w800,
                          letterSpacing: -0.9,
                          height: 1.05,
                          color: colors.onSurface,
                        ),
                      ),
                    ),
                    if (feature.detailText.isNotEmpty) ...[
                      const SizedBox(height: 10),
                      Text(
                        feature.detailText,
                        style: AppTypography.soraRegular(
                          fontSize: 15,
                          fontWeight: FontWeight.w400,
                          height: 1.5,
                          color: colors.onSurface.withValues(alpha: 0.72),
                        ),
                      ),
                    ],
                    if (feature.steps.isNotEmpty) ...[
                      const SizedBox(height: 30),
                      const AppNewsKicker('Como funciona'),
                      const SizedBox(height: 14),
                      for (var i = 0; i < feature.steps.length; i++)
                        Padding(
                          padding: EdgeInsets.only(top: i == 0 ? 0 : 16),
                          child: _Step(number: i + 1, text: feature.steps[i]),
                        ),
                    ],
                    if (feature.where.isNotEmpty) ...[
                      const SizedBox(height: 28),
                      _Where(where: feature.where),
                    ],
                  ],
                ),
              ),
            ],
          ),
          Positioned(
            top: media.padding.top + AppSpacing.sm,
            left: AppSpacing.screenH,
            child: AppNewsGlassButton(
              icon: Icons.arrow_back_rounded,
              label: 'Voltar',
              onTap: () => context.pop(),
            ),
          ),
          if (feature.hasAction)
            Positioned(
              left: 0,
              right: 0,
              bottom: 0,
              child: DecoratedBox(
                decoration: BoxDecoration(
                  gradient: LinearGradient(
                    begin: Alignment.topCenter,
                    end: Alignment.bottomCenter,
                    stops: const [0, 0.4],
                    colors: [colors.canvas.withValues(alpha: 0), colors.canvas],
                  ),
                ),
                child: Padding(
                  padding: EdgeInsets.fromLTRB(
                    AppSpacing.screenH,
                    28,
                    AppSpacing.screenH,
                    bottomInset + AppSpacing.lg,
                  ),
                  child: SizedBox(
                    width: double.infinity,
                    child: AppNewsPrimaryButton(
                      key: const Key('app-news-detail-cta'),
                      label: feature.ctaLabel,
                      onTap: () => openAppNewsFeature(context, ref, feature),
                    ),
                  ),
                ),
              ),
            ),
        ],
      ),
    );
  }
}

class _Step extends StatelessWidget {
  const _Step({required this.number, required this.text});

  final int number;
  final String text;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final first = number == 1;
    return Row(
      children: [
        Container(
          width: 32,
          height: 32,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: first ? AppColors.brand : colors.surfaceRaised,
            shape: BoxShape.circle,
          ),
          child: Text(
            '$number',
            style: AppTypography.soraRegular(
              fontSize: 14,
              fontWeight: FontWeight.w800,
              color: first ? appNewsOnBrand : colors.onSurface,
            ),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(
          child: Text(
            text,
            style: AppTypography.soraRegular(
              fontSize: 14.5,
              fontWeight: FontWeight.w400,
              height: 1.4,
              color: colors.onSurface,
            ),
          ),
        ),
      ],
    );
  }
}

class _Where extends StatelessWidget {
  const _Where({required this.where});

  final String where;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: const BorderRadius.all(Radius.circular(18)),
      ),
      child: Row(
        children: [
          Icon(Icons.place_outlined, size: 18, color: colors.onSurfaceMuted),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  'Onde encontrar',
                  style: AppTypography.soraRegular(
                    fontSize: 11.5,
                    fontWeight: FontWeight.w400,
                    color: colors.onSurfaceMuted,
                  ),
                ),
                const SizedBox(height: 2),
                Text(
                  where,
                  style: AppTypography.soraRegular(
                    fontSize: 14,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }
}
