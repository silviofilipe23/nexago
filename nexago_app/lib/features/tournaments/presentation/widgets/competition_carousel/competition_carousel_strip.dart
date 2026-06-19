import 'package:flutter/material.dart';

import 'package:nexago_app/core/theme/app_theme_colors.dart';

/// Padding horizontal padrão das seções com carrossel de competições.
const competitionCarouselHorizontalPadding = 20.0;

const competitionCarouselHeight = 188.0;
const _edgeFadeWidth = 22.0;

/// Carrossel horizontal até as bordas da tela, com fade suave nas laterais.
class CompetitionCarouselStrip extends StatelessWidget {
  const CompetitionCarouselStrip({
    super.key,
    required this.itemCount,
    required this.itemBuilder,
    this.separatorBuilder,
    this.physics,
    this.height = competitionCarouselHeight,
  });

  final int itemCount;
  final IndexedWidgetBuilder itemBuilder;
  final IndexedWidgetBuilder? separatorBuilder;
  final ScrollPhysics? physics;
  final double height;

  @override
  Widget build(BuildContext context) {
    final fadeColor = context.themeColors.canvas;

    return SizedBox(
      height: height,
      child: Stack(
        fit: StackFit.expand,
        children: [
          ListView.separated(
            scrollDirection: Axis.horizontal,
            physics: physics,
            padding: const EdgeInsets.symmetric(
              horizontal: competitionCarouselHorizontalPadding,
            ),
            itemCount: itemCount,
            separatorBuilder: separatorBuilder ??
                (_, __) => const SizedBox(width: 12),
            itemBuilder: itemBuilder,
          ),
          Positioned(
            left: 0,
            top: 0,
            bottom: 0,
            width: _edgeFadeWidth,
            child: ExcludeSemantics(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerLeft,
                      end: Alignment.centerRight,
                      colors: [
                        fadeColor.withValues(alpha: 0.88),
                        fadeColor.withValues(alpha: 0),
                      ],
                    ),
                  ),
                ),
              ),
            ),
          ),
          Positioned(
            right: 0,
            top: 0,
            bottom: 0,
            width: _edgeFadeWidth,
            child: ExcludeSemantics(
              child: IgnorePointer(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: LinearGradient(
                      begin: Alignment.centerRight,
                      end: Alignment.centerLeft,
                      colors: [
                        fadeColor.withValues(alpha: 0.88),
                        fadeColor.withValues(alpha: 0),
                      ],
                    ),
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
