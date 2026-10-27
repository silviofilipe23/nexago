import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../../../core/router/routes.dart';
import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme_colors.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/ui/nexa_icon_square_button.dart';
import '../application/app_news_providers.dart';
import '../domain/app_news.dart';
import '../domain/app_news_logic.dart';
import 'app_news_navigation.dart';
import 'widgets/app_news_parts.dart';

/// Novidades do app: a funcionalidade principal da versão em destaque (botão
/// que abre e "Como funciona"), as demais em lista com "Já usou", depois as
/// melhorias e as versões anteriores. Entrada pela Home ("Novidades no app")
/// e pelos Ajustes do perfil.
class AppNewsPage extends ConsumerWidget {
  const AppNewsPage({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final view = ref.watch(appNewsProvider);
    final loading = ref.watch(appNewsReleasesProvider).isLoading;
    final used = ref.watch(appNewsUsedProvider).valueOrNull ?? const {};

    return Scaffold(
      backgroundColor: colors.canvas,
      body: SafeArea(
        bottom: false,
        child: view == null
            ? _Empty(loading: loading)
            : _NewsList(view: view, used: used),
      ),
    );
  }
}

void _openDetail(BuildContext context, AppNewsFeature feature) =>
    context.pushNamed(
      AppRouteNames.appNewsDetail,
      pathParameters: {'featureId': feature.id},
    );

class _BackButton extends StatelessWidget {
  const _BackButton();

  @override
  Widget build(BuildContext context) => Align(
    alignment: Alignment.centerLeft,
    child: NexaIconSquareButton(
      icon: Icons.arrow_back_rounded,
      size: 42,
      tooltip: 'Voltar',
      onTap: () => context.pop(),
    ),
  );
}

class _Empty extends StatelessWidget {
  const _Empty({required this.loading});

  final bool loading;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Padding(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        0,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          const _BackButton(),
          Expanded(
            child: Center(
              child: loading
                  ? const CircularProgressIndicator(color: AppColors.brand)
                  : Text(
                      'Sem novidades por enquanto.',
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
    );
  }
}

class _NewsList extends ConsumerWidget {
  const _NewsList({required this.view, required this.used});

  final AppNewsView view;
  final Set<String> used;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final colors = context.themeColors;
    final release = view.current;
    final hero = release.features.first;
    final rest = release.features.skip(1).toList(growable: false);
    final unused = appNewsUnusedCount(release, used);

    return ListView(
      padding: EdgeInsets.fromLTRB(
        AppSpacing.screenH,
        AppSpacing.sm,
        AppSpacing.screenH,
        MediaQuery.paddingOf(context).bottom + 40,
      ),
      children: [
        const _BackButton(),
        const SizedBox(height: 22),
        Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  AppNewsKicker(
                    'Versão ${release.version} · '
                    '${appNewsShortDate(release.date)}',
                  ),
                  const SizedBox(height: 8),
                  Semantics(
                    header: true,
                    child: Text(
                      'Novidades',
                      style: AppTypography.soraRegular(
                        fontSize: 32,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.96,
                        height: 1,
                        color: colors.onSurface,
                      ),
                    ),
                  ),
                ],
              ),
            ),
            if (unused > 0) ...[
              const SizedBox(width: 12),
              AppNewsBadge(unused == 1 ? '1 NOVA' : '$unused NOVAS'),
            ],
          ],
        ),
        const SizedBox(height: 24),
        _HeroCard(
          feature: hero,
          used: used.contains(hero.id),
          onOpen: () => openAppNewsFeature(context, ref, hero),
          onDetail: () => _openDetail(context, hero),
        ),
        if (rest.isNotEmpty) ...[
          const SizedBox(height: 32),
          const AppNewsKicker('Também nesta versão'),
          const SizedBox(height: 12),
          for (final f in rest) ...[
            AppNewsFeatureRow(
              feature: f,
              used: used.contains(f.id),
              onTap: () => _openDetail(context, f),
            ),
            if (f != rest.last) const SizedBox(height: 10),
          ],
        ],
        if (release.improvements.isNotEmpty) ...[
          const SizedBox(height: 32),
          const AppNewsKicker('Melhorias'),
          const SizedBox(height: 12),
          _Improvements(items: release.improvements),
        ],
        if (view.previous.isNotEmpty) ...[
          const SizedBox(height: 32),
          const AppNewsKicker('Versões anteriores'),
          const SizedBox(height: 12),
          for (final r in view.previous) ...[
            _PreviousRelease(release: r),
            if (r != view.previous.last) const SizedBox(height: 8),
          ],
        ],
      ],
    );
  }
}

class _HeroCard extends StatelessWidget {
  const _HeroCard({
    required this.feature,
    required this.used,
    required this.onOpen,
    required this.onDetail,
  });

  final AppNewsFeature feature;
  final bool used;
  final VoidCallback onOpen;
  final VoidCallback onDetail;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    const radius = BorderRadius.all(Radius.circular(28));
    return Material(
      color: colors.surfaceRaised,
      borderRadius: radius,
      clipBehavior: Clip.antiAlias,
      child: InkWell(
        key: Key('app-news-hero-${feature.id}'),
        onTap: onDetail,
        child: Padding(
          padding: const EdgeInsets.all(14),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              AppNewsArt(feature: feature, height: 180, radius: 20),
              Padding(
                padding: const EdgeInsets.fromLTRB(6, 18, 6, 4),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    AppNewsBadge(used ? 'JÁ USOU' : 'NOVO'),
                    const SizedBox(height: 12),
                    Text(
                      feature.title,
                      style: AppTypography.soraRegular(
                        fontSize: 24,
                        fontWeight: FontWeight.w800,
                        letterSpacing: -0.6,
                        height: 1.1,
                        color: colors.onSurface,
                      ),
                    ),
                    if (feature.summary.isNotEmpty) ...[
                      const SizedBox(height: 6),
                      Text(
                        feature.summary,
                        style: AppTypography.soraRegular(
                          fontSize: 14,
                          fontWeight: FontWeight.w400,
                          height: 1.45,
                          color: colors.onSurfaceMuted,
                        ),
                      ),
                    ],
                    const SizedBox(height: 18),
                    Row(
                      children: [
                        if (feature.hasAction) ...[
                          Expanded(
                            child: AppNewsPrimaryButton(
                              key: Key('app-news-hero-cta-${feature.id}'),
                              label: feature.ctaLabel,
                              onTap: onOpen,
                            ),
                          ),
                          const SizedBox(width: 10),
                        ],
                        AppNewsOutlinedButton(
                          label: 'Como funciona',
                          onTap: onDetail,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _Improvements extends StatelessWidget {
  const _Improvements({required this.items});

  final List<String> items;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
      decoration: BoxDecoration(
        color: colors.surfaceRaised,
        borderRadius: const BorderRadius.all(Radius.circular(22)),
      ),
      child: Column(
        children: [
          for (var i = 0; i < items.length; i++)
            Container(
              padding: const EdgeInsets.symmetric(vertical: 13),
              decoration: BoxDecoration(
                border: i == 0
                    ? null
                    : Border(
                        top: BorderSide(
                          color: colors.onSurface.withValues(alpha: 0.06),
                        ),
                      ),
              ),
              child: Row(
                children: [
                  Icon(Icons.bolt_rounded, size: 16, color: colors.brandText),
                  const SizedBox(width: 12),
                  Expanded(
                    child: Text(
                      items[i],
                      style: AppTypography.soraRegular(
                        fontSize: 13.5,
                        fontWeight: FontWeight.w400,
                        height: 1.35,
                        color: colors.onSurface,
                      ),
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

/// Uma versão anterior: número, data e tudo o que entrou nela — sempre
/// aberta, sem toque para expandir.
class _PreviousRelease extends StatelessWidget {
  const _PreviousRelease({required this.release});

  final AppNewsRelease release;

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final mutedStyle = AppTypography.soraRegular(
      fontSize: 12,
      fontWeight: FontWeight.w400,
      height: 1.4,
      color: colors.onSurfaceMuted,
    );

    return Container(
      key: Key('app-news-version-${release.version}'),
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        borderRadius: const BorderRadius.all(Radius.circular(18)),
        border: Border.all(color: colors.onSurface.withValues(alpha: 0.07)),
      ),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          ConstrainedBox(
            constraints: const BoxConstraints(minWidth: 44),
            child: Padding(
              padding: const EdgeInsets.only(top: 2),
              child: Text(
                release.version,
                style: AppTypography.mono(
                  fontSize: 12,
                  fontWeight: FontWeight.w700,
                  color: colors.onSurface,
                ),
              ),
            ),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  appNewsLongDate(release.date),
                  style: AppTypography.soraRegular(
                    fontSize: 13.5,
                    fontWeight: FontWeight.w600,
                    color: colors.onSurface,
                  ),
                ),
                for (final f in release.features) ...[
                  const SizedBox(height: 10),
                  Text(
                    f.title,
                    style: AppTypography.soraRegular(
                      fontSize: 13,
                      fontWeight: FontWeight.w600,
                      height: 1.3,
                      color: colors.onSurface,
                    ),
                  ),
                  if (f.summary.isNotEmpty) ...[
                    const SizedBox(height: 2),
                    Text(f.summary, style: mutedStyle),
                  ],
                ],
                if (release.improvements.isNotEmpty) ...[
                  const SizedBox(height: 8),
                  for (final item in release.improvements)
                    Padding(
                      padding: const EdgeInsets.only(top: 4),
                      child: Row(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text('•  ', style: mutedStyle),
                          Expanded(child: Text(item, style: mutedStyle)),
                        ],
                      ),
                    ),
                ],
              ],
            ),
          ),
        ],
      ),
    );
  }
}
