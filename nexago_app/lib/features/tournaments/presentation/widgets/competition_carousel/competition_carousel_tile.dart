import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';
import 'package:intl/intl.dart';

import '../../../../../core/theme/app_colors.dart';
import 'package:nexago_app/core/theme/app_theme_colors.dart';
import '../../../../../core/theme/app_typography.dart';

const competitionCarouselTileWidth = 250.0;
const competitionCarouselImageHeight = 120.0;

class CompetitionCarouselTile extends StatefulWidget {
  const CompetitionCarouselTile({
    super.key,
    required this.title,
    required this.subtitle,
    required this.sortDate,
    required this.imageUrl,
    required this.onTap,
  });

  final String title;
  final String subtitle;
  final DateTime sortDate;
  final String? imageUrl;
  final VoidCallback onTap;

  @override
  State<CompetitionCarouselTile> createState() =>
      _CompetitionCarouselTileState();
}

class _CompetitionCarouselTileState extends State<CompetitionCarouselTile> {
  var _pressed = false;

  void _setPressed(bool value) {
    if (_pressed == value) return;
    setState(() => _pressed = value);
  }

  @override
  Widget build(BuildContext context) {
    final monthLabel = DateFormat(
      'MMM',
      'pt_BR',
    ).format(widget.sortDate).replaceAll('.', '').toUpperCase();
    final dayLabel = DateFormat('d').format(widget.sortDate);

    return SizedBox(
      width: competitionCarouselTileWidth,
      child: GestureDetector(
        onTapDown: (_) => _setPressed(true),
        onTapUp: (_) => _setPressed(false),
        onTapCancel: () => _setPressed(false),
        onTap: widget.onTap,
        behavior: HitTestBehavior.opaque,
        child: AnimatedScale(
          scale: _pressed ? 0.96 : 1,
          duration: const Duration(milliseconds: 150),
          curve: Curves.easeOutCubic,
          alignment: Alignment.center,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              ClipRRect(
                borderRadius: BorderRadius.circular(14),
                child: SizedBox(
                  height: competitionCarouselImageHeight,
                  child: Stack(
                    fit: StackFit.expand,
                    children: [
                      _CoverImage(imageUrl: widget.imageUrl),
                      Positioned(
                        top: 8,
                        left: 8,
                        child: _DateBadge(
                          monthLabel: monthLabel,
                          dayLabel: dayLabel,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              SizedBox(height: 8),
              Text(
                widget.title,
                maxLines: 2,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 14,
                  fontWeight: FontWeight.w800,
                  color: context.themeColors.onSurface,
                  height: 1.2,
                  letterSpacing: -0.2,
                ),
              ),
              SizedBox(height: 2),
              Text(
                widget.subtitle,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: AppTypography.soraRegular(
                  fontSize: 12,
                  fontWeight: FontWeight.w500,
                  color: context.themeColors.onSurfaceMuted,
                  height: 1.2,
                ),
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class CompetitionCarouselTileSkeleton extends StatelessWidget {
  const CompetitionCarouselTileSkeleton({super.key, this.pulse = 0});

  final double pulse;

  @override
  Widget build(BuildContext context) {
    final base = context.themeColors.onSurfaceMuted.withValues(alpha: 0.12);
    final highlight = context.themeColors.onSurfaceMuted.withValues(
      alpha: 0.22,
    );
    final color = Color.lerp(base, highlight, pulse) ?? base;

    return SizedBox(
      width: competitionCarouselTileWidth,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.stretch,
        children: [
          Container(
            height: competitionCarouselImageHeight,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(14),
            ),
          ),
          SizedBox(height: 8),
          Container(
            height: 14,
            width: 140,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
          SizedBox(height: 6),
          Container(
            height: 11,
            width: 88,
            decoration: BoxDecoration(
              color: color,
              borderRadius: BorderRadius.circular(4),
            ),
          ),
        ],
      ),
    );
  }
}

class _DateBadge extends StatelessWidget {
  const _DateBadge({required this.monthLabel, required this.dayLabel});

  final String monthLabel;
  final String dayLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 6),
      decoration: BoxDecoration(
        color: context.themeColors.white.withValues(alpha: 0.96),
        borderRadius: BorderRadius.circular(8),
        boxShadow: [
          BoxShadow(
            color: AppColors.black.withValues(alpha: 0.12),
            blurRadius: 8,
            offset: const Offset(0, 2),
          ),
        ],
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(
            monthLabel,
            style: AppTypography.mono(
              fontSize: 9,
              fontWeight: FontWeight.w700,
              color: AppColors.brand,
              letterSpacing: 0.4,
            ),
          ),
          Text(
            dayLabel,
            style: AppTypography.mono(
              fontSize: 16,
              fontWeight: FontWeight.w800,
              color: AppColors.brand,
              height: 1,
            ),
          ),
        ],
      ),
    );
  }
}

class _CoverImage extends StatelessWidget {
  const _CoverImage({required this.imageUrl});

  final String? imageUrl;

  @override
  Widget build(BuildContext context) {
    final url = imageUrl?.trim();
    if (url != null && url.isNotEmpty) {
      // Decodifica só no tamanho exibido — sem isso a imagem original (ex.:
      // foto de câmera) é decodificada em resolução cheia pra caber num
      // tile de 250x120, custando memória e frames a cada tile que entra
      // em cena.
      final dpr = MediaQuery.devicePixelRatioOf(context);
      return CachedNetworkImage(
        imageUrl: url,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 220),
        memCacheWidth: (competitionCarouselTileWidth * dpr).round(),
        memCacheHeight: (competitionCarouselImageHeight * dpr).round(),
        placeholder: (_, __) => const _CoverPlaceholder(),
        errorWidget: (_, __, ___) => const _CoverPlaceholder(),
      );
    }
    return const _CoverPlaceholder();
  }
}

class _CoverPlaceholder extends StatelessWidget {
  const _CoverPlaceholder();

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topLeft,
          end: Alignment.bottomRight,
          colors: [
            context.themeColors.surfaceCard,
            context.themeColors.surfaceRaised,
          ],
        ),
      ),
      child: Center(
        child: Icon(
          Icons.emoji_events_outlined,
          size: 40,
          color: context.themeColors.onSurfaceMuted.withValues(alpha: 0.45),
        ),
      ),
    );
  }
}
