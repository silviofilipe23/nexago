import 'package:flutter/material.dart';
import 'package:go_router/go_router.dart';

import '../../../../core/theme/app_colors.dart';
import '../../../../core/theme/app_spacing.dart';
import '../../../../core/theme/app_theme_colors.dart';
import '../../../../core/theme/app_typography.dart';
import '../../domain/app_news.dart';
import 'app_news_parts.dart';

/// Corpo do detalhe de uma funcionalidade — o da novidade e o do guia da
/// Central de ajuda: imagem no topo, [header] (selos ou categoria), título,
/// explicação, passos de "Como funciona", onde encontrar e o botão fixo no
/// rodapé (só com destino e [onAction]). Rolada a imagem, um fundo cobre o
/// topo para o texto não passar por baixo do voltar e da barra de status.
class FeatureDetailView extends StatefulWidget {
  const FeatureDetailView({
    super.key,
    required this.feature,
    required this.header,
    this.onAction,
  });

  final AppNewsFeature feature;
  final Widget header;
  final VoidCallback? onAction;

  @override
  State<FeatureDetailView> createState() => _FeatureDetailViewState();
}

class _FeatureDetailViewState extends State<FeatureDetailView> {
  final _scroll = ScrollController();

  @override
  void dispose() {
    _scroll.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final feature = widget.feature;
    final colors = context.themeColors;
    final media = MediaQuery.of(context);
    final artHeight = (media.size.height * 0.44).clamp(280.0, 380.0);
    final bottomInset = media.padding.bottom;
    final action = feature.hasAction ? widget.onAction : null;
    final topBarHeight = media.padding.top + AppSpacing.sm * 2 + 42;

    return Stack(
      children: [
        ListView(
          controller: _scroll,
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
                  widget.header,
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
        // Aparece nos últimos 40 px antes de a imagem sair por baixo do topo.
        Positioned(
          top: 0,
          left: 0,
          right: 0,
          child: IgnorePointer(
            child: AnimatedBuilder(
              animation: _scroll,
              builder: (context, child) {
                final offset = _scroll.hasClients ? _scroll.offset : 0.0;
                final start = artHeight - topBarHeight - 40;
                return Opacity(
                  opacity: ((offset - start) / 40).clamp(0.0, 1.0),
                  child: child,
                );
              },
              child: Container(
                height: topBarHeight,
                decoration: BoxDecoration(
                  color: colors.canvas,
                  border: Border(
                    bottom: BorderSide(
                      color: colors.onSurface.withValues(alpha: 0.06),
                    ),
                  ),
                ),
              ),
            ),
          ),
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
        if (action != null)
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
                    onTap: action,
                  ),
                ),
              ),
            ),
          ),
      ],
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
