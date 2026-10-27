import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../../core/theme/app_colors.dart';
import '../../../core/theme/app_spacing.dart';
import '../../../core/theme/app_theme.dart';
import '../../../core/theme/app_typography.dart';
import '../../../core/theme/system_ui_overlay_style.dart';
import '../domain/app_news.dart';
import '../domain/app_news_logic.dart';
import 'widgets/app_news_parts.dart';

/// Stories das novidades, uma vez depois de atualizar
/// ([AppNewsStoriesAnnouncer]). Toque à direita avança, à esquerda volta e
/// o X fecha. O botão da funcionalidade fecha devolvendo-a: quem abriu os
/// stories navega com o contexto do shell, que continua vivo.
///
/// Sempre escuro, como stories: a tela inteira é a vitrine.
class AppNewsStoriesPage extends StatefulWidget {
  const AppNewsStoriesPage({super.key, required this.stories});

  final AppNewsStories stories;

  @override
  State<AppNewsStoriesPage> createState() => _AppNewsStoriesPageState();
}

class _AppNewsStoriesPageState extends State<AppNewsStoriesPage> {
  int _index = 0;

  int get _count => widget.stories.features.length;
  bool get _isLast => _index >= _count - 1;

  void _next() {
    if (_isLast) {
      Navigator.of(context).pop();
      return;
    }
    setState(() => _index++);
  }

  void _previous() {
    if (_index > 0) setState(() => _index--);
  }

  @override
  Widget build(BuildContext context) {
    final release = widget.stories.release;
    final feature = widget.stories.features[_index];
    final media = MediaQuery.of(context);

    return Theme(
      data: AppTheme.dark,
      child: AnnotatedRegion<SystemUiOverlayStyle>(
        value: systemUiOverlayForBrightness(Brightness.dark),
        child: Scaffold(
          backgroundColor: AppColors.canvas,
          body: Padding(
            padding: EdgeInsets.only(
              top: media.padding.top + AppSpacing.sm,
              bottom: media.padding.bottom + AppSpacing.lg,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 20),
                  child: Row(
                    children: [
                      for (var k = 0; k < _count; k++) ...[
                        if (k > 0) const SizedBox(width: 4),
                        Expanded(
                          child: AnimatedContainer(
                            duration: const Duration(milliseconds: 200),
                            height: 3,
                            decoration: BoxDecoration(
                              color: k <= _index
                                  ? AppColors.brand
                                  : AppColors.white.withValues(alpha: 0.16),
                              borderRadius: const BorderRadius.all(
                                Radius.circular(99),
                              ),
                            ),
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                Padding(
                  padding: const EdgeInsets.fromLTRB(24, 12, 20, 0),
                  child: Row(
                    children: [
                      Expanded(
                        child: AppNewsKicker(
                          'Novo na ${release.version} · '
                          '${_index + 1} de $_count',
                          color: AppColors.onSurface.withValues(alpha: 0.52),
                        ),
                      ),
                      AppNewsGlassButton(
                        key: const Key('app-news-stories-close'),
                        icon: Icons.close_rounded,
                        label: 'Fechar',
                        onTap: () => Navigator.of(context).pop(),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 14),
                Expanded(
                  child: Stack(
                    children: [
                      AnimatedSwitcher(
                        duration: const Duration(milliseconds: 220),
                        child: _Story(
                          key: ValueKey(feature.id),
                          feature: feature,
                        ),
                      ),
                      // Zonas de toque por cima da imagem e do texto: 35% à
                      // esquerda volta, o resto avança (na última, fecha).
                      Positioned.fill(
                        child: Row(
                          children: [
                            Expanded(
                              flex: 35,
                              child: Semantics(
                                button: true,
                                label: 'Novidade anterior',
                                child: GestureDetector(
                                  key: const Key('app-news-stories-previous'),
                                  behavior: HitTestBehavior.opaque,
                                  onTap: _previous,
                                ),
                              ),
                            ),
                            Expanded(
                              flex: 65,
                              child: Semantics(
                                button: true,
                                label: _isLast
                                    ? 'Fechar novidades'
                                    : 'Próxima novidade',
                                child: GestureDetector(
                                  key: const Key('app-news-stories-next'),
                                  behavior: HitTestBehavior.opaque,
                                  onTap: _next,
                                ),
                              ),
                            ),
                          ],
                        ),
                      ),
                    ],
                  ),
                ),
                const SizedBox(height: 24),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 24),
                  child: Row(
                    children: [
                      if (feature.hasAction) ...[
                        Expanded(
                          child: AppNewsPrimaryButton(
                            key: const Key('app-news-stories-cta'),
                            label: feature.ctaLabel,
                            onTap: () => Navigator.of(context).pop(feature),
                          ),
                        ),
                        const SizedBox(width: 10),
                      ] else
                        const Spacer(),
                      AppNewsOutlinedButton(
                        label: _isLast ? 'Fechar' : 'Próxima',
                        onTap: _next,
                      ),
                    ],
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _Story extends StatelessWidget {
  const _Story({super.key, required this.feature});

  final AppNewsFeature feature;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.stretch,
      children: [
        Expanded(
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 20),
            child: LayoutBuilder(
              builder: (context, constraints) => AppNewsArt(
                feature: feature,
                height: constraints.maxHeight,
                radius: 30,
              ),
            ),
          ),
        ),
        const SizedBox(height: 28),
        Padding(
          padding: const EdgeInsets.symmetric(horizontal: 24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                feature.title,
                style: AppTypography.soraRegular(
                  fontSize: 32,
                  fontWeight: FontWeight.w800,
                  letterSpacing: -0.96,
                  height: 1.05,
                  color: AppColors.onSurface,
                ),
              ),
              if (feature.summary.isNotEmpty) ...[
                const SizedBox(height: 10),
                Text(
                  feature.summary,
                  style: AppTypography.soraRegular(
                    fontSize: 15,
                    fontWeight: FontWeight.w400,
                    height: 1.45,
                    color: AppColors.onSurface.withValues(alpha: 0.72),
                  ),
                ),
              ],
            ],
          ),
        ),
      ],
    );
  }
}
