import 'package:flutter/material.dart';

import '../../../../../core/theme/app_borders.dart';
import '../../../../../core/theme/app_colors.dart';
import '../../../../../core/theme/app_motion.dart';
import '../../../../../core/theme/app_radii.dart';
import '../../../../../core/theme/app_spacing.dart';
import '../../../../../core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

/// Escurece a arte como no grid ([CompeteHubMenuCard]).
const ColorFilter _artDim = ColorFilter.mode(
  Color(0xFFA6A6A6),
  BlendMode.multiply,
);

const LinearGradient _scrim = LinearGradient(
  begin: Alignment.topCenter,
  end: Alignment.bottomCenter,
  colors: [Color(0x00000000), Color(0xC7000000), Color(0xF2000000)],
  stops: [0.28, 0.66, 1],
);

/// Card largo com arte do hub Competir (H1 · "Aulas e treinos"): foto na
/// largura inteira, selo opcional no canto e o texto no pé, como os cards do
/// grid. Texto em branco fixo — a arte é escura nos dois temas.
class CompeteHubFeatureCard extends StatefulWidget {
  const CompeteHubFeatureCard({
    super.key,
    required this.imageAsset,
    required this.title,
    required this.description,
    required this.onTap,
    this.badge,
    this.height = 150,
  });

  final String imageAsset;
  final String title;
  final String description;
  final VoidCallback onTap;

  /// Selo laranja no canto ("NOVO").
  final String? badge;
  final double height;

  @override
  State<CompeteHubFeatureCard> createState() => _CompeteHubFeatureCardState();
}

class _CompeteHubFeatureCardState extends State<CompeteHubFeatureCard> {
  bool _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final colors = context.themeColors;
    final badge = widget.badge;

    return SizedBox(
      height: widget.height,
      child: AnimatedScale(
        scale: _pressed ? 0.98 : 1,
        duration: AppMotion.fast,
        curve: AppMotion.curve,
        child: LayoutBuilder(
          builder: (context, constraints) => Material(
            color: colors.surfaceCard,
            clipBehavior: Clip.antiAlias,
            shape: RoundedRectangleBorder(
              borderRadius: AppRadii.lgAll,
              side: AppBorders.baseSide(colors),
            ),
            child: Ink.image(
              image: _imageProvider(context, constraints.maxWidth),
              colorFilter: _artDim,
              fit: BoxFit.cover,
              alignment: const Alignment(0, 0.2),
              child: InkWell(
                onTap: widget.onTap,
                onHighlightChanged: _setPressed,
                child: Stack(
                  fit: StackFit.expand,
                  children: [
                    const DecoratedBox(
                      decoration: BoxDecoration(gradient: _scrim),
                    ),
                    if (badge != null)
                      Positioned(
                        top: AppSpacing.sm + 2,
                        left: AppSpacing.sm + 2,
                        child: Container(
                          height: 20,
                          padding: const EdgeInsets.symmetric(horizontal: 7),
                          decoration: BoxDecoration(
                            color: AppColors.brand,
                            borderRadius: BorderRadius.circular(6),
                          ),
                          alignment: Alignment.center,
                          child: Text(
                            badge,
                            style: AppTypography.mono(
                              fontSize: 9.5,
                              fontWeight: FontWeight.w800,
                              color: const Color(0xFF0A0A0A),
                            ).copyWith(letterSpacing: 0.8),
                          ),
                        ),
                      ),
                    Padding(
                      padding: const EdgeInsets.all(AppSpacing.md + 2),
                      child: Column(
                        mainAxisAlignment: MainAxisAlignment.end,
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            widget.title,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: AppTypography.titleS.copyWith(
                              color: AppColors.white,
                              height: 1.15,
                            ),
                          ),
                          const SizedBox(height: AppSpacing.xs),
                          Row(
                            crossAxisAlignment: CrossAxisAlignment.end,
                            children: [
                              Expanded(
                                child: Text(
                                  widget.description,
                                  maxLines: 2,
                                  overflow: TextOverflow.ellipsis,
                                  style: AppTypography.bodyS.copyWith(
                                    fontSize: 11,
                                    height: 1.3,
                                    color: AppColors.white.withValues(
                                      alpha: 0.74,
                                    ),
                                  ),
                                ),
                              ),
                              const SizedBox(width: AppSpacing.sm),
                              const Icon(
                                Icons.arrow_forward_rounded,
                                size: 17,
                                color: AppColors.white,
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
          ),
        ),
      ),
    );
  }

  /// Decodifica no tamanho em que aparece (ver [CompeteHubMenuCard]).
  ImageProvider _imageProvider(BuildContext context, double maxWidth) {
    final base = AssetImage(widget.imageAsset);
    if (!maxWidth.isFinite || maxWidth <= 0) return base;
    final width = (maxWidth * MediaQuery.devicePixelRatioOf(context)).round();
    return ResizeImage(base, width: width, allowUpscaling: false);
  }
}
